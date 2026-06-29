import { ensureSheet, readSheet, clearAndWrite } from "@/lib/google-sheets";

const SHEET = "DirectoryConfig";
const HEADERS = ["key", "value"];

const DEFAULTS = {
  supplier_categories: ["Fried Onion","Spices","Paste / Pickle / Chutney","Sauces & Mayo","Vermicelli","Pheni / Bakery","Custard & Jelly","Fresh Vegetables","Food Technologist","Packaging","Logistics / Transport","Other"],
  vendor_banks: ["MEEZAN","HMB","ABL","HBL","UBL","MCB","SCB","FAYSAL","BAH (BAHL)","ASKARI","SILK BANK","BANK ISLAMI","ALLIED","DIB","JS BANK","Other"],
};

async function init() { await ensureSheet(SHEET, HEADERS); }

async function getConfig(): Promise<Record<string, string[]>> {
  const rows = await readSheet(SHEET);
  const cfg: Record<string, string[]> = { ...DEFAULTS };
  for (const row of rows.slice(1)) {
    if (row[0] && row[1]) {
      try { cfg[row[0]] = JSON.parse(row[1]); } catch { /* ignore */ }
    }
  }
  return cfg;
}

export async function GET() {
  try {
    await init();
    return Response.json(await getConfig());
  } catch (err) {
    return Response.json(DEFAULTS);
  }
}

export async function POST(request: Request) {
  try {
    await init();
    const body = await request.json() as { key: string; values: string[] };
    const rows = await readSheet(SHEET);
    const idx = rows.findIndex((r, i) => i > 0 && r[0] === body.key);
    const row = [body.key, JSON.stringify(body.values)];
    if (idx > 0) { rows[idx] = row; await clearAndWrite(SHEET, rows); }
    else { rows.push(row); await clearAndWrite(SHEET, rows); }
    return Response.json({ saved: true });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
