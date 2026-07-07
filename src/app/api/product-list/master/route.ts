import { ensureSheet, readSheet, clearAndWrite, updateRow, writeRows, deleteRow } from "@/lib/google-sheets";

const SHEET = "PL_Master";
const HEADERS = ["id", "name", "unit", "category", "pricePerUnit", "updatedAt", "defaultUnitType"];

async function init() { await ensureSheet(SHEET, HEADERS); }

function parseRow(r: string[]) {
  return { id: r[0] ?? "", name: r[1] ?? "", unit: r[2] ?? "", category: r[3] ?? "",
    pricePerUnit: parseFloat(r[4]) || 0, updatedAt: r[5] ?? "", defaultUnitType: (r[6] || "PCS") as "PCS" | "CONTAINER" | "FIXED" };
}

export async function GET() {
  try {
    await init();
    const rows = await readSheet(SHEET);
    return Response.json({ materials: rows.slice(1).filter(r => r[0]).map(parseRow) });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await init();
    const body = await request.json() as { action: string; material?: Record<string, unknown>; materials?: Record<string, unknown>[] };

    if (body.action === "upsert" && body.material) {
      const m = body.material;
      const rows = await readSheet(SHEET);
      const idx = rows.findIndex((r, i) => i > 0 && r[0] === m.id);
      const row = [String(m.id ?? ""), String(m.name ?? ""), String(m.unit ?? ""), String(m.category ?? ""),
        String(m.pricePerUnit ?? 0), new Date().toISOString(), String(m.defaultUnitType ?? "PCS")];
      if (idx > 0) await updateRow(SHEET, idx + 1, row);
      else await writeRows(SHEET, [row]);
      return Response.json({ saved: true });
    }

    if (body.action === "delete" && body.material) {
      const rows = await readSheet(SHEET);
      const idx = rows.findIndex((r, i) => i > 0 && r[0] === body.material!.id);
      if (idx > 0) await deleteRow(SHEET, idx + 1);
      return Response.json({ deleted: true });
    }

    if (body.action === "bulk" && body.materials) {
      const data = [HEADERS, ...body.materials.map(m => [
        String(m.id ?? ""), String(m.name ?? ""), String(m.unit ?? ""), String(m.category ?? ""),
        String(m.pricePerUnit ?? 0), new Date().toISOString(), String(m.defaultUnitType ?? "PCS"),
      ])];
      await clearAndWrite(SHEET, data);
      return Response.json({ saved: true });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
