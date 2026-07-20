import { supabase } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { notify, notifyEvent, buildPoText, htmlWrap } from "@/lib/sc-notify";

function poNumber(seq: number): string {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `PO-${yy}${mm}${dd}-${String(seq).padStart(3, "0")}`;
}

export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const poId = url.searchParams.get("id");

    if (poId) {
      const { data: po, error: pErr } = await supabase
        .from("sc_purchase_orders").select("*").eq("id", poId).single();
      if (pErr) throw pErr;
      const { data: items, error: iErr } = await supabase
        .from("sc_po_items").select("*").eq("po_id", poId).order("sort_order");
      if (iErr) throw iErr;
      return Response.json({ po, items: items ?? [] });
    }

    // All POs with their items (for the list view)
    const { data: pos, error } = await supabase
      .from("sc_purchase_orders").select("*").order("created_at", { ascending: false });
    if (error) throw error;

    const ids = (pos ?? []).map(p => p.id);
    let itemsByPo: Record<string, unknown[]> = {};
    if (ids.length > 0) {
      const { data: allItems } = await supabase
        .from("sc_po_items").select("*").in("po_id", ids).order("sort_order");
      itemsByPo = (allItems ?? []).reduce((acc: Record<string, unknown[]>, it) => {
        (acc[it.po_id as string] ||= []).push(it);
        return acc;
      }, {});
    }

    const result = (pos ?? []).map(p => ({ ...p, items: itemsByPo[p.id] ?? [] }));
    return Response.json({ pos: result });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();

    // Generate one PO per vendor from assigned BOM to-order items. Lines can
    // be finished-goods products OR raw materials — a BOM's materials each
    // often come from a different vendor than the finished product itself.
    // body.assignments: [{ kind: "product"|"material", productId, materialId,
    //   productName, packingDesc, cartons, unit, vendorId, vendorName, vendorPhone }]
    if (body.action === "generate" && Array.isArray(body.assignments)) {
      const assigned = body.assignments.filter((a: Record<string, unknown>) => a.vendorId && Number(a.cartons) > 0);
      if (assigned.length === 0) {
        return Response.json({ error: "Assign a vendor to at least one item" }, { status: 400 });
      }

      // Group by vendor
      const byVendor: Record<string, Record<string, unknown>[]> = {};
      for (const a of assigned) {
        (byVendor[a.vendorId as string] ||= []).push(a);
      }

      // Sequence base from existing PO count (today)
      const { count } = await supabase
        .from("sc_purchase_orders").select("id", { count: "exact", head: true });
      let seq = (count ?? 0) + 1;

      const createdIds: string[] = [];
      for (const vendorId of Object.keys(byVendor)) {
        const items = byVendor[vendorId];
        const first = items[0];
        const totalCartons = items.reduce((s, it) => s + Number(it.cartons || 0), 0);

        const { data: po, error: poErr } = await supabase
          .from("sc_purchase_orders")
          .insert({
            po_number: poNumber(seq++),
            bom_id: body.bomId || null,
            vendor_id: vendorId,
            vendor_name: (first.vendorName as string) || "Unknown",
            vendor_phone: (first.vendorPhone as string) || "",
            status: "draft",
            total_cartons: totalCartons,
            created_by: session.id,
          })
          .select("id")
          .single();
        if (poErr) throw poErr;
        createdIds.push(po.id);

        const rows = items.map((it, i) => ({
          po_id: po.id,
          product_id: it.productId || null,
          material_id: it.materialId || null,
          item_kind: it.kind === "material" ? "material" : "product",
          product_name: (it.productName as string) || "",
          packing_desc: (it.packingDesc as string) || "",
          cartons_ordered: Number(it.cartons || 0),
          unit: (it.unit as string) || "CARTON",
          remarks: (it.remarks as string) || "",
          sort_order: i,
        }));
        const { error: itErr } = await supabase.from("sc_po_items").insert(rows);
        if (itErr) throw itErr;
      }

      return Response.json({ ok: true, created: createdIds.length });
    }

    if (body.action === "update" && body.id) {
      const updates: Record<string, unknown> = {};
      if (body.status !== undefined) updates.status = body.status;
      if (body.notes !== undefined) updates.notes = body.notes;
      updates.updated_at = new Date().toISOString();
      const { error } = await supabase.from("sc_purchase_orders").update(updates).eq("id", body.id);
      if (error) throw error;

      // Marking a PO as sent dispatches the order to the vendor (WhatsApp outbox)
      if (body.status === "sent") {
        const { data: po } = await supabase.from("sc_purchase_orders").select("*").eq("id", body.id).maybeSingle();
        if (po) {
          const { data: items } = await supabase.from("sc_po_items").select("*").eq("po_id", body.id).order("sort_order");
          const text = buildPoText(po, (items ?? []) as { product_name: string; packing_desc?: string | null; cartons_ordered: number }[]);
          // 1) The vendor gets the PO itself
          const notified = await notify({
            event: "po_sent",
            refId: po.id,
            whatsapp: po.vendor_phone ? { to: po.vendor_phone, body: text } : undefined,
            email: po.vendor_email ? { to: po.vendor_email, subject: `Purchase Order ${po.po_number} — Kafi Commodities`, html: htmlWrap(`Purchase Order ${po.po_number}`, text) } : undefined,
          });
          // 2) Internal team subscribed to "po_sent" gets a heads-up
          const internal = await notifyEvent({
            event: "po_sent",
            refId: po.id,
            text: `*KAFI — PO DISPATCHED*\n${po.po_number} sent to ${po.vendor_name} — ${po.total_cartons} cartons.`,
            subject: `PO dispatched — ${po.po_number} (${po.vendor_name})`,
          });
          return Response.json({ ok: true, notified: [...notified, ...internal] });
        }
      }
      return Response.json({ ok: true });
    }

    if (body.action === "delete" && body.id) {
      const { error } = await supabase.from("sc_purchase_orders").delete().eq("id", body.id);
      if (error) throw error;
      return Response.json({ ok: true });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
