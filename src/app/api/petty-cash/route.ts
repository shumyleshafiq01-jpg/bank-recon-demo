import { ensureSheet, readSheet, clearAndWrite } from "@/lib/google-sheets";

const LEDGER_SHEET = "PC_Ledger";
const CONFIG_SHEET = "PC_Config";

const LEDGER_HEADERS = ["id", "date", "acHead", "txnNo", "purpose", "approvedBy", "cashOut", "cashIn", "holder"];
const CONFIG_HEADERS = ["key", "value"];

async function init() {
  await ensureSheet(LEDGER_SHEET, LEDGER_HEADERS);
  await ensureSheet(CONFIG_SHEET, CONFIG_HEADERS);
}

export async function GET() {
  try {
    await init();

    const ledgerRows = await readSheet(LEDGER_SHEET);
    const configRows = await readSheet(CONFIG_SHEET);

    const entries = ledgerRows.slice(1)
      .filter((r) => r[0])
      .map((r) => ({
        id: r[0] ?? "",
        date: r[1] ?? "",
        acHead: r[2] ?? "",
        txnNo: r[3] ?? "",
        purpose: r[4] ?? "",
        approvedBy: r[5] ?? "",
        cashOut: r[6] === "" || r[6] === undefined ? null : parseFloat(r[6]) || 0,
        cashIn: r[7] === "" || r[7] === undefined ? null : parseFloat(r[7]) || 0,
        holder: (r[8] || "main") as "main" | "aa1" | "aa2",
      }));

    const config: Record<string, string> = {};
    for (const row of configRows.slice(1)) {
      if (row[0]) config[row[0]] = row[1] ?? "";
    }

    return Response.json({
      entries,
      openingBalance: parseFloat(config.openingBalance || "0") || 0,
      openingDate: config.openingDate || "",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await init();

    const body = await request.json() as {
      entries: Array<{
        id: string; date: string; acHead: string; txnNo: string;
        purpose: string; approvedBy: string;
        cashOut: number | null; cashIn: number | null;
        holder?: "main" | "aa1" | "aa2";
      }>;
      openingBalance: number;
      openingDate: string;
    };

    const ledgerData = [
      LEDGER_HEADERS,
      ...body.entries.map((e) => [
        e.id, e.date, e.acHead, e.txnNo, e.purpose, e.approvedBy,
        e.cashOut === null ? "" : String(e.cashOut),
        e.cashIn === null ? "" : String(e.cashIn),
        e.holder ?? "main",
      ]),
    ];
    await clearAndWrite(LEDGER_SHEET, ledgerData);

    const configData = [
      CONFIG_HEADERS,
      ["openingBalance", String(body.openingBalance)],
      ["openingDate", body.openingDate],
    ];
    await clearAndWrite(CONFIG_SHEET, configData);

    return Response.json({ saved: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}
