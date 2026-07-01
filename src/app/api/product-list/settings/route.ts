import { ensureSheet, readSheet, clearAndWrite } from "@/lib/google-sheets";

const SHEET = "PL_Settings";
const HEADERS = ["key", "value"];

async function init() { await ensureSheet(SHEET, HEADERS); }

export async function GET() {
  try {
    await init();
    const rows = await readSheet(SHEET);
    const settings: Record<string, string> = {};
    for (const row of rows.slice(1)) { if (row[0]) settings[row[0]] = row[1] ?? ""; }
    return Response.json({
      fcRate: parseFloat(settings.fcRate || "275") || 275,
      currency: settings.currency || "PKR",
      targetCurrency: settings.targetCurrency || "USD",
      adminPct: parseFloat(settings.adminPct || "5") || 5,
      whtPct: parseFloat(settings.whtPct || "2") || 2,
      serviceCharges: parseFloat(settings.serviceCharges || "0") || 0,
      eds: parseFloat(settings.eds || "0") || 0,
      courierCharges: parseFloat(settings.courierCharges || "0") || 0,
    });
  } catch (err) {
    return Response.json({ fcRate: 275, currency: "PKR", targetCurrency: "USD", adminPct: 5, whtPct: 2, serviceCharges: 0, eds: 0, courierCharges: 0 });
  }
}

export async function POST(request: Request) {
  try {
    await init();
    const body = await request.json() as Record<string, string | number>;
    const rows = await readSheet(SHEET);
    const map: Record<string, number> = {};
    for (let i = 1; i < rows.length; i++) { if (rows[i][0]) map[rows[i][0]] = i; }
    const updated = [...rows];
    for (const [key, value] of Object.entries(body)) {
      if (map[key] !== undefined) { updated[map[key]] = [key, String(value)]; }
      else { updated.push([key, String(value)]); }
    }
    await clearAndWrite(SHEET, updated);
    return Response.json({ saved: true });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
