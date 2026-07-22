import { supabase } from "@/lib/supabase";
import { getSession } from "@/lib/auth";

function countBy<T extends string>(rows: { status: T }[]): Record<string, number> {
  return rows.reduce((acc: Record<string, number>, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});
}

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const [
      { data: queries },
      { data: plans },
      { data: boms },
      { data: pos },
      { data: grns },
      { data: packing },
      { data: shipments },
      { data: inventory },
      { data: notifications },
    ] = await Promise.all([
      supabase.from("sc_queries").select("status"),
      supabase.from("sc_packing_plans").select("id"),
      supabase.from("sc_boms").select("status"),
      supabase.from("sc_purchase_orders").select("id, vendor_name, status, created_at"),
      supabase.from("sc_grns").select("status"),
      supabase.from("sc_packing_sessions").select("status"),
      supabase.from("sc_shipments").select("status"),
      supabase.from("sc_inventory").select("item_name, qty_on_hand, reorder_level, unit"),
      supabase.from("sc_notifications").select("status"),
    ]);

    // Vendor spend — sum(rate * cartons_ordered) per vendor across all PO items
    const poIds = (pos ?? []).map(p => p.id);
    let vendorSpend: { vendor: string; poCount: number; totalValue: number }[] = [];
    if (poIds.length > 0) {
      const { data: items } = await supabase.from("sc_po_items").select("po_id, rate, cartons_ordered").in("po_id", poIds);
      const valueByPo: Record<string, number> = {};
      for (const it of items ?? []) {
        valueByPo[it.po_id as string] = (valueByPo[it.po_id as string] || 0) + Number(it.rate || 0) * Number(it.cartons_ordered || 0);
      }
      const byVendor: Record<string, { poCount: number; totalValue: number }> = {};
      for (const po of pos ?? []) {
        const v = po.vendor_name || "Unknown";
        if (!byVendor[v]) byVendor[v] = { poCount: 0, totalValue: 0 };
        byVendor[v].poCount++;
        byVendor[v].totalValue += valueByPo[po.id] || 0;
      }
      vendorSpend = Object.entries(byVendor)
        .map(([vendor, v]) => ({ vendor, ...v }))
        .sort((a, b) => b.totalValue - a.totalValue);
    }

    const lowStock = (inventory ?? [])
      .filter(i => Number(i.reorder_level || 0) > 0 && Number(i.qty_on_hand || 0) <= Number(i.reorder_level || 0))
      .map(i => ({ name: i.item_name, qtyOnHand: i.qty_on_hand, reorderLevel: i.reorder_level, unit: i.unit }));

    return Response.json({
      funnel: {
        queries: { total: (queries ?? []).length, byStatus: countBy(queries ?? []) },
        cbmPlans: { total: (plans ?? []).length },
        boms: { total: (boms ?? []).length, byStatus: countBy(boms ?? []) },
        purchaseOrders: { total: (pos ?? []).length, byStatus: countBy(pos ?? []) },
        grns: { total: (grns ?? []).length, byStatus: countBy(grns ?? []) },
        packing: { total: (packing ?? []).length, byStatus: countBy(packing ?? []) },
        shipments: { total: (shipments ?? []).length, byStatus: countBy(shipments ?? []) },
      },
      vendorSpend,
      lowStock,
      notifications: countBy((notifications ?? []) as { status: string }[]),
    });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
