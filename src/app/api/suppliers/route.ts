import { ensureSheet, readSheet, clearAndWrite } from "@/lib/google-sheets";

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
    const { suppliers } = await request.json() as { suppliers: Record<string,string>[] };
    await clearAndWrite(SHEET, [HEADERS, ...suppliers.map(serializeRow)]);
    return Response.json({ saved: true });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
