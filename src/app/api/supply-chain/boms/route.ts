import { supabase } from "@/lib/supabase";
import { getSession } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const bomId = url.searchParams.get("id");

    if (bomId) {
      const { data: bom, error: bErr } = await supabase
        .from("sc_boms").select("*").eq("id", bomId).single();
      if (bErr) throw bErr;

      const { data: items, error: iErr } = await supabase
        .from("sc_bom_items").select("*").eq("bom_id", bomId).order("sort_order");
      if (iErr) throw iErr;

      return Response.json({ bom, items: items ?? [] });
    }

    const { data, error } = await supabase
      .from("sc_boms").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return Response.json({ boms: data ?? [] });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();

    // Generate a BOM from a saved CBM packing plan
    if (body.action === "generate-from-plan" && body.planId) {
      const { data: plan, error: pErr } = await supabase
        .from("sc_packing_plans").select("*").eq("id", body.planId).single();
      if (pErr) throw pErr;

      const { data: planItems, error: piErr } = await supabase
        .from("sc_packing_items")
        .select("*, sc_products(product_name, packing_desc, pcs_per_carton)")
        .eq("plan_id", body.planId)
        .order("sort_order");
      if (piErr) throw piErr;

      // Create the BOM header
      const { data: bom, error: bErr } = await supabase
        .from("sc_boms")
        .insert({
          bom_name: body.bomName || `BOM — ${plan.plan_name}`,
          plan_id: plan.id,
          buyer_name: plan.buyer_name,
          container_type: plan.container_type,
          status: "draft",
          created_by: session.id,
        })
        .select("id")
        .single();
      if (bErr) throw bErr;

      // Create BOM items from plan items
      const rows = (planItems ?? []).map((it: Record<string, unknown>, i: number) => {
        const prod = it.sc_products as Record<string, unknown> | null;
        const cartons = Number(it.cartons || 0);
        const pcsPerCarton = Number(prod?.pcs_per_carton || 0);
        return {
          bom_id: bom.id,
          product_id: it.product_id,
          product_name: (prod?.product_name as string) || "Unknown",
          packing_desc: (prod?.packing_desc as string) || "",
          cartons_required: cartons,
          pcs_per_carton: pcsPerCarton,
          pcs_required: cartons * pcsPerCarton,
          net_weight_total: Number(it.net_weight_total || 0),
          value_total: Number(it.total_value || 0),
          in_stock: 0,
          to_order: cartons, // nothing in stock yet
          item_status: "pending",
          remarks: (it.remarks as string) || "",
          sort_order: i,
        };
      });

      if (rows.length > 0) {
        const { error: insErr } = await supabase.from("sc_bom_items").insert(rows);
        if (insErr) throw insErr;
      }

      return Response.json({ ok: true, id: bom.id });
    }

    if (body.action === "update" && body.id) {
      const updates: Record<string, unknown> = {};
      if (body.bomName !== undefined) updates.bom_name = body.bomName;
      if (body.status !== undefined) updates.status = body.status;
      if (body.notes !== undefined) updates.notes = body.notes;
      updates.updated_at = new Date().toISOString();
      const { error } = await supabase.from("sc_boms").update(updates).eq("id", body.id);
      if (error) throw error;
      return Response.json({ ok: true });
    }

    if (body.action === "delete" && body.id) {
      const { error } = await supabase.from("sc_boms").delete().eq("id", body.id);
      if (error) throw error;
      return Response.json({ ok: true });
    }

    // Save edits to BOM items (in_stock, status, remarks) in bulk
    if (body.action === "save-items" && body.bomId && Array.isArray(body.items)) {
      for (const it of body.items) {
        const cartons = Number(it.cartonsRequired || 0);
        const inStock = Number(it.inStock || 0);
        const toOrder = Math.max(cartons - inStock, 0);
        const { error } = await supabase
          .from("sc_bom_items")
          .update({
            in_stock: inStock,
            to_order: toOrder,
            item_status: it.itemStatus || "pending",
            remarks: it.remarks || "",
          })
          .eq("id", it.id);
        if (error) throw error;
      }
      return Response.json({ ok: true });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
