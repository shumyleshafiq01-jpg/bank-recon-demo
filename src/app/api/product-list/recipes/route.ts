import { ensureSheet, readSheet, clearAndWrite } from "@/lib/google-sheets";

const SHEET = "PL_Recipes";
const HEADERS = ["id", "productId", "materialId", "materialName", "qty", "unitType", "sortOrder"];

async function init() { await ensureSheet(SHEET, HEADERS); }

function parseRow(r: string[]) {
  return { id: r[0] ?? "", productId: r[1] ?? "", materialId: r[2] ?? "",
    materialName: r[3] ?? "", qty: parseFloat(r[4]) || 0,
    unitType: r[5] ?? "PCS", sortOrder: parseInt(r[6]) || 0 };
}

export async function GET(request: Request) {
  try {
    await init();
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get("productId");
    const rows = await readSheet(SHEET);
    const items = rows.slice(1).filter(r => r[0] && (!productId || r[1] === productId)).map(parseRow);
    return Response.json({ items });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await init();
    const body = await request.json() as { action: string; productId?: string; items?: Record<string, unknown>[]; item?: Record<string, unknown> };

    if (body.action === "save-product-recipe" && body.productId && body.items) {
      // Replace all items for this product
      const rows = await readSheet(SHEET);
      const others = [rows[0], ...rows.slice(1).filter(r => r[1] !== body.productId)];
      const newRows = body.items.map((item, i) => [
        String(item.id ?? ""), String(body.productId), String(item.materialId ?? ""),
        String(item.materialName ?? ""), String(item.qty ?? 0), String(item.unitType ?? "PCS"), String(i),
      ]);
      await clearAndWrite(SHEET, [...others, ...newRows] as string[][]);
      return Response.json({ saved: true });
    }

    if (body.action === "delete-product" && body.productId) {
      const rows = await readSheet(SHEET);
      const filtered = [rows[0], ...rows.slice(1).filter(r => r[1] !== body.productId)];
      await clearAndWrite(SHEET, filtered as string[][]);
      return Response.json({ deleted: true });
    }

    if (body.action === "bulk" && body.items) {
      const data = [HEADERS, ...body.items.map((item, i) => [
        String(item.id ?? ""), String(item.productId ?? ""), String(item.materialId ?? ""),
        String(item.materialName ?? ""), String(item.qty ?? 0), String(item.unitType ?? "PCS"), String(i),
      ])];
      await clearAndWrite(SHEET, data);
      return Response.json({ saved: true });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
