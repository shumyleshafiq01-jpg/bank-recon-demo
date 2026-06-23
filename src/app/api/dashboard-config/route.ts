import { ensureSheet, readSheet, clearAndWrite } from "@/lib/google-sheets";

const SHEET = "DashboardConfig";
const HEADERS = ["key", "value"];

async function init() {
  await ensureSheet(SHEET, HEADERS);
}

async function getConfig(): Promise<Record<string, string>> {
  const rows = await readSheet(SHEET);
  const config: Record<string, string> = {};
  for (const row of rows.slice(1)) {
    if (row[0]) config[row[0]] = row[1] ?? "";
  }
  return config;
}

export async function GET() {
  try {
    await init();
    const config = await getConfig();
    const hidden = config.hidden_modules ? JSON.parse(config.hidden_modules) : [];
    return Response.json({ hiddenModules: hidden });
  } catch (err) {
    return Response.json({ hiddenModules: [] });
  }
}

export async function POST(request: Request) {
  try {
    await init();
    const body = await request.json() as { hiddenModules: string[] };
    const rows = await readSheet(SHEET);

    // Find or create the hidden_modules row
    let found = false;
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] === "hidden_modules") {
        rows[i][1] = JSON.stringify(body.hiddenModules);
        found = true;
        break;
      }
    }
    if (!found) rows.push(["hidden_modules", JSON.stringify(body.hiddenModules)]);

    await clearAndWrite(SHEET, rows.length > 0 ? rows : [HEADERS]);
    return Response.json({ saved: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}
