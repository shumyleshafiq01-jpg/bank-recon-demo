import { supabase } from "@/lib/supabase";
import { getSession } from "@/lib/auth";

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

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
