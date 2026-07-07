import { ensureSheet, readSheet, updateRow, writeRows, deleteRow } from "@/lib/google-sheets";

const SHEET = "VB_Vendors";
const HEADERS = ["id","vendorName","contactPerson","commodity","phone","bank","acTitle","acNo","branchCode","notes"];

async function init() { await ensureSheet(SHEET, HEADERS); }

function parseRow(r: string[]) {
  return { id: r[0]??"", vendorName: r[1]??"", contactPerson: r[2]??"", commodity: r[3]??"",
    phone: r[4]??"", bank: r[5]??"", acTitle: r[6]??"", acNo: r[7]??"",
    branchCode: r[8]??"", notes: r[9]??"" };
}

function serializeRow(v: Record<string,string>): string[] {
  return HEADERS.map(h => String(v[h] ?? ""));
}

export async function GET() {
  try {
    await init();
    const rows = await readSheet(SHEET);
    return Response.json({ vendors: rows.slice(1).filter(r => r[0]).map(parseRow) });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await init();
    const body = await request.json() as { action?: string; vendor?: Record<string,string>; id?: string; vendors?: Record<string,string>[] };

    if (body.action === "upsert" && body.vendor) {
      const rows = await readSheet(SHEET);
      const idx = rows.findIndex((r, i) => i > 0 && r[0] === body.vendor!.id);
      const row = serializeRow(body.vendor);
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

    // Legacy whole-array path (older cached tabs) — merge only, never clear.
    if (body.vendors) {
      const rows = await readSheet(SHEET);
      const idById = new Map<string, number>();
      rows.forEach((r, i) => { if (i > 0 && r[0]) idById.set(r[0], i + 1); });
      for (const v of body.vendors) {
        if (!v.id) continue;
        const row = serializeRow(v);
        const sr = idById.get(v.id);
        if (sr) await updateRow(SHEET, sr, row);
        else await writeRows(SHEET, [row]);
      }
      return Response.json({ saved: true, merged: true });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
