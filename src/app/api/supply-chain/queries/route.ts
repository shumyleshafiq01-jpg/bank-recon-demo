import { supabase } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { notifyEvent } from "@/lib/sc-notify";

function queryNumber(seq: number): string {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `QRY-${yy}${mm}${dd}-${String(seq).padStart(3, "0")}`;
}

export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const queryId = url.searchParams.get("id");

    if (queryId) {
      const { data: q, error: qErr } = await supabase.from("sc_queries").select("*").eq("id", queryId).single();
      if (qErr) throw qErr;
      const { data: items, error: iErr } = await supabase.from("sc_query_items").select("*").eq("query_id", queryId).order("sort_order");
      if (iErr) throw iErr;
      return Response.json({ query: q, items: items ?? [] });
    }

    const { data, error } = await supabase.from("sc_queries").select("*").order("created_at", { ascending: false });
    if (error) throw error;

    const ids = (data ?? []).map(q => q.id);
    let itemsByQuery: Record<string, unknown[]> = {};
    if (ids.length > 0) {
      const { data: allItems } = await supabase.from("sc_query_items").select("*").in("query_id", ids);
      itemsByQuery = (allItems ?? []).reduce((acc: Record<string, unknown[]>, it) => {
        (acc[it.query_id as string] ||= []).push(it);
        return acc;
      }, {});
    }

    return Response.json({ queries: (data ?? []).map(q => ({ ...q, items: itemsByQuery[q.id] ?? [] })) });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();

    if (body.action === "create") {
      const { count } = await supabase.from("sc_queries").select("id", { count: "exact", head: true });

      const { data: q, error: qErr } = await supabase
        .from("sc_queries")
        .insert({
          query_number: queryNumber((count ?? 0) + 1),
          buyer_name: body.buyerName || "Unknown Buyer",
          buyer_contact: body.buyerContact || "",
          received_date: body.receivedDate || new Date().toISOString().slice(0, 10),
          notes: body.notes || "",
          status: "new",
          created_by: session.id,
        })
        .select("*")
        .single();
      if (qErr) throw qErr;

      const items = Array.isArray(body.items) ? body.items : [];
      if (items.length > 0) {
        const rows = items.map((it: Record<string, unknown>, i: number) => ({
          query_id: q.id,
          product_id: it.productId || null,
          product_name: (it.productName as string) || "",
          requested_qty: Number(it.requestedQty || 0),
          unit: (it.unit as string) || "CARTON",
          remarks: (it.remarks as string) || "",
          sort_order: i,
        }));
        const { error: itErr } = await supabase.from("sc_query_items").insert(rows);
        if (itErr) throw itErr;
      }

      const notified = await notifyEvent({
        event: "query_received",
        refId: q.id,
        text: `*KAFI — NEW QUERY*\n${q.query_number} from ${q.buyer_name}\n${items.length} item${items.length !== 1 ? "s" : ""} requested.`,
        subject: `New query — ${q.query_number} (${q.buyer_name})`,
      });

      return Response.json({ ok: true, id: q.id, notified });
    }

    if (body.action === "update" && body.id) {
      const updates: Record<string, unknown> = {};
      if (body.buyerName !== undefined) updates.buyer_name = body.buyerName;
      if (body.buyerContact !== undefined) updates.buyer_contact = body.buyerContact;
      if (body.receivedDate !== undefined) updates.received_date = body.receivedDate;
      if (body.status !== undefined) updates.status = body.status;
      if (body.notes !== undefined) updates.notes = body.notes;
      updates.updated_at = new Date().toISOString();
      const { error } = await supabase.from("sc_queries").update(updates).eq("id", body.id);
      if (error) throw error;
      return Response.json({ ok: true });
    }

    if (body.action === "delete" && body.id) {
      const { error } = await supabase.from("sc_queries").delete().eq("id", body.id);
      if (error) throw error;
      return Response.json({ ok: true });
    }

    // Hand off a query into a CBM plan — pre-fills buyer name and copies
    // the requested line items in as a starting point (still fully editable
    // in the CBM Calculator afterward).
    if (body.action === "start-cbm-plan" && body.queryId) {
      const { data: q, error: qErr } = await supabase.from("sc_queries").select("*").eq("id", body.queryId).single();
      if (qErr) throw qErr;

      const { data: items } = await supabase.from("sc_query_items").select("*").eq("query_id", body.queryId).order("sort_order");

      const { data: plan, error: pErr } = await supabase
        .from("sc_packing_plans")
        .insert({
          plan_name: `${q.query_number} — ${q.buyer_name}`,
          buyer_name: q.buyer_name,
          container_type: "20ft",
          status: "draft",
          created_by: session.id,
        })
        .select("id")
        .single();
      if (pErr) throw pErr;

      const linkedItems = (items ?? []).filter(it => it.product_id);
      if (linkedItems.length > 0) {
        const rows = linkedItems.map((it, i) => ({
          plan_id: plan.id,
          product_id: it.product_id,
          cartons: Number(it.requested_qty || 0),
          fill_pct: 0,
          net_weight_total: 0,
          unit_price_fob: 0,
          total_value: 0,
          remarks: (it.remarks as string) || "",
          sort_order: i,
        }));
        const { error: insErr } = await supabase.from("sc_packing_items").insert(rows);
        if (insErr) throw insErr;
      }

      await supabase.from("sc_queries").update({ plan_id: plan.id, status: "in_progress", updated_at: new Date().toISOString() }).eq("id", body.queryId);

      return Response.json({ ok: true, planId: plan.id, skippedItems: (items ?? []).length - linkedItems.length });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
