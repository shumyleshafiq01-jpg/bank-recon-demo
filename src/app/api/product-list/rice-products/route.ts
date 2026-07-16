import { supabase } from "@/lib/supabase";

// Rice division products — each row is a full costing sheet (recovery %,
// purchase rate, by-product % breakdown). Separate table from pl_products.

/* ── snake_case DB row → camelCase frontend object ── */
function toClient(row: Record<string, unknown>) {
  return {
    id: row.id ?? "",
    sku: row.sku ?? "",
    name: row.name ?? "",
    brandId: row.brand_id ?? "",
    category: row.category ?? "",
    imageUrl: row.image_url ?? "",
    packagingDesc: row.packaging_desc ?? "",
    quantity: Number(row.quantity) || 1000,
    recoveryPct: Number(row.recovery_pct) || 90,
    purchaseRate: Number(row.purchase_rate) || 0,
    freight: Number(row.freight) || 0,
    profit: Number(row.profit ?? 50),
    byproducts: row.byproducts ?? [],
    active: row.active !== false,
  };
}

/* ── camelCase frontend object → snake_case DB row ── */
function toRow(p: Record<string, unknown>) {
  return {
    id: String(p.id ?? ""),
    sku: String(p.sku ?? ""),
    name: String(p.name ?? ""),
    brand_id: String(p.brandId ?? ""),
    category: String(p.category ?? ""),
    image_url: String(p.imageUrl ?? ""),
    packaging_desc: String(p.packagingDesc ?? ""),
    quantity: Number(p.quantity) || 1000,
    recovery_pct: Number(p.recoveryPct) || 90,
    purchase_rate: Number(p.purchaseRate) || 0,
    freight: Number(p.freight) || 0,
    profit: Number(p.profit ?? 50),
    byproducts: p.byproducts ?? [],
    active: p.active !== false,
  };
}

export async function GET() {
  try {
    const { data, error } = await supabase.from("rice_products").select("*");
    if (error) throw error;
    return Response.json({ products: (data ?? []).map(toClient) });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { action: string; product?: Record<string, unknown> };

    if (body.action === "upsert" && body.product) {
      const row = toRow(body.product);
      const { error } = await supabase.from("rice_products").upsert(row, { onConflict: "id" });
      if (error) throw error;
      return Response.json({ saved: true });
    }

    if (body.action === "delete" && body.product) {
      const { error } = await supabase.from("rice_products").delete().eq("id", body.product.id);
      if (error) throw error;
      return Response.json({ deleted: true });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
