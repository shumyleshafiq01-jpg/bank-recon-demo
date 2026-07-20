import { supabase } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { notifyEvent } from "@/lib/sc-notify";

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

      const { data: materials, error: mErr } = await supabase
        .from("sc_bom_materials").select("*").eq("bom_id", bomId).order("sort_order");
      if (mErr) throw mErr;

      // The CBM fill % lives on the originating packing plan — surface it
      // here so the BOM header can show it next to Cartons/Weight/Value.
      let planFillPct: number | null = null;
      if (bom.plan_id) {
        const { data: plan } = await supabase.from("sc_packing_plans").select("total_fill_pct").eq("id", bom.plan_id).maybeSingle();
        planFillPct = plan ? Number(plan.total_fill_pct) : null;
      }

      return Response.json({ bom, items: items ?? [], materials: materials ?? [], planFillPct });
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
        .select("*, sc_products(product_name, packing_desc, pcs_per_carton, source_product_id)")
        .eq("plan_id", body.planId)
        .order("sort_order");
      if (piErr) throw piErr;

      // Recipes turn a finished-good line into its raw materials — reuses
      // the Product List's existing costing recipe (pl_recipes/pl_master).
      // recipe.qty is PER CARTON for unit_type PCS (verified against real
      // data: 500g Fliptop recipe = 20 bottles/carton + 10kg sea salt/carton
      // = 20 x 0.5kg, exact). CONTAINER/FIXED types are once-per-shipment,
      // not per-carton, so they're deduped to a single max rather than summed.
      const sourceIds = Array.from(new Set(
        (planItems ?? [])
          .map((it: Record<string, unknown>) => (it.sc_products as Record<string, unknown> | null)?.source_product_id as string | undefined)
          .filter((x): x is string => !!x)
      ));

      let recipesByProduct: Record<string, { material_id: string; material_name: string; qty: number; unit_type: string }[]> = {};
      let materialMeta: Record<string, { unit: string; category: string; price: number }> = {};

      if (sourceIds.length > 0) {
        const { data: recipeRows } = await supabase.from("pl_recipes").select("*").in("product_id", sourceIds);
        recipesByProduct = (recipeRows ?? []).reduce((acc: typeof recipesByProduct, r) => {
          const pid = r.product_id as string;
          (acc[pid] ||= []).push({
            material_id: r.material_id as string,
            material_name: r.material_name as string,
            qty: Number(r.qty || 0),
            unit_type: (r.unit_type as string) || "PCS",
          });
          return acc;
        }, {});

        const materialIds = Array.from(new Set((recipeRows ?? []).map(r => r.material_id as string)));
        if (materialIds.length > 0) {
          const { data: materialRows } = await supabase.from("pl_master").select("*").in("id", materialIds);
          for (const m of materialRows ?? []) {
            materialMeta[m.id as string] = { unit: (m.unit as string) || "", category: (m.category as string) || "", price: Number(m.price_per_unit || 0) };
          }
        }
      }

      // Suggest a starting "in stock" from the persistent inventory ledger
      // instead of always 0 — still fully editable/overridable afterward.
      const planProductIds = Array.from(new Set((planItems ?? []).map((it: Record<string, unknown>) => it.product_id as string).filter(Boolean)));
      let productStockMap: Record<string, number> = {};
      if (planProductIds.length > 0) {
        const { data: invRows } = await supabase.from("sc_inventory").select("product_id, qty_on_hand").eq("item_type", "product").in("product_id", planProductIds);
        for (const r of invRows ?? []) productStockMap[r.product_id as string] = Number(r.qty_on_hand || 0);
      }

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

      // Aggregate raw materials across every recipe-bearing line. `terms`
      // tracks each contributing "qty-per-carton x cartons" so the UI can
      // show the accountant exactly how the total was built, e.g.
      // "20 x 800 + 12 x 900 = 26800" when two products share a material.
      const materialsAgg: Record<string, { name: string; qty: number; unitType: string; terms: string[] }> = {};

      // Create BOM items from plan items — recipe-bearing products get
      // has_recipe=true (they decompose into materials below) and skip
      // finished-goods in-stock tracking, which only applies to products
      // Kafi purchases ready-made (no recipe on file).
      const rows = (planItems ?? []).map((it: Record<string, unknown>, i: number) => {
        const prod = it.sc_products as Record<string, unknown> | null;
        const cartons = Number(it.cartons || 0);
        const pcsPerCarton = Number(prod?.pcs_per_carton || 0);
        const sourceId = prod?.source_product_id as string | undefined;
        const recipe = sourceId ? recipesByProduct[sourceId] : undefined;
        const hasRecipe = !!recipe && recipe.length > 0;

        if (hasRecipe) {
          for (const line of recipe!) {
            const entry = (materialsAgg[line.material_id] ||= { name: line.material_name, qty: 0, unitType: line.unit_type, terms: [] });
            if (line.unit_type === "PCS") {
              entry.qty += line.qty * cartons;
              entry.terms.push(`${line.qty} x ${cartons}`);
            } else {
              // CONTAINER / FIXED — once per shipment, not summed per line
              entry.qty = Math.max(entry.qty, line.qty);
              if (entry.terms.length === 0) entry.terms.push(`${line.qty} (per shipment)`);
            }
          }
        }

        const inStock = hasRecipe ? 0 : Math.min(productStockMap[it.product_id as string] || 0, cartons);
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
          in_stock: inStock,
          to_order: Math.max(cartons - inStock, 0),
          item_status: "pending",
          remarks: (it.remarks as string) || "",
          sort_order: i,
          has_recipe: hasRecipe,
        };
      });

      if (rows.length > 0) {
        const { error: insErr } = await supabase.from("sc_bom_items").insert(rows);
        if (insErr) throw insErr;
      }

      const materialIds2 = Object.keys(materialsAgg);
      let materialStockMap: Record<string, number> = {};
      if (materialIds2.length > 0) {
        const { data: invRows } = await supabase.from("sc_inventory").select("material_id, qty_on_hand").eq("item_type", "material").in("material_id", materialIds2);
        for (const r of invRows ?? []) materialStockMap[r.material_id as string] = Number(r.qty_on_hand || 0);
      }

      const materialRows2 = Object.entries(materialsAgg)
        .sort((a, b) => (materialMeta[a[0]]?.category || "").localeCompare(materialMeta[b[0]]?.category || "") || a[1].name.localeCompare(b[1].name))
        .map(([materialId, m], i) => {
          const qtyNeeded = Math.round(m.qty * 1000) / 1000;
          const qtyInStock = Math.min(materialStockMap[materialId] || 0, qtyNeeded);
          return {
            bom_id: bom.id,
            material_id: materialId,
            material_name: m.name,
            unit: materialMeta[materialId]?.unit || "",
            category: materialMeta[materialId]?.category || "",
            qty_needed: qtyNeeded,
            est_cost: Math.round(m.qty * (materialMeta[materialId]?.price || 0) * 100) / 100,
            unit_type: m.unitType,
            calc_breakdown: `${m.terms.join(" + ")} = ${qtyNeeded}`,
            qty_in_stock: qtyInStock,
            extra_qty: 0,
            qty_to_order: Math.max(qtyNeeded - qtyInStock, 0),
            sort_order: i,
          };
        });

      if (materialRows2.length > 0) {
        const { error: matErr } = await supabase.from("sc_bom_materials").insert(materialRows2);
        if (matErr) throw matErr;
      }

      // Notify subscribers that the BOM stage is done
      const totalCartons = rows.reduce((s, r) => s + r.cartons_required, 0);
      const notified = await notifyEvent({
        event: "bom_generated",
        refId: bom.id,
        text: `*KAFI — BOM GENERATED*\nFrom plan "${plan.plan_name}"${plan.buyer_name ? ` (${plan.buyer_name})` : ""}\n${rows.length} product line${rows.length !== 1 ? "s" : ""}, ${totalCartons} cartons · ${materialRows2.length} raw material${materialRows2.length !== 1 ? "s" : ""} to procure.`,
        subject: `BOM generated — ${plan.plan_name}`,
      });

      return Response.json({ ok: true, id: bom.id, notified });
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

    // Save edits to raw-material rows: Qty In Stock / Extra Qty / remarks.
    // Qty To Order = max(required - in stock, 0) + extra (Hafeez's buffer).
    if (body.action === "save-materials" && Array.isArray(body.items)) {
      for (const it of body.items) {
        const qtyInStock = Number(it.qtyInStock || 0);
        const extraQty = Number(it.extraQty || 0);
        const required = Number(it.qtyNeeded || 0);
        const qtyToOrder = Math.max(required - qtyInStock, 0) + extraQty;
        const { error } = await supabase
          .from("sc_bom_materials")
          .update({ qty_in_stock: qtyInStock, extra_qty: extraQty, qty_to_order: qtyToOrder, remarks: it.remarks || "" })
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
