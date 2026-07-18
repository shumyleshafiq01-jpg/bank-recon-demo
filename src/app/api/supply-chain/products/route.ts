import { supabase } from "@/lib/supabase";
import { getSession } from "@/lib/auth";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { data, error } = await supabase
      .from("sc_products")
      .select("*")
      .eq("active", true)
      .order("brand")
      .order("sort_order");

    if (error) throw error;
    return Response.json({ products: data ?? [] });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();

    // Add a product row by referencing an existing Product List product.
    // Products can only be created in the Product List, never here — the
    // Supply Chain master just links to one and holds its carton specs.
    if (body.action === "add-from-catalog") {
      if (!body.sourceProductId) {
        return Response.json({ error: "sourceProductId required" }, { status: 400 });
      }

      // Prevent linking the same product twice
      const { data: existing } = await supabase
        .from("sc_products")
        .select("id")
        .eq("source_product_id", body.sourceProductId)
        .eq("active", true)
        .maybeSingle();
      if (existing) {
        return Response.json({ error: "This product is already in the master" }, { status: 409 });
      }

      // Rice is weight-limited, not carton-count limited — tracked in bags/PMT
      const isRice = body.sourceDivision === "rice";

      const { error } = await supabase.from("sc_products").insert({
        brand: body.brand || "",
        product_name: body.productName || "",
        source_product_id: body.sourceProductId,
        source_division: body.sourceDivision || "foods_spices",
        packing_desc: body.packingDesc || "",
        length_in: 0,
        width_in: 0,
        height_in: 0,
        max_20ft: 0,
        max_40ft: 0,
        max_40hc: 0,
        net_weight_kg: 0,
        pcs_per_carton: 0,
        unit_type: isRice ? "bag" : "carton",
        sort_order: Number(body.sortOrder || 0),
      });
      if (error) throw error;
      return Response.json({ ok: true });
    }

    if (body.action === "update" && body.id) {
      const updates: Record<string, unknown> = {};
      if (body.brand !== undefined) updates.brand = body.brand;
      if (body.productName !== undefined) updates.product_name = body.productName;
      if (body.packingDesc !== undefined) updates.packing_desc = body.packingDesc;
      if (body.lengthIn !== undefined) updates.length_in = Number(body.lengthIn);
      if (body.widthIn !== undefined) updates.width_in = Number(body.widthIn);
      if (body.heightIn !== undefined) updates.height_in = Number(body.heightIn);
      if (body.max20ft !== undefined) updates.max_20ft = Number(body.max20ft);
      if (body.max40ft !== undefined) updates.max_40ft = Number(body.max40ft);
      if (body.max40hc !== undefined) updates.max_40hc = Number(body.max40hc);
      if (body.netWeightKg !== undefined) updates.net_weight_kg = Number(body.netWeightKg);
      if (body.pcsPerCarton !== undefined) updates.pcs_per_carton = Number(body.pcsPerCarton);
      if (body.sortOrder !== undefined) updates.sort_order = Number(body.sortOrder);
      updates.updated_at = new Date().toISOString();

      const { error } = await supabase.from("sc_products").update(updates).eq("id", body.id);
      if (error) throw error;
      return Response.json({ ok: true });
    }

    if (body.action === "delete" && body.id) {
      const { error } = await supabase.from("sc_products").update({ active: false }).eq("id", body.id);
      if (error) throw error;
      return Response.json({ ok: true });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
