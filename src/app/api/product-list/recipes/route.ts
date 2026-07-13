import { supabase } from "@/lib/supabase";

const TABLE = "pl_recipes";

function toFrontend(row: Record<string, unknown>) {
  return {
    id: row.id ?? "",
    productId: row.product_id ?? "",
    materialId: row.material_id ?? "",
    materialName: row.material_name ?? "",
    qty: parseFloat(String(row.qty)) || 0,
    unitType: row.unit_type ?? "PCS",
    sortOrder: parseInt(String(row.sort_order)) || 0,
    priceOverride: row.price_override == null ? null : (parseFloat(String(row.price_override)) || 0),
  };
}

function toDb(item: Record<string, unknown>, productId: string, sortOrder: number) {
  return {
    id: item.id ?? "",
    product_id: productId,
    material_id: item.materialId ?? "",
    material_name: item.materialName ?? "",
    qty: item.qty ?? 0,
    unit_type: item.unitType ?? "PCS",
    sort_order: sortOrder,
    price_override: item.priceOverride == null ? null : item.priceOverride,
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get("productId");

    let query = supabase.from(TABLE).select();
    if (productId) query = query.eq("product_id", productId);
    const { data, error } = await query;
    if (error) throw error;

    return Response.json({ items: (data ?? []).map(toFrontend) });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { action: string; productId?: string; items?: Record<string, unknown>[]; item?: Record<string, unknown> };

    if (body.action === "save-product-recipe" && body.productId && body.items) {
      // Delete all existing rows for this product, then insert new ones
      const { error: delError } = await supabase.from(TABLE).delete().eq("product_id", body.productId);
      if (delError) throw delError;

      const rows = body.items.map((item, i) => toDb(item, body.productId!, i));
      if (rows.length > 0) {
        const { error: insError } = await supabase.from(TABLE).insert(rows);
        if (insError) throw insError;
      }
      return Response.json({ saved: true });
    }

    if (body.action === "delete-product" && body.productId) {
      const { error } = await supabase.from(TABLE).delete().eq("product_id", body.productId);
      if (error) throw error;
      return Response.json({ deleted: true });
    }

    if (body.action === "bulk" && body.items) {
      // Delete all then insert — mirrors the old clearAndWrite behavior
      const { error: delError } = await supabase.from(TABLE).delete().neq("id", "");
      if (delError) throw delError;

      const rows = body.items.map((item, i) => ({
        id: item.id ?? "",
        product_id: item.productId ?? "",
        material_id: item.materialId ?? "",
        material_name: item.materialName ?? "",
        qty: item.qty ?? 0,
        unit_type: item.unitType ?? "PCS",
        sort_order: i,
        price_override: item.priceOverride == null ? null : item.priceOverride,
      }));
      if (rows.length > 0) {
        const { error: insError } = await supabase.from(TABLE).insert(rows);
        if (insError) throw insError;
      }
      return Response.json({ saved: true });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
