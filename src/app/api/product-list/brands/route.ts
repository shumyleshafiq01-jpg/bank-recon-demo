import { ensureSheet, readSheet, clearAndWrite, writeRows } from "@/lib/google-sheets";

const SHEET = "PL_Brands";
const HEADERS = ["id", "name", "address", "city", "country", "logoUrl", "createdAt"];

async function init() { await ensureSheet(SHEET, HEADERS); }

function parseRow(r: string[]) {
  return { id: r[0] ?? "", name: r[1] ?? "", address: r[2] ?? "", city: r[3] ?? "",
    country: r[4] ?? "", logoUrl: r[5] ?? "", createdAt: r[6] ?? "" };
}

export async function GET() {
  try {
    await init();
    const rows = await readSheet(SHEET);
    return Response.json({ brands: rows.slice(1).filter(r => r[0]).map(parseRow) });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await init();
    const body = await request.json() as { action: string; brand?: Record<string, unknown> };

    if (body.action === "upsert" && body.brand) {
      const b = body.brand;
      const rows = await readSheet(SHEET);
      const idx = rows.findIndex((r, i) => i > 0 && r[0] === b.id);
      const row = [String(b.id ?? ""), String(b.name ?? ""), String(b.address ?? ""), String(b.city ?? ""),
        String(b.country ?? ""), String(b.logoUrl ?? ""), idx > 0 ? rows[idx][6] : new Date().toISOString()];
      if (idx > 0) { rows[idx] = row; await clearAndWrite(SHEET, rows); }
      else { await writeRows(SHEET, [row]); }
      return Response.json({ saved: true });
    }

    if (body.action === "delete" && body.brand) {
      const rows = await readSheet(SHEET);
      const filtered = [rows[0], ...rows.slice(1).filter(r => r[0] !== body.brand!.id)];
      await clearAndWrite(SHEET, filtered as string[][]);
      return Response.json({ deleted: true });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
