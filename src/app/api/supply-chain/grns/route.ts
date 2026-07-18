import { supabase } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { notifyEvent, getApprovers, buildGrnText, buildGrnApprovedText } from "@/lib/sc-notify";

function grnNumber(seq: number): string {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `GRN-${yy}${mm}${dd}-${String(seq).padStart(3, "0")}`;
}

async function getSetting(key: string): Promise<string> {
  const { data } = await supabase.from("sc_settings").select("value").eq("key", key).maybeSingle();
  return (data?.value as string) ?? "";
}

export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const grnId = url.searchParams.get("id");

    if (grnId) {
      const { data: grn, error: gErr } = await supabase.from("sc_grns").select("*").eq("id", grnId).single();
      if (gErr) throw gErr;
      const { data: items, error: iErr } = await supabase.from("sc_grn_items").select("*").eq("grn_id", grnId).order("sort_order");
      if (iErr) throw iErr;
      return Response.json({ grn, items: items ?? [] });
    }

    const { data: grns, error } = await supabase.from("sc_grns").select("*").order("created_at", { ascending: false });
    if (error) throw error;

    const ids = (grns ?? []).map(g => g.id);
    let itemsByGrn: Record<string, unknown[]> = {};
    if (ids.length > 0) {
      const { data: allItems } = await supabase.from("sc_grn_items").select("*").in("grn_id", ids).order("sort_order");
      itemsByGrn = (allItems ?? []).reduce((acc: Record<string, unknown[]>, it) => {
        (acc[it.grn_id as string] ||= []).push(it);
        return acc;
      }, {});
    }

    return Response.json({ grns: (grns ?? []).map(g => ({ ...g, items: itemsByGrn[g.id] ?? [] })) });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();

    // Create a GRN from a sent PO and notify the designated receiver
    if (body.action === "create-from-po" && body.poId) {
      const { data: po, error: pErr } = await supabase.from("sc_purchase_orders").select("*").eq("id", body.poId).single();
      if (pErr) throw pErr;

      // One open GRN per PO
      const { data: existing } = await supabase
        .from("sc_grns").select("id").eq("po_id", body.poId).eq("status", "awaiting").maybeSingle();
      if (existing) return Response.json({ error: "An awaiting GRN already exists for this PO" }, { status: 409 });

      const { data: poItems, error: piErr } = await supabase
        .from("sc_po_items").select("*").eq("po_id", body.poId).order("sort_order");
      if (piErr) throw piErr;

      const { count } = await supabase.from("sc_grns").select("id", { count: "exact", head: true });

      const { data: grn, error: gErr } = await supabase
        .from("sc_grns")
        .insert({
          grn_number: grnNumber((count ?? 0) + 1),
          po_id: po.id,
          po_number: po.po_number,
          vendor_name: po.vendor_name,
          status: "awaiting",
          created_by: session.id,
        })
        .select("*")
        .single();
      if (gErr) throw gErr;

      const rows = (poItems ?? []).map((it, i) => ({
        grn_id: grn.id,
        product_id: it.product_id,
        product_name: it.product_name,
        packing_desc: it.packing_desc,
        cartons_ordered: it.cartons_ordered,
        cartons_received: it.cartons_ordered, // receiver adjusts if short
        damaged: 0,
        remarks: "",
        sort_order: i,
      }));
      if (rows.length > 0) {
        const { error: insErr } = await supabase.from("sc_grn_items").insert(rows);
        if (insErr) throw insErr;
      }

      // Fan out to every recipient subscribed to "grn_created"
      const base = (await getSetting("app_base_url")) || new URL(request.url).origin;
      const link = `${base.replace(/\/$/, "")}/supply-chain/grn`;
      const text = buildGrnText(grn, link);

      const notified = await notifyEvent({
        event: "grn_created",
        refId: grn.id,
        text,
        subject: `Goods arrived — ${grn.grn_number}`,
      });

      return Response.json({ ok: true, id: grn.id, notified });
    }

    // Receiver verifies quantities and approves the GRN
    if (body.action === "approve" && body.id && Array.isArray(body.items)) {
      // Approval gate: if designated approvers are configured, only they may approve
      const approvers = await getApprovers("grn_approved");
      if (approvers.length > 0 && !approvers.includes(session.id)) {
        return Response.json({ error: "Only the designated approver can approve this GRN" }, { status: 403 });
      }

      const { data: grn, error: gErr } = await supabase.from("sc_grns").select("*").eq("id", body.id).single();
      if (gErr) throw gErr;
      if (grn.status === "approved") return Response.json({ error: "GRN already approved" }, { status: 409 });

      for (const it of body.items) {
        const { error } = await supabase
          .from("sc_grn_items")
          .update({
            cartons_received: Number(it.cartonsReceived || 0),
            damaged: Number(it.damaged || 0),
            remarks: it.remarks || "",
          })
          .eq("id", it.id);
        if (error) throw error;
      }

      const { error: aErr } = await supabase
        .from("sc_grns")
        .update({ status: "approved", approved_by: session.id, approved_at: new Date().toISOString(), notes: body.notes || "" })
        .eq("id", body.id);
      if (aErr) throw aErr;

      // PO → received
      if (grn.po_id) {
        await supabase.from("sc_purchase_orders").update({ status: "received", updated_at: new Date().toISOString() }).eq("id", grn.po_id);
      }

      // Update BOM stock: good units (received - damaged) go into in_stock
      if (grn.po_id) {
        const { data: po } = await supabase.from("sc_purchase_orders").select("bom_id").eq("id", grn.po_id).maybeSingle();
        if (po?.bom_id) {
          const { data: grnItems } = await supabase.from("sc_grn_items").select("*").eq("grn_id", body.id);
          for (const gi of grnItems ?? []) {
            if (!gi.product_id) continue;
            const { data: bomItem } = await supabase
              .from("sc_bom_items").select("*")
              .eq("bom_id", po.bom_id).eq("product_id", gi.product_id).maybeSingle();
            if (!bomItem) continue;
            const good = Math.max(Number(gi.cartons_received || 0) - Number(gi.damaged || 0), 0);
            const inStock = Number(bomItem.in_stock || 0) + good;
            const toOrder = Math.max(Number(bomItem.cartons_required || 0) - inStock, 0);
            await supabase
              .from("sc_bom_items")
              .update({ in_stock: inStock, to_order: toOrder, item_status: toOrder === 0 ? "in_stock" : bomItem.item_status })
              .eq("id", bomItem.id);
          }
        }
      }

      // Fan out to receiver + sender + accountant — everyone subscribed to "grn_approved"
      const text = buildGrnApprovedText(grn);
      const notified = await notifyEvent({
        event: "grn_approved",
        refId: grn.id,
        text,
        subject: `GRN approved — ${grn.grn_number}`,
      });

      return Response.json({ ok: true, notified });
    }

    if (body.action === "delete" && body.id) {
      const { error } = await supabase.from("sc_grns").delete().eq("id", body.id);
      if (error) throw error;
      return Response.json({ ok: true });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
