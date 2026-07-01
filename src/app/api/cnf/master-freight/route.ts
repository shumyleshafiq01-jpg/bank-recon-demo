import { ensureSheet, readSheet, clearAndWrite } from "@/lib/google-sheets";

const SHEET = "CNF_MasterFreight";
const HEADERS = ["id", "destination", "country", "freightPerCarton", "currency", "updatedAt"];

async function init() { await ensureSheet(SHEET, HEADERS); }

function parseRow(r: string[]) {
  return {
    id: r[0] ?? "", destination: r[1] ?? "", country: r[2] ?? "",
    freightPerCarton: parseFloat(r[3]) || 0, currency: r[4] ?? "USD",
    updatedAt: r[5] ?? "",
  };
}

export async function GET() {
  try {
    await init();
    const rows = await readSheet(SHEET);
    return Response.json({ freightCards: rows.slice(1).filter(r => r[0]).map(parseRow) });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await init();
    const { freightCards } = await request.json() as { freightCards: Record<string, unknown>[] };
    const now = new Date().toISOString();
    await clearAndWrite(SHEET, [
      HEADERS,
      ...freightCards.map(c => [
        String(c.id ?? ""), String(c.destination ?? ""), String(c.country ?? ""),
        String(c.freightPerCarton ?? 0), String(c.currency ?? "USD"), now,
      ]),
    ]);
    return Response.json({ saved: true });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
