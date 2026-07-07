import { ensureSheet, readSheet, updateRow, writeRows, deleteRow } from "@/lib/google-sheets";

const SHEET = "BankContacts";
const HEADERS = ["id","name","designation","phone","ptcl","email","bankBranch","notes"];

async function init() { await ensureSheet(SHEET, HEADERS); }

function parseRow(r: string[]) {
  return { id: r[0]??"", name: r[1]??"", designation: r[2]??"", phone: r[3]??"",
    ptcl: r[4]??"", email: r[5]??"", bankBranch: r[6]??"", notes: r[7]??"" };
}

export async function GET() {
  try {
    await init();
    const rows = await readSheet(SHEET);
    return Response.json({ contacts: rows.slice(1).filter(r => r[0]).map(parseRow) });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

function serializeRow(c: Record<string, string>): string[] {
  return HEADERS.map(h => String(c[h] ?? ""));
}

export async function POST(request: Request) {
  try {
    await init();
    const body = await request.json() as { action?: string; contact?: Record<string,string>; id?: string; contacts?: Record<string,string>[] };

    if (body.action === "upsert" && body.contact) {
      const rows = await readSheet(SHEET);
      const idx = rows.findIndex((r, i) => i > 0 && r[0] === body.contact!.id);
      const row = serializeRow(body.contact);
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

    if (body.contacts) {
      const rows = await readSheet(SHEET);
      const idById = new Map<string, number>();
      rows.forEach((r, i) => { if (i > 0 && r[0]) idById.set(r[0], i + 1); });
      for (const c of body.contacts) {
        if (!c.id) continue;
        const row = serializeRow(c);
        const sr = idById.get(c.id);
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
