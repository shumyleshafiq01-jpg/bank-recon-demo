import { ensureSheet, readSheet, updateRow, writeRows, deleteRow } from "@/lib/google-sheets";

// Rice division categories — separate sheet from Food & Spices (PL_Categories).
const SHEET = "RICE_Categories";
const HEADERS = ["id", "name", "createdAt"];

async function init() { await ensureSheet(SHEET, HEADERS); }

function parseRow(r: string[]) {
  return { id: r[0] ?? "", name: r[1] ?? "", createdAt: r[2] ?? "" };
}

export async function GET() {
  try {
    await init();
    const rows = await readSheet(SHEET);
    return Response.json({ categories: rows.slice(1).filter(r => r[0]).map(parseRow) });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await init();
    const body = await request.json() as { action: string; category?: Record<string, unknown>; id?: string };

    if (body.action === "upsert" && body.category) {
      const c = body.category;
      const rows = await readSheet(SHEET);
      const idx = rows.findIndex((r, i) => i > 0 && r[0] === c.id);
      const row = [String(c.id ?? ""), String(c.name ?? ""), idx > 0 ? rows[idx][2] : new Date().toISOString()];
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
