import { supabase } from "@/lib/supabase";
import { getSession } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const planId = url.searchParams.get("id");

    if (planId) {
      const { data: plan, error: pErr } = await supabase
        .from("sc_packing_plans")
        .select("*")
        .eq("id", planId)
        .single();
      if (pErr) throw pErr;

      const { data: items, error: iErr } = await supabase
        .from("sc_packing_items")
        .select("*, sc_products(id, brand, product_name, packing_desc, length_in, width_in, height_in, max_20ft, max_40ft, max_40hc, net_weight_kg)")
        .eq("plan_id", planId)
        .order("sort_order");
      if (iErr) throw iErr;

      return Response.json({ plan, items: items ?? [] });
    }

    const { data, error } = await supabase
      .from("sc_packing_plans")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;

    return Response.json({ plans: data ?? [] });
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
      const { data, error } = await supabase
        .from("sc_packing_plans")
        .insert({
          plan_name: body.planName || "Untitled Plan",
          buyer_name: body.buyerName || "",
          container_type: body.containerType || "20ft",
          status: "draft",
          notes: body.notes || "",
          total_cartons: 0,
          total_fill_pct: 0,
          created_by: session.id,
        })
        .select("id")
        .single();
      if (error) throw error;
      return Response.json({ ok: true, id: data.id });
    }

    if (body.action === "update" && body.id) {
      const updates: Record<string, unknown> = {};
      if (body.planName !== undefined) updates.plan_name = body.planName;
      if (body.buyerName !== undefined) updates.buyer_name = body.buyerName;
      if (body.containerType !== undefined) updates.container_type = body.containerType;
      if (body.status !== undefined) updates.status = body.status;
      if (body.notes !== undefined) updates.notes = body.notes;
      if (body.totalCartons !== undefined) updates.total_cartons = body.totalCartons;
      if (body.totalFillPct !== undefined) updates.total_fill_pct = body.totalFillPct;
      updates.updated_at = new Date().toISOString();

      const { error } = await supabase.from("sc_packing_plans").update(updates).eq("id", body.id);
      if (error) throw error;
      return Response.json({ ok: true });
    }

    if (body.action === "delete" && body.id) {
      const { error } = await supabase.from("sc_packing_plans").delete().eq("id", body.id);
      if (error) throw error;
      return Response.json({ ok: true });
    }

    if (body.action === "add-item" && body.planId) {
      const { error } = await supabase.from("sc_packing_items").insert({
        plan_id: body.planId,
        product_id: body.productId,
        cartons: Number(body.cartons || 0),
        fill_pct: Number(body.fillPct || 0),
        net_weight_total: Number(body.netWeightTotal || 0),
        unit_price_fob: Number(body.unitPriceFob || 0),
        total_value: Number(body.totalValue || 0),
        remarks: body.remarks || "",
        sort_order: Number(body.sortOrder || 0),
      });
      if (error) throw error;
      return Response.json({ ok: true });
    }

    if (body.action === "update-item" && body.itemId) {
      const updates: Record<string, unknown> = {};
      if (body.cartons !== undefined) updates.cartons = Number(body.cartons);
      if (body.fillPct !== undefined) updates.fill_pct = Number(body.fillPct);
      if (body.netWeightTotal !== undefined) updates.net_weight_total = Number(body.netWeightTotal);
      if (body.unitPriceFob !== undefined) updates.unit_price_fob = Number(body.unitPriceFob);
      if (body.totalValue !== undefined) updates.total_value = Number(body.totalValue);
      if (body.remarks !== undefined) updates.remarks = body.remarks;

      const { error } = await supabase.from("sc_packing_items").update(updates).eq("id", body.itemId);
      if (error) throw error;
      return Response.json({ ok: true });
    }

    if (body.action === "remove-item" && body.itemId) {
      const { error } = await supabase.from("sc_packing_items").delete().eq("id", body.itemId);
      if (error) throw error;
      return Response.json({ ok: true });
    }

    if (body.action === "save-items" && body.planId && Array.isArray(body.items)) {
      await supabase.from("sc_packing_items").delete().eq("plan_id", body.planId);

      if (body.items.length > 0) {
        const rows = body.items.map((item: Record<string, unknown>, i: number) => ({
          plan_id: body.planId,
          product_id: item.productId,
          cartons: Number(item.cartons || 0),
          fill_pct: Number(item.fillPct || 0),
          net_weight_total: Number(item.netWeightTotal || 0),
          unit_price_fob: Number(item.unitPriceFob || 0),
          total_value: Number(item.totalValue || 0),
          remarks: (item.remarks as string) || "",
          sort_order: i,
        }));
        const { error } = await supabase.from("sc_packing_items").insert(rows);
        if (error) throw error;
      }

      const totalCartons = body.items.reduce((s: number, it: Record<string, unknown>) => s + Number(it.cartons || 0), 0);
      const totalFill = body.items.reduce((s: number, it: Record<string, unknown>) => s + Number(it.fillPct || 0), 0);

      await supabase.from("sc_packing_plans").update({
        total_cartons: totalCartons,
        total_fill_pct: Math.round(totalFill * 100) / 100,
        updated_at: new Date().toISOString(),
      }).eq("id", body.planId);

      return Response.json({ ok: true });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
