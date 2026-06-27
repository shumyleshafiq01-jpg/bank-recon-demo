import { ensureSheet, readSheet, clearAndWrite } from "@/lib/google-sheets";

const SHEET = "EmpBankDetails";
const HEADERS = ["id","name","designation","phone","bank","acTitle","acNo","branchCode","notes"];

async function init() { await ensureSheet(SHEET, HEADERS); }

function parseRow(r: string[]) {
  return { id: r[0]??"", name: r[1]??"", designation: r[2]??"", phone: r[3]??"",
    bank: r[4]??"", acTitle: r[5]??"", acNo: r[6]??"", branchCode: r[7]??"", notes: r[8]??"" };
}

export async function GET() {
  try {
    await init();
    const rows = await readSheet(SHEET);
    return Response.json({ employees: rows.slice(1).filter(r => r[0]).map(parseRow) });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await init();
    const { employees } = await request.json() as { employees: Record<string,string>[] };
    await clearAndWrite(SHEET, [HEADERS, ...employees.map(e => HEADERS.map(h => String(e[h] ?? "")))]);
    return Response.json({ saved: true });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
