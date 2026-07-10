import { ensureSheet, readSheet, updateRow, writeRows, deleteRow } from "@/lib/google-sheets";

// Rice division products — each row is a full costing sheet (recovery %,
// purchase rate, by-product % breakdown). Separate sheet from PL_Products.
const SHEET = "RICE_Products";
const HEADERS = ["id", "sku", "name", "brandId", "category", "imageUrl", "packagingDesc", "quantity", "recoveryPct", "purchaseRate", "freight", "byproducts", "active"];

function parseRow(r: string[]) {
  let byproducts: { name: string; percent: number }[] = [];
  try { byproducts = JSON.parse(r[11] || "[]"); } catch { byproducts = []; }
  return {
    id: r[0] ?? "", sku: r[1] ?? "", name: r[2] ?? "", brandId: r[3] ?? "", category: r[4] ?? "",
    imageUrl: r[5] ?? "", packagingDesc: r[6] ?? "",
    quantity: parseFloat(r[7]) || 1000, recoveryPct: parseFloat(r[8]) || 90,
    purchaseRate: parseFloat(r[9]) || 0, freight: parseFloat(r[10]) || 0,
    byproducts, active: r[12] !== "false",
  };
}

function serializeRow(p: Record<string, unknown>): string[] {
  return [
    String(p.id ?? ""), String(p.sku ?? ""), String(p.name ?? ""), String(p.brandId ?? ""), String(p.category ?? ""),
    String(p.imageUrl ?? ""), String(p.packagingDesc ?? ""),
    String(p.quantity ?? 1000), String(p.recoveryPct ?? 90), String(p.purchaseRate ?? 0), String(p.freight ?? 0),
    JSON.stringify(p.byproducts ?? []), String(p.active !== false),
  ];
}

async function init() { await ensureSheet(SHEET, HEADERS); }

export async function GET() {
  try {
    await init();
    const rows = await readSheet(SHEET);
    return Response.json({ products: rows.slice(1).filter(r => r[0]).map(parseRow) });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await init();
    const body = await request.json() as { action: string; product?: Record<string, unknown> };

    if (body.action === "upsert" && body.product) {
      const rows = await readSheet(SHEET);
      const idx = rows.findIndex((r, i) => i > 0 && r[0] === body.product!.id);
      const row = serializeRow(body.product);
      if (idx > 0) await updateRow(SHEET, idx + 1, row);
      else await writeRows(SHEET, [row]);
      return Response.json({ saved: true });
    }

    if (body.action === "delete" && body.product) {
      const rows = await readSheet(SHEET);
      const idx = rows.findIndex((r, i) => i > 0 && r[0] === body.product!.id);
      if (idx > 0) await deleteRow(SHEET, idx + 1);
      return Response.json({ deleted: true });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
