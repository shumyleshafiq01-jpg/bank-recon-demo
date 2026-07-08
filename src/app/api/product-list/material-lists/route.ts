import { ensureSheet, readSheet, updateRow, writeRows, deleteRow } from "@/lib/google-sheets";

const SHEET = "PL_MaterialLists";
const HEADERS = ["id", "type", "name", "createdAt"];

const DEFAULT_UNITS = ["PCS", "KG", "GRAM", "LITRE", "METER", "CARTON", "BOTTLE", "POUCH", "CONTAINER"];
const DEFAULT_CATEGORIES = ["Raw Material", "Packaging", "Labels & Seals", "Labor", "Export Charges", "Other"];

async function init() {
  await ensureSheet(SHEET, HEADERS);
  // Seed the sheet with the app's original hardcoded defaults, once, so existing
  // materials keep working exactly as before this became an editable list.
  const rows = await readSheet(SHEET);
  if (rows.length <= 1) {
    const now = new Date().toISOString();
    const seedRows = [
      ...DEFAULT_UNITS.map(name => [crypto.randomUUID(), "unit", name, now]),
      ...DEFAULT_CATEGORIES.map(name => [crypto.randomUUID(), "category", name, now]),
    ];
    await writeRows(SHEET, seedRows);
  }
}

function parseRow(r: string[]) {
  return { id: r[0] ?? "", type: (r[1] ?? "unit") as "unit" | "category", name: r[2] ?? "", createdAt: r[3] ?? "" };
}

export async function GET() {
  try {
    await init();
    const rows = await readSheet(SHEET);
    const items = rows.slice(1).filter(r => r[0]).map(parseRow);
    return Response.json({
      units: items.filter(i => i.type === "unit"),
      categories: items.filter(i => i.type === "category"),
    });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await init();
    const body = await request.json() as { action: string; item?: { id: string; type: "unit" | "category"; name: string }; id?: string };

    if (body.action === "upsert" && body.item) {
      const it = body.item;
      const rows = await readSheet(SHEET);
      const idx = rows.findIndex((r, i) => i > 0 && r[0] === it.id);
      const row = [it.id, it.type, it.name, idx > 0 ? rows[idx][3] : new Date().toISOString()];
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
