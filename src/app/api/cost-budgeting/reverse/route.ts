import { supabase } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import Anthropic from "@anthropic-ai/sdk";
import { logUsage } from "@/lib/usage-tracker";

const anthropic = new Anthropic();
const EXTRACT_MODEL = "claude-haiku-4-5";

// Fetches a single product page and asks the model to pull out a price.
// Best-effort: bot-protected sites (Amazon, noon, etc.) may block the fetch
// entirely or return a CAPTCHA page — reported back as a per-link failure
// rather than thrown, so one bad link doesn't kill the whole batch.
async function fetchAndExtract(url: string, category: string) {
  let html: string;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36" },
    });
    clearTimeout(timeout);
    if (!resp.ok) return { url, ok: false, error: `HTTP ${resp.status}` };
    html = await resp.text();
  } catch (err) {
    return { url, ok: false, error: err instanceof Error ? err.message : "Fetch failed" };
  }

  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 12000);

  if (!text) return { url, ok: false, error: "Empty page" };

  let hostname = url;
  try { hostname = new URL(url).hostname.replace(/^www\./, ""); } catch { /* keep raw url */ }

  const resp = await anthropic.messages.create({
    model: EXTRACT_MODEL,
    max_tokens: 300,
    messages: [{
      role: "user",
      content: `Extract the main product's price from this webpage text (category context: "${category || "unspecified"}").
Return ONLY strict JSON, no markdown fences: {"found":true|false,"itemName":string,"packaging":string,"price":number,"currency":string}
If no clear single product price is present, return {"found":false}.

WEBPAGE TEXT:
${text}`,
    }],
  });
  logUsage("Cost/Budgeting Reverse - Link Extract", EXTRACT_MODEL, resp.usage.input_tokens, resp.usage.output_tokens);

  const raw = resp.content[0].type === "text" ? resp.content[0].text : "";
  try {
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    if (!parsed.found) return { url, ok: false, error: "No price found on page" };
    return {
      url, ok: true, hostname,
      itemName: parsed.itemName || "", packaging: parsed.packaging || "",
      price: Number(parsed.price) || 0, currency: (parsed.currency || "USD").toUpperCase(),
    };
  } catch {
    return { url, ok: false, error: "Could not parse a price from this page" };
  }
}

// Reverse Costing: given an observed competitor retail price, work backward
// to what it must have cost at various assumed retail-margin scenarios
// (margin = % of the SELLING price, not markup-on-cost — confirmed against
// Hafeez's real comparison sheets: implied cost = price × (1 - margin%)).
// Optionally goes one layer deeper to an estimated FOB by also stripping out
// freight/duty/clearance (duty is charged on the CIF value, i.e. FOB+freight,
// so this is solved algebraically, not a flat subtraction — see route logic).

export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const id = url.searchParams.get("id");

    if (id) {
      const { data: sheet, error: sErr } = await supabase.from("cb_reverse_sheets").select("*").eq("id", id).single();
      if (sErr) throw sErr;
      const { data: entries, error: eErr } = await supabase.from("cb_reverse_entries").select("*").eq("sheet_id", id).order("sort_order");
      if (eErr) throw eErr;
      return Response.json({ sheet, entries: entries ?? [] });
    }

    const { data, error } = await supabase.from("cb_reverse_sheets").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return Response.json({ sheets: data ?? [] });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();

    if (body.action === "create-sheet") {
      const { data, error } = await supabase
        .from("cb_reverse_sheets")
        .insert({ title: body.title || "Untitled Comparison", category: body.category || null, created_by: session.id })
        .select("id")
        .single();
      if (error) throw error;
      return Response.json({ ok: true, id: data.id });
    }

    if (body.action === "update-sheet" && body.id) {
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (body.title !== undefined) updates.title = body.title;
      if (body.category !== undefined) updates.category = body.category;
      if (body.marginScenarios !== undefined) updates.margin_scenarios = body.marginScenarios;
      if (body.showFobBreakdown !== undefined) updates.show_fob_breakdown = body.showFobBreakdown;
      if (body.targetLinks !== undefined) updates.target_links = body.targetLinks;
      if (body.targetCountry !== undefined) updates.target_country = body.targetCountry;
      if (body.targetCategory !== undefined) updates.target_category = body.targetCategory;
      const { error } = await supabase.from("cb_reverse_sheets").update(updates).eq("id", body.id);
      if (error) throw error;
      return Response.json({ ok: true });
    }

    if (body.action === "delete-sheet" && body.id) {
      const { error } = await supabase.from("cb_reverse_sheets").delete().eq("id", body.id);
      if (error) throw error;
      return Response.json({ ok: true });
    }

    if (body.action === "add-entry" && body.sheetId) {
      const { count } = await supabase.from("cb_reverse_entries").select("id", { count: "exact", head: true }).eq("sheet_id", body.sheetId);
      const { data, error } = await supabase
        .from("cb_reverse_entries")
        .insert({
          sheet_id: body.sheetId, item_name: "New item", packaging: "", weight_desc: "", forum: "",
          country: "", price_local: 0, currency: "USD", fx_rate: 1, is_own_price: false,
          freight_usd: 0, duty_pct: 0, clearance_usd: 0, sort_order: count ?? 0,
        })
        .select("id")
        .single();
      if (error) throw error;
      return Response.json({ ok: true, id: data.id });
    }

    if (body.action === "update-entry" && body.id) {
      const fields = ["item_name", "packaging", "weight_desc", "forum", "country", "price_local", "currency", "fx_rate", "is_own_price", "freight_usd", "duty_pct", "clearance_usd"];
      const updates: Record<string, unknown> = {};
      for (const f of fields) if (body[f] !== undefined) updates[f] = body[f];
      const { error } = await supabase.from("cb_reverse_entries").update(updates).eq("id", body.id);
      if (error) throw error;
      return Response.json({ ok: true });
    }

    if (body.action === "delete-entry" && body.id) {
      const { error } = await supabase.from("cb_reverse_entries").delete().eq("id", body.id);
      if (error) throw error;
      return Response.json({ ok: true });
    }

    // Fetches every target link on the sheet, extracts a price via AI, and
    // inserts one new competitor row per successful link. Failures (blocked,
    // no price found, etc.) are reported per-link, not thrown.
    if (body.action === "fetch-links" && body.sheetId) {
      const { data: sheet, error: sErr } = await supabase.from("cb_reverse_sheets").select("*").eq("id", body.sheetId).single();
      if (sErr) throw sErr;
      const links: { url: string; label?: string }[] = sheet.target_links ?? [];
      if (links.length === 0) return Response.json({ results: [] });

      const { count } = await supabase.from("cb_reverse_entries").select("id", { count: "exact", head: true }).eq("sheet_id", body.sheetId);
      let nextSort = count ?? 0;

      const results = await Promise.all(links.map(l => fetchAndExtract(l.url, sheet.target_category || "")));

      const rowsToInsert = results.filter(r => r.ok).map(r => ({
        sheet_id: body.sheetId,
        item_name: r.itemName || "(unnamed)",
        packaging: r.packaging || "",
        weight_desc: "",
        forum: r.hostname,
        country: sheet.target_country || "",
        price_local: r.price,
        currency: r.currency,
        fx_rate: 1,
        is_own_price: false,
        freight_usd: 0, duty_pct: 0, clearance_usd: 0,
        source_url: r.url,
        sort_order: nextSort++,
      }));
      if (rowsToInsert.length > 0) {
        const { error: iErr } = await supabase.from("cb_reverse_entries").insert(rowsToInsert);
        if (iErr) throw iErr;
      }

      return Response.json({ results: results.map(r => ({ url: r.url, ok: r.ok, error: "error" in r ? r.error : undefined })) });
    }

    // Google Custom Search (official API, not raw SERP scraping — see
    // GOOGLE_CSE_API_KEY/GOOGLE_CSE_CX below). Returns candidate result links
    // for the user to review and pick from; nothing is auto-added.
    if (body.action === "google-search") {
      const apiKey = process.env.GOOGLE_CSE_API_KEY;
      const cx = process.env.GOOGLE_CSE_CX;
      if (!apiKey || !cx) {
        return Response.json({
          notConfigured: true,
          message: "Google Custom Search isn't set up yet. Needs GOOGLE_CSE_API_KEY and GOOGLE_CSE_CX environment variables.",
        });
      }
      const query = [body.category, body.country, "price"].filter(Boolean).join(" ");
      if (!query.trim()) return Response.json({ error: "Give a category or country to search for" }, { status: 400 });

      const params = new URLSearchParams({ key: apiKey, cx, q: query, num: "10" });
      const resp = await fetch(`https://www.googleapis.com/customsearch/v1?${params}`);
      const data = await resp.json();
      if (!resp.ok) return Response.json({ error: data?.error?.message || "Google search failed" }, { status: 502 });

      const results = (data.items ?? []).map((it: { title: string; link: string; snippet: string; displayLink: string }) => ({
        title: it.title, link: it.link, snippet: it.snippet, hostname: it.displayLink,
      }));
      return Response.json({ results });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
