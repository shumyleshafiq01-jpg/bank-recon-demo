import { ensureSheet, readSheet, clearAndWrite } from "@/lib/google-sheets";

const SHEET = "PC_Denominations";
const HEADERS = ["id", "date", "holder", "denominationsJson", "total", "countedBy", "createdAt"];

async function init() { await ensureSheet(SHEET, HEADERS); }

function parseRow(r: string[]) {
  let denominations: Record<string, number> = {};
  try { denominations = JSON.parse(r[3] ?? "{}"); } catch { denominations = {}; }
  return {
    id: r[0] ?? "", date: r[1] ?? "", holder: (r[2] ?? "aa2") as "aa1" | "aa2",
    denominations, total: parseFloat(r[4]) || 0, countedBy: r[5] ?? "", createdAt: r[6] ?? "",
  };
}

export async function GET() {
  try {
    await init();
    const rows = await readSheet(SHEET);
    return Response.json({ counts: rows.slice(1).filter(r => r[0]).map(parseRow) });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await init();
    const body = await request.json() as {
      action: "create" | "delete";
      count?: { date: string; holder: "aa1" | "aa2"; denominations: Record<string, number>; total: number; countedBy: string };
      id?: string;
    };

    if (body.action === "create" && body.count) {
      const rows = await readSheet(SHEET);
      const c = body.count;
      const row = [crypto.randomUUID(), c.date, c.holder, JSON.stringify(c.denominations), String(c.total), c.countedBy, new Date().toISOString()];
      rows.push(row);
      await clearAndWrite(SHEET, rows);
      return Response.json({ saved: true });
    }

    if (body.action === "delete" && body.id) {
      const rows = await readSheet(SHEET);
      const filtered = [rows[0], ...rows.slice(1).filter(r => r[0] !== body.id)];
      await clearAndWrite(SHEET, filtered as string[][]);
      return Response.json({ deleted: true });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
