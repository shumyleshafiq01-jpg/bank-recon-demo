import { ensureSheet, readSheet, updateRow, writeRows, deleteRow } from "@/lib/google-sheets";

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

    // Reconcile per-row instead of wiping the sheet: upsert each provided card,
    // then delete only the cards that were removed. No clearAndWrite, so a
    // concurrent read can never catch the sheet mid-wipe.
    const rows = await readSheet(SHEET);
    const existing = new Map<string, number>();
    rows.forEach((r, i) => { if (i > 0 && r[0]) existing.set(r[0], i + 1); });
    const providedIds = new Set(freightCards.map(c => String(c.id ?? "")));

    for (const c of freightCards) {
      const id = String(c.id ?? "");
      if (!id) continue;
      const row = [id, String(c.destination ?? ""), String(c.country ?? ""),
        String(c.freightPerCarton ?? 0), String(c.currency ?? "USD"), now];
      const ri = existing.get(id);
      if (ri) await updateRow(SHEET, ri, row);
      else await writeRows(SHEET, [row]);
    }
    // Delete removed cards bottom-up so earlier row indices stay valid.
    const toDelete = [...existing.entries()].filter(([id]) => !providedIds.has(id)).map(([, ri]) => ri).sort((a, b) => b - a);
    for (const ri of toDelete) await deleteRow(SHEET, ri);

    return Response.json({ saved: true });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
