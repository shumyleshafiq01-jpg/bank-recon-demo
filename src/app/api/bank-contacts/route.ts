import { ensureSheet, readSheet, clearAndWrite } from "@/lib/google-sheets";

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

export async function POST(request: Request) {
  try {
    await init();
    const { contacts } = await request.json() as { contacts: Record<string,string>[] };
    await clearAndWrite(SHEET, [HEADERS, ...contacts.map(c => HEADERS.map(h => String(c[h] ?? "")))]);
    return Response.json({ saved: true });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
