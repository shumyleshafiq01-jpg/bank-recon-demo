import { ensureSheet, readSheet, updateRow, writeRows, deleteRow } from "@/lib/google-sheets";
import { RICE_DEFAULT_BAGS } from "@/lib/rice-costing";

// Rice bag packaging — the component prices per bag type & size. The $/PMT
// surcharge (added at CNF) is CALCULATED from these via calcBagRate, so updating
// a bag's PKR prices or the dollar rate re-prices every quote automatically.
const SHEET = "RICE_Bags";
const HEADERS = ["id", "type", "sizeLabel", "outerQty", "outerPKR", "innerQty", "innerPKR", "masterQty", "masterPKR", "labourPKR", "sortOrder"];

const genId = () => Math.random().toString(36).slice(2, 10);

async function init() { await ensureSheet(SHEET, HEADERS); }

function parseRow(r: string[]) {
  return {
    id: r[0] ?? "", type: r[1] ?? "", sizeLabel: r[2] ?? "",
    outerQty: parseFloat(r[3]) || 0, outerPKR: parseFloat(r[4]) || 0,
    innerQty: parseFloat(r[5]) || 0, innerPKR: parseFloat(r[6]) || 0,
    masterQty: parseFloat(r[7]) || 0, masterPKR: parseFloat(r[8]) || 0,
    labourPKR: parseFloat(r[9]) || 0, sortOrder: parseInt(r[10]) || 0,
  };
}

function serializeRow(b: Record<string, unknown>): string[] {
  return [
    String(b.id ?? genId()), String(b.type ?? ""), String(b.sizeLabel ?? ""),
    String(b.outerQty ?? 0), String(b.outerPKR ?? 0), String(b.innerQty ?? 0), String(b.innerPKR ?? 0),
    String(b.masterQty ?? 0), String(b.masterPKR ?? 0), String(b.labourPKR ?? 0), String(b.sortOrder ?? 0),
  ];
}

// First open: seed the NON WOVEN component prices from Hafeez's sheet so the
// accountant has real, recognisable data to review/adjust.
async function ensureSeeded() {
  const rows = await readSheet(SHEET);
  if (rows.length > 1) return;
  const seed = RICE_DEFAULT_BAGS.map((b, i) => serializeRow({ ...b, id: genId(), sortOrder: i }));
  if (seed.length) await writeRows(SHEET, seed);
}

export async function GET() {
  try {
    await init();
    await ensureSeeded();
    const rows = await readSheet(SHEET);
    const bags = rows.slice(1).filter(r => r[0]).map(parseRow).sort((a, b) => a.sortOrder - b.sortOrder);
    return Response.json({ bags });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await init();
    const body = await request.json() as { action: string; bag?: Record<string, unknown>; id?: string };

    if (body.action === "upsert" && body.bag) {
      const rows = await readSheet(SHEET);
      const idx = rows.findIndex((r, i) => i > 0 && r[0] === body.bag!.id);
      const row = serializeRow(body.bag);
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
