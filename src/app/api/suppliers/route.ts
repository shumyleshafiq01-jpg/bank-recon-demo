import { ensureSheet, readSheet, updateRow, writeRows, deleteRow } from "@/lib/google-sheets";

const SHEET = "SC_Suppliers";
const HEADERS = ["id","category","companyName","contactPerson","jobTitle","phone","service","address","city","product","visitStatus","grading","notes"];

async function init() { await ensureSheet(SHEET, HEADERS); }

function parseRow(r: string[]) {
  return { id: r[0]??"", category: r[1]??"", companyName: r[2]??"", contactPerson: r[3]??"",
    jobTitle: r[4]??"", phone: r[5]??"", service: r[6]??"", address: r[7]??"", city: r[8]??"",
    product: r[9]??"", visitStatus: r[10]??"", grading: r[11]??"", notes: r[12]??"" };
}

function serializeRow(v: Record<string,string>): string[] {
  return HEADERS.map(h => String(v[h] ?? ""));
}

export async function GET() {
  try {
    await init();
    const rows = await readSheet(SHEET);
    return Response.json({ suppliers: rows.slice(1).filter(r => r[0]).map(parseRow) });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await init();
    const body = await request.json() as { action?: string; supplier?: Record<string,string>; id?: string; suppliers?: Record<string,string>[] };

    if (body.action === "upsert" && body.supplier) {
      const rows = await readSheet(SHEET);
      const idx = rows.findIndex((r, i) => i > 0 && r[0] === body.supplier!.id);
      const row = serializeRow(body.supplier);
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

    if (body.suppliers) {
      const rows = await readSheet(SHEET);
      const idById = new Map<string, number>();
      rows.forEach((r, i) => { if (i > 0 && r[0]) idById.set(r[0], i + 1); });
      for (const v of body.suppliers) {
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
