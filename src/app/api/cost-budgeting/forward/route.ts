import { supabase } from "@/lib/supabase";
import { getSession } from "@/lib/auth";

// Forward Costing: the mirror of Reverse Costing — given Kafi's own known
// cost, apply a target markup to suggest a selling price. No back-calculation
// needed since the cost is already known, unlike the reverse tool.

export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const id = url.searchParams.get("id");

    if (id) {
      const { data: sheet, error: sErr } = await supabase.from("cb_forward_sheets").select("*").eq("id", id).single();
      if (sErr) throw sErr;
      const { data: entries, error: eErr } = await supabase.from("cb_forward_entries").select("*").eq("sheet_id", id).order("sort_order");
      if (eErr) throw eErr;
      return Response.json({ sheet, entries: entries ?? [] });
    }

    const { data, error } = await supabase.from("cb_forward_sheets").select("*").order("created_at", { ascending: false });
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
        .from("cb_forward_sheets")
        .insert({ title: body.title || "Untitled Pricing Sheet", category: body.category || null, created_by: session.id })
        .select("id")
        .single();
      if (error) throw error;
      return Response.json({ ok: true, id: data.id });
    }

    if (body.action === "update-sheet" && body.id) {
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (body.title !== undefined) updates.title = body.title;
      if (body.category !== undefined) updates.category = body.category;
      if (body.markupScenarios !== undefined) updates.markup_scenarios = body.markupScenarios;
      const { error } = await supabase.from("cb_forward_sheets").update(updates).eq("id", body.id);
      if (error) throw error;
      return Response.json({ ok: true });
    }

    if (body.action === "delete-sheet" && body.id) {
      const { error } = await supabase.from("cb_forward_sheets").delete().eq("id", body.id);
      if (error) throw error;
      return Response.json({ ok: true });
    }

    if (body.action === "add-entry" && body.sheetId) {
      const { count } = await supabase.from("cb_forward_entries").select("id", { count: "exact", head: true }).eq("sheet_id", body.sheetId);
      const { data, error } = await supabase
        .from("cb_forward_entries")
        .insert({ sheet_id: body.sheetId, item_name: "New item", packaging: "", weight_desc: "", our_cost_usd: 0, sort_order: count ?? 0 })
        .select("id")
        .single();
      if (error) throw error;
      return Response.json({ ok: true, id: data.id });
    }

    if (body.action === "update-entry" && body.id) {
      const fields = ["item_name", "packaging", "weight_desc", "our_cost_usd"];
      const updates: Record<string, unknown> = {};
      for (const f of fields) if (body[f] !== undefined) updates[f] = body[f];
      const { error } = await supabase.from("cb_forward_entries").update(updates).eq("id", body.id);
      if (error) throw error;
      return Response.json({ ok: true });
    }

    if (body.action === "delete-entry" && body.id) {
      const { error } = await supabase.from("cb_forward_entries").delete().eq("id", body.id);
      if (error) throw error;
      return Response.json({ ok: true });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
