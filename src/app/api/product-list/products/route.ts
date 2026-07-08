import { ensureSheet, readSheet, updateRow, writeRows, deleteRow } from "@/lib/google-sheets";

const SHEET = "PL_Products";
const HEADERS = ["id","sku","name","productType","fclQty","grossProfitPct","imageUrl","notes","active","specs","packagingDesc","brandId","category"];

async function init() { await ensureSheet(SHEET, HEADERS); }

function parseRow(r: string[]) {
  return {
    id: r[0] ?? "", sku: r[1] ?? "", name: r[2] ?? "", productType: r[3] ?? "FINISH GOODS",
    fclQty: parseFloat(r[4]) || 1500,
    grossProfitPct: parseFloat(r[5]) || 50,
    imageUrl: r[6] ?? "",
    notes: r[7] ?? "", active: r[8] !== "false",
    specs: r[9] ?? "", packagingDesc: r[10] ?? "",
    brandId: r[11] ?? "",
    category: r[12] ?? "",
  };
}

function serializeRow(p: Record<string, unknown>): string[] {
  return [
    String(p.id ?? ""), String(p.sku ?? ""), String(p.name ?? ""), String(p.productType ?? "FINISH GOODS"),
    String(p.fclQty ?? 1500), String(p.grossProfitPct ?? 50),
    String(p.imageUrl ?? ""), String(p.notes ?? ""),
    String(p.active !== false), String(p.specs ?? ""), String(p.packagingDesc ?? ""),
    String(p.brandId ?? ""), String(p.category ?? ""),
  ];
}

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
