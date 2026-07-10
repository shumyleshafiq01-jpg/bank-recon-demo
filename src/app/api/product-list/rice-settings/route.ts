import { ensureSheet, readSheet, clearAndWrite } from "@/lib/google-sheets";
import { RICE_DEFAULT_SETTINGS } from "@/lib/rice-costing";

const SHEET = "RICE_Settings";
const HEADERS = ["key", "value"];

async function init() { await ensureSheet(SHEET, HEADERS); }

const KEYS = ["fcRate", "whtPct", "servicePct", "edsPct", "courierPct", "interestPct", "profit", "packagingMaterial", "defaultFreight"] as const;

export async function GET() {
  try {
    await init();
    const rows = await readSheet(SHEET);
    const s: Record<string, string> = {};
    for (const row of rows.slice(1)) { if (row[0]) s[row[0]] = row[1] ?? ""; }
    const num = (k: string, d: number) => (s[k] !== undefined && s[k] !== "" ? parseFloat(s[k]) : d);
    return Response.json({
      fcRate: num("fcRate", RICE_DEFAULT_SETTINGS.fcRate),
      whtPct: num("whtPct", RICE_DEFAULT_SETTINGS.whtPct),
      servicePct: num("servicePct", RICE_DEFAULT_SETTINGS.servicePct),
      edsPct: num("edsPct", RICE_DEFAULT_SETTINGS.edsPct),
      courierPct: num("courierPct", RICE_DEFAULT_SETTINGS.courierPct),
      interestPct: num("interestPct", RICE_DEFAULT_SETTINGS.interestPct),
      profit: num("profit", RICE_DEFAULT_SETTINGS.profit),
      packagingMaterial: num("packagingMaterial", RICE_DEFAULT_SETTINGS.packagingMaterial),
      defaultFreight: num("defaultFreight", RICE_DEFAULT_SETTINGS.defaultFreight),
    });
  } catch {
    return Response.json(RICE_DEFAULT_SETTINGS);
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
    for (const key of KEYS) {
      if (body[key] === undefined) continue;
      if (map[key] !== undefined) { updated[map[key]] = [key, String(body[key])]; }
      else { updated.push([key, String(body[key])]); }
    }
    await clearAndWrite(SHEET, updated);
    return Response.json({ saved: true });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
