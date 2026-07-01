import { ensureSheet, readSheet, clearAndWrite } from "@/lib/google-sheets";

const SHEET = "PC_Handovers";
const HEADERS = ["id", "date", "holder", "amount", "notes", "givenBy", "createdAt"];

async function init() { await ensureSheet(SHEET, HEADERS); }

function parseRow(r: string[]) {
  return {
    id: r[0] ?? "", date: r[1] ?? "", holder: (r[2] ?? "aa2") as "aa1" | "aa2",
    amount: parseFloat(r[3]) || 0, notes: r[4] ?? "", givenBy: r[5] ?? "", createdAt: r[6] ?? "",
  };
}

export async function GET() {
  try {
    await init();
    const rows = await readSheet(SHEET);
    return Response.json({ handovers: rows.slice(1).filter(r => r[0]).map(parseRow) });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await init();
    const body = await request.json() as {
      action: "create" | "delete";
      handover?: { date: string; holder: "aa1" | "aa2"; amount: number; notes: string; givenBy: string };
      id?: string;
    };

    if (body.action === "create" && body.handover) {
      const rows = await readSheet(SHEET);
      const h = body.handover;
      const row = [crypto.randomUUID(), h.date, h.holder, String(h.amount), h.notes, h.givenBy, new Date().toISOString()];
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
