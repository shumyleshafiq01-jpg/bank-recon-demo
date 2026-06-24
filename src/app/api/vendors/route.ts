import { ensureSheet, readSheet, clearAndWrite } from "@/lib/google-sheets";

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
    const { vendors } = await request.json() as { vendors: Record<string,string>[] };
    await clearAndWrite(SHEET, [HEADERS, ...vendors.map(serializeRow)]);
    return Response.json({ saved: true });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
