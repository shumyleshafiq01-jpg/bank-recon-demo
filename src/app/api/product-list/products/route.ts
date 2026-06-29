import { ensureSheet, readSheet, clearAndWrite, writeRows } from "@/lib/google-sheets";

const SHEET = "PL_Products";
const HEADERS = ["id","sku","name","productType","fclQty","adminPct","grossProfitPct","whtPct","serviceCharges","eds","courierCharges","imageUrl","notes","active"];

async function init() { await ensureSheet(SHEET, HEADERS); }

function parseRow(r: string[]) {
  return {
    id: r[0] ?? "", sku: r[1] ?? "", name: r[2] ?? "", productType: r[3] ?? "FINISH GOODS",
    fclQty: parseFloat(r[4]) || 1500, adminPct: parseFloat(r[5]) || 5,
    grossProfitPct: parseFloat(r[6]) || 50, whtPct: parseFloat(r[7]) || 2,
    serviceCharges: parseFloat(r[8]) || 0, eds: parseFloat(r[9]) || 0,
    courierCharges: parseFloat(r[10]) || 0, imageUrl: r[11] ?? "",
    notes: r[12] ?? "", active: r[13] !== "false",
  };
}

function serializeRow(p: Record<string, unknown>): string[] {
  return [
    String(p.id ?? ""), String(p.sku ?? ""), String(p.name ?? ""), String(p.productType ?? "FINISH GOODS"),
    String(p.fclQty ?? 1500), String(p.adminPct ?? 5), String(p.grossProfitPct ?? 50),
    String(p.whtPct ?? 2), String(p.serviceCharges ?? 0), String(p.eds ?? 0),
    String(p.courierCharges ?? 0), String(p.imageUrl ?? ""), String(p.notes ?? ""),
    String(p.active !== false),
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
      if (idx > 0) { rows[idx] = row; await clearAndWrite(SHEET, rows); }
      else { await writeRows(SHEET, [row]); }
      return Response.json({ saved: true });
    }

    if (body.action === "delete" && body.product) {
      const rows = await readSheet(SHEET);
      const filtered = [rows[0], ...rows.slice(1).filter(r => r[0] !== body.product!.id)];
      await clearAndWrite(SHEET, filtered as string[][]);
      return Response.json({ deleted: true });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
