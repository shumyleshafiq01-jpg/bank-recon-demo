import { supabase } from "@/lib/supabase";
import { getSession } from "@/lib/auth";

// Sales + Quotation Comparison — Kafi's own historical sales orders/
// invoices (not buyer queries), used to suggest a package that BLENDS
// items from multiple past orders to hit a target CBM fill %.

export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const id = url.searchParams.get("id");

    if (id) {
      const { data: sheet, error: sErr } = await supabase.from("sc_sales_history").select("*").eq("id", id).single();
      if (sErr) throw sErr;
      const { data: items, error: iErr } = await supabase.from("sc_sales_history_items").select("*").eq("sales_history_id", id).order("sort_order");
      if (iErr) throw iErr;
      return Response.json({ sheet, items: items ?? [] });
    }

    const { data, error } = await supabase.from("sc_sales_history").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return Response.json({ sheets: data ?? [] });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

// Container internal capacity lookup, mirrors CBM page's getMaxForContainer.
function maxForContainer(product: { max_20ft: number; max_40ft: number; max_40hc: number }, ct: string) {
  if (ct === "40ft") return product.max_40ft;
  if (ct === "40hc") return product.max_40hc;
  return product.max_20ft;
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();

    if (body.action === "create-sheet") {
      const { data, error } = await supabase
        .from("sc_sales_history")
        .insert({
          order_number: body.orderNumber || null, buyer_name: body.buyerName || null,
          country: body.country || null, port: body.port || null,
          container_type: body.containerType || "20ft", order_date: body.orderDate || null,
          notes: body.notes || null, created_by: session.id,
        })
        .select("id")
        .single();
      if (error) throw error;
      return Response.json({ ok: true, id: data.id });
    }

    if (body.action === "update-sheet" && body.id) {
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      const map: Record<string, string> = { orderNumber: "order_number", buyerName: "buyer_name", country: "country", port: "port", containerType: "container_type", orderDate: "order_date", notes: "notes" };
      for (const [k, col] of Object.entries(map)) if (body[k] !== undefined) updates[col] = body[k] || null;
      const { error } = await supabase.from("sc_sales_history").update(updates).eq("id", body.id);
      if (error) throw error;
      return Response.json({ ok: true });
    }

    if (body.action === "delete-sheet" && body.id) {
      const { error } = await supabase.from("sc_sales_history").delete().eq("id", body.id);
      if (error) throw error;
      return Response.json({ ok: true });
    }

    if (body.action === "add-item" && body.sheetId) {
      const { count } = await supabase.from("sc_sales_history_items").select("id", { count: "exact", head: true }).eq("sales_history_id", body.sheetId);
      const { data, error } = await supabase
        .from("sc_sales_history_items")
        .insert({ sales_history_id: body.sheetId, product_id: null, product_name: "New item", cartons: 0, unit_price: null, sort_order: count ?? 0 })
        .select("id")
        .single();
      if (error) throw error;
      return Response.json({ ok: true, id: data.id });
    }

    if (body.action === "update-item" && body.id) {
      const fields = ["product_id", "product_name", "cartons", "unit_price"];
      const updates: Record<string, unknown> = {};
      for (const f of fields) if (body[f] !== undefined) updates[f] = body[f];
      const { error } = await supabase.from("sc_sales_history_items").update(updates).eq("id", body.id);
      if (error) throw error;
      return Response.json({ ok: true });
    }

    if (body.action === "delete-item" && body.id) {
      const { error } = await supabase.from("sc_sales_history_items").delete().eq("id", body.id);
      if (error) throw error;
      return Response.json({ ok: true });
    }

    // The suggestion engine — blends items from every past order matching
    // the container type (and country/port if given) to suggest a package
    // hitting targetFillPct. existingItems (Scenario A, mid-CBM) are
    // excluded from suggestions and their fill is reserved out of the
    // target first; omit them (Scenario B) to build a full package from
    // scratch.
    if (body.action === "suggest-package") {
      const containerType = body.containerType || "20ft";
      const targetFillPct = Number(body.targetFillPct) || 95;
      const existingProductIds: string[] = (body.existingItems || []).map((i: { productId: string }) => i.productId);
      const existingFillPct: number = (body.existingItems || []).reduce((s: number, i: { fillPct?: number }) => s + (i.fillPct || 0), 0);

      let query = supabase.from("sc_sales_history").select("id").eq("container_type", containerType);
      if (body.country) query = query.eq("country", body.country);
      if (body.port) query = query.eq("port", body.port);
      const { data: sheets, error: shErr } = await query;
      if (shErr) throw shErr;

      const sheetIds = (sheets ?? []).map(s => s.id);
      if (sheetIds.length === 0) return Response.json({ suggestions: [], matchedOrders: 0, note: "No past sales history matches this container type/country/port." });

      const { data: histItems, error: hiErr } = await supabase.from("sc_sales_history_items").select("*").in("sales_history_id", sheetIds).not("product_id", "is", null);
      if (hiErr) throw hiErr;

      // Aggregate: for each product, how many past orders featured it, and
      // its typical (average) cartons across those orders.
      const agg: Record<string, { productId: string; productName: string; totalCartons: number; orderCount: number; orderIds: Set<string> }> = {};
      for (const it of histItems ?? []) {
        const pid = it.product_id as string;
        if (existingProductIds.includes(pid)) continue; // don't re-suggest what's already in the plan
        if (!agg[pid]) agg[pid] = { productId: pid, productName: it.product_name as string, totalCartons: 0, orderCount: 0, orderIds: new Set() };
        agg[pid].totalCartons += Number(it.cartons || 0);
        agg[pid].orderIds.add(it.sales_history_id as string);
      }
      const candidates = Object.values(agg).map(a => ({ ...a, orderCount: a.orderIds.size, avgCartons: Math.round(a.totalCartons / a.orderIds.size) }));
      candidates.sort((a, b) => b.orderCount - a.orderCount); // most commonly-ordered together first

      if (candidates.length === 0) return Response.json({ suggestions: [], matchedOrders: sheetIds.length, note: "Matching past orders have no other products to suggest." });

      const productIds = candidates.map(c => c.productId);
      const { data: products, error: pErr } = await supabase.from("sc_products").select("id, product_name, max_20ft, max_40ft, max_40hc").in("id", productIds);
      if (pErr) throw pErr;
      const productMap = new Map((products ?? []).map(p => [p.id as string, p]));

      let runningFillPct = existingFillPct;
      const suggestions: { productId: string; productName: string; cartons: number; fillPct: number }[] = [];

      for (const c of candidates) {
        if (runningFillPct >= targetFillPct) break;
        const product = productMap.get(c.productId);
        const max = product ? maxForContainer(product as { max_20ft: number; max_40ft: number; max_40hc: number }, containerType) : 0;
        if (!max) continue;

        let cartons = c.avgCartons;
        let fillPct = Math.round((cartons / max) * 10000) / 100;

        // Don't overshoot the target — trim the last item to land close to it.
        if (runningFillPct + fillPct > targetFillPct) {
          const remainingPct = targetFillPct - runningFillPct;
          cartons = Math.max(1, Math.round((remainingPct / 100) * max));
          fillPct = Math.round((cartons / max) * 10000) / 100;
        }
        if (cartons <= 0) continue;

        suggestions.push({ productId: c.productId, productName: (product?.product_name as string) || c.productName, cartons, fillPct });
        runningFillPct += fillPct;
      }

      return Response.json({ suggestions, matchedOrders: sheetIds.length, projectedFillPct: Math.round(runningFillPct * 100) / 100 });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
