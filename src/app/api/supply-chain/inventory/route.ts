import { supabase } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { notifyEvent } from "@/lib/sc-notify";

// Fires only on the CROSSING into low stock (was above reorder level,
// now at or below it) — not on every transaction while it stays low,
// so subscribers get one alert per dip instead of being spammed.
async function checkLowStock(item: { id: string; item_name: string; unit: string; reorder_level: number }, prevQty: number, newQty: number) {
  const reorderLevel = Number(item.reorder_level || 0);
  if (reorderLevel <= 0) return;
  const wasAbove = prevQty > reorderLevel;
  const nowAtOrBelow = newQty <= reorderLevel;
  if (!(wasAbove && nowAtOrBelow)) return;

  await notifyEvent({
    event: "low_stock_alert",
    refId: item.id,
    text: `*KAFI — LOW STOCK ALERT*\n${item.item_name}\n${newQty} ${item.unit} on hand (reorder level: ${reorderLevel} ${item.unit}).`,
    subject: `Low stock — ${item.item_name}`,
  });
}

// Single-warehouse inventory covering both raw materials (from the Product
// List's material master, pl_master) and finished goods (sc_products).
// This is the source of truth that BOM's "Qty In Stock" suggests from, and
// that GRN approval writes real receipts into.

export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const invId = url.searchParams.get("id");

    if (invId) {
      const { data: item, error: iErr } = await supabase.from("sc_inventory").select("*").eq("id", invId).single();
      if (iErr) throw iErr;
      const { data: txns, error: tErr } = await supabase
        .from("sc_inventory_transactions").select("*").eq("inventory_id", invId).order("created_at", { ascending: false }).limit(50);
      if (tErr) throw tErr;
      return Response.json({ item, transactions: txns ?? [] });
    }

    const { data, error } = await supabase.from("sc_inventory").select("*").order("item_type").order("item_name");
    if (error) throw error;
    return Response.json({ items: data ?? [] });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();

    // Create an sc_inventory row for every raw material and finished-goods
    // product that doesn't have one yet — so the module is browsable even
    // before any stock has moved.
    if (body.action === "sync") {
      const { data: materials } = await supabase.from("pl_master").select("id, name, unit");
      const { data: products } = await supabase.from("sc_products").select("id, product_name, unit_type").eq("active", true);
      const { data: existing } = await supabase.from("sc_inventory").select("material_id, product_id, item_type");
      const existingMaterialIds = new Set((existing ?? []).filter(e => e.item_type === "material").map(e => e.material_id));
      const existingProductIds = new Set((existing ?? []).filter(e => e.item_type === "product").map(e => e.product_id));

      const rows: Record<string, unknown>[] = [];
      for (const m of materials ?? []) {
        if (existingMaterialIds.has(m.id)) continue;
        rows.push({ item_type: "material", material_id: m.id, product_id: null, item_name: m.name, unit: m.unit || "PCS", qty_on_hand: 0, reorder_level: 0 });
      }
      for (const p of products ?? []) {
        if (existingProductIds.has(p.id)) continue;
        rows.push({ item_type: "product", material_id: null, product_id: p.id, item_name: p.product_name, unit: p.unit_type === "bag" ? "BAG" : "CARTON", qty_on_hand: 0, reorder_level: 0 });
      }

      if (rows.length > 0) {
        const { error } = await supabase.from("sc_inventory").insert(rows);
        if (error) throw error;
      }
      return Response.json({ ok: true, added: rows.length });
    }

    // Manual stock adjustment — opening balance, physical count correction,
    // wastage write-off, etc. qty is signed (+in / -out).
    if (body.action === "adjust" && body.inventoryId) {
      const qty = Number(body.qty || 0);
      if (qty === 0) return Response.json({ error: "Qty must be non-zero" }, { status: 400 });

      const { data: inv, error: invErr } = await supabase.from("sc_inventory").select("*").eq("id", body.inventoryId).single();
      if (invErr) throw invErr;

      const newQty = Number(inv.qty_on_hand) + qty;
      const { error: updErr } = await supabase.from("sc_inventory").update({ qty_on_hand: newQty, updated_at: new Date().toISOString() }).eq("id", body.inventoryId);
      if (updErr) throw updErr;

      const { error: txnErr } = await supabase.from("sc_inventory_transactions").insert({
        inventory_id: body.inventoryId,
        txn_type: "adjustment",
        qty,
        ref_type: "manual",
        notes: body.notes || "",
        created_by: session.id,
      });
      if (txnErr) throw txnErr;

      await checkLowStock(inv, Number(inv.qty_on_hand), newQty);

      return Response.json({ ok: true, qtyOnHand: newQty });
    }

    if (body.action === "set-reorder" && body.inventoryId) {
      const { data: inv } = await supabase.from("sc_inventory").select("*").eq("id", body.inventoryId).maybeSingle();
      const newReorderLevel = Number(body.reorderLevel || 0);
      const { error } = await supabase.from("sc_inventory").update({ reorder_level: newReorderLevel }).eq("id", body.inventoryId);
      if (error) throw error;

      // Raising the reorder level above current stock can itself put the
      // item at risk even though qty_on_hand didn't move — fire only if
      // this wasn't already true under the OLD reorder level.
      if (inv) {
        const qty = Number(inv.qty_on_hand);
        const wasOk = newReorderLevel <= 0 || qty > Number(inv.reorder_level || 0);
        const nowAtRisk = newReorderLevel > 0 && qty <= newReorderLevel;
        if (wasOk && nowAtRisk) {
          await notifyEvent({
            event: "low_stock_alert",
            refId: inv.id,
            text: `*KAFI — LOW STOCK ALERT*\n${inv.item_name}\n${qty} ${inv.unit} on hand (reorder level: ${newReorderLevel} ${inv.unit}).`,
            subject: `Low stock — ${inv.item_name}`,
          });
        }
      }

      return Response.json({ ok: true });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
