import { ensureSheet, readSheet, clearAndWrite, updateRow, writeRows, deleteRow } from "@/lib/google-sheets";

const LEDGER_SHEET = "PC_Ledger";
const CONFIG_SHEET = "PC_Config";

const LEDGER_HEADERS = ["id", "date", "acHead", "txnNo", "purpose", "approvedBy", "cashOut", "cashIn", "holder"];
const CONFIG_HEADERS = ["key", "value"];

type LedgerEntry = {
  id: string; date: string; acHead: string; txnNo: string;
  purpose: string; approvedBy: string;
  cashOut: number | null; cashIn: number | null;
  holder?: "main" | "aa1" | "aa2";
};

function serializeEntry(e: LedgerEntry): string[] {
  return [
    String(e.id ?? ""), String(e.date ?? ""), String(e.acHead ?? ""), String(e.txnNo ?? ""),
    String(e.purpose ?? ""), String(e.approvedBy ?? ""),
    e.cashOut === null || e.cashOut === undefined ? "" : String(e.cashOut),
    e.cashIn === null || e.cashIn === undefined ? "" : String(e.cashIn),
    e.holder ?? "main",
  ];
}

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

async function saveConfig(openingBalance: unknown, openingDate: unknown) {
  await clearAndWrite(CONFIG_SHEET, [
    CONFIG_HEADERS,
    ["openingBalance", String(openingBalance ?? 0)],
    ["openingDate", String(openingDate ?? "")],
  ]);
}

export async function POST(request: Request) {
  try {
    await init();
    const body = await request.json() as {
      action?: string;
      entry?: LedgerEntry;
      id?: string;
      entries?: LedgerEntry[];
      openingBalance?: number;
      openingDate?: string;
    };

    // ── Per-row upsert: touches ONLY this entry's row. No full-sheet rewrite,
    //    so concurrent edits from other tabs can never clobber each other. ──
    if (body.action === "upsert-entry" && body.entry) {
      const rows = await readSheet(LEDGER_SHEET);
      const idx = rows.findIndex((r, i) => i > 0 && r[0] === body.entry!.id);
      const row = serializeEntry(body.entry);
      if (idx > 0) await updateRow(LEDGER_SHEET, idx + 1, row);
      else await writeRows(LEDGER_SHEET, [row]);
      return Response.json({ saved: true });
    }

    // ── Per-row delete: removes ONLY this entry's row. ──
    if (body.action === "delete-entry" && body.id) {
      const rows = await readSheet(LEDGER_SHEET);
      const idx = rows.findIndex((r, i) => i > 0 && r[0] === body.id);
      if (idx > 0) await deleteRow(LEDGER_SHEET, idx + 1);
      return Response.json({ deleted: true });
    }

    // ── Config (opening balance/date): a fixed 2-cell sheet, safe to rewrite. ──
    if (body.action === "save-config") {
      await saveConfig(body.openingBalance, body.openingDate);
      return Response.json({ saved: true });
    }

    // ── Legacy whole-array path (older cached tabs). MADE NON-DESTRUCTIVE:
    //    merge/upsert each entry, NEVER clear the sheet — so a stale tab can
    //    no longer wipe the ledger. Deletions from such tabs simply won't
    //    propagate (acceptable trade for safety). ──
    if (body.entries) {
      const rows = await readSheet(LEDGER_SHEET);
      const idById = new Map<string, number>();
      rows.forEach((r, i) => { if (i > 0 && r[0]) idById.set(r[0], i + 1); });
      for (const e of body.entries) {
        if (!e.id) continue;
        const row = serializeEntry(e);
        const sheetRow = idById.get(e.id);
        if (sheetRow) await updateRow(LEDGER_SHEET, sheetRow, row);
        else await writeRows(LEDGER_SHEET, [row]);
      }
      if (body.openingBalance !== undefined) await saveConfig(body.openingBalance, body.openingDate);
      return Response.json({ saved: true, merged: true });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}
