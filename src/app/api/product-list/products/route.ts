import { supabase } from "@/lib/supabase";

const TABLE = "pl_products";

function toFrontend(row: Record<string, unknown>) {
  return {
    id: row.id ?? "",
    sku: row.sku ?? "",
    name: row.name ?? "",
    productType: row.product_type ?? "FINISH GOODS",
    fclQty: parseFloat(String(row.fcl_qty)) || 1500,
    grossProfitPct: parseFloat(String(row.gross_profit_pct)) || 50,
    imageUrl: row.image_url ?? "",
    notes: row.notes ?? "",
    active: row.active !== false,
    specs: row.specs ?? "",
    packagingDesc: row.packaging_desc ?? "",
    brandId: row.brand_id ?? "",
    category: row.category ?? "",
  };
}

function toDb(p: Record<string, unknown>) {
  return {
    id: p.id ?? "",
    sku: p.sku ?? "",
    name: p.name ?? "",
    product_type: p.productType ?? "FINISH GOODS",
    fcl_qty: p.fclQty ?? 1500,
    gross_profit_pct: p.grossProfitPct ?? 50,
    image_url: p.imageUrl ?? "",
    notes: p.notes ?? "",
    active: p.active !== false,
    specs: p.specs ?? "",
    packaging_desc: p.packagingDesc ?? "",
    brand_id: p.brandId ?? "",
    category: p.category ?? "",
  };
}

export async function GET() {
  try {
    const { data, error } = await supabase.from(TABLE).select();
    if (error) throw error;
    return Response.json({ products: (data ?? []).map(toFrontend) });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { action: string; product?: Record<string, unknown> };

    if (body.action === "upsert" && body.product) {
      const { error } = await supabase.from(TABLE).upsert(toDb(body.product), { onConflict: "id" });
      if (error) throw error;
      return Response.json({ saved: true });
    }

    if (body.action === "delete" && body.product) {
      const { error } = await supabase.from(TABLE).delete().eq("id", body.product.id);
      if (error) throw error;
      return Response.json({ deleted: true });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
