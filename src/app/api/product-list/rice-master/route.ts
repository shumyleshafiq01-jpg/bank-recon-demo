import { ensureSheet, readSheet, updateRow, writeRows, deleteRow } from "@/lib/google-sheets";
import { RICE_DEFAULT_CHARGES } from "@/lib/rice-costing";

// Rice "Master Prices": the shared milling & handling charges (PKR/kg).
// (By-product resale rates are per-product; bag packaging lives in RICE_Bags.
//  Any legacy "byproduct"/"bag" rows in this sheet are ignored.)
const SHEET = "RICE_Master";
const HEADERS = ["id", "kind", "name", "rate", "sortOrder"];

const genId = () => Math.random().toString(36).slice(2, 10);

async function init() { await ensureSheet(SHEET, HEADERS); }

function parseRow(r: string[]) {
  return { id: r[0] ?? "", kind: (r[1] ?? "charge") as "byproduct" | "charge" | "bag", name: r[2] ?? "", rate: parseFloat(r[3]) || 0, sortOrder: parseInt(r[4]) || 0 };
}

async function ensureSeeded() {
  const rows = await readSheet(SHEET);
  const existing = rows.slice(1).filter(r => r[0]).map(parseRow);
  if (existing.some(i => i.kind === "charge")) return;
  const seed = RICE_DEFAULT_CHARGES.map((c, i) => [genId(), "charge", c.name, String(c.rate), String(i)]);
  if (seed.length) await writeRows(SHEET, seed);
}

export async function GET() {
  try {
    await init();
    await ensureSeeded();
    const rows = await readSheet(SHEET);
    const items = rows.slice(1).filter(r => r[0]).map(parseRow).sort((a, b) => a.sortOrder - b.sortOrder);
    return Response.json({
      byproducts: items.filter(i => i.kind === "byproduct"),
      charges: items.filter(i => i.kind === "charge"),
    });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await init();
    const body = await request.json() as { action: string; item?: Record<string, unknown>; id?: string };

    if (body.action === "upsert" && body.item) {
      const it = body.item;
      const rows = await readSheet(SHEET);
      const idx = rows.findIndex((r, i) => i > 0 && r[0] === it.id);
      const row = [String(it.id ?? genId()), String(it.kind ?? "charge"), String(it.name ?? ""), String(it.rate ?? 0), String(it.sortOrder ?? 0)];
      if (idx > 0) await updateRow(SHEET, idx + 1, row);
      else await writeRows(SHEET, [row]);
      return Response.json({ saved: true });
    }

    if (body.action === "delete" && body.id) {
      const rows = await readSheet(SHEET);
      const idx = rows.findIndex((r, i) => i > 0 && r[0] === body.id);
      if (idx > 0) await deleteRow(SHEET, idx + 1);
      return Response.json({ deleted: true });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
