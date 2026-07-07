import { ensureSheet, readSheet, clearAndWrite, updateRow, writeRows, deleteRow } from "@/lib/google-sheets";

const BANKS_SHEET = "FE_Banks";
const LEDGER_SHEET = "FE_Ledger";

const BANK_HEADERS = [
  "id", "bankName", "branch", "acTitle", "accountNo", "iban",
  "accountType", "branchCode", "notes", "internetBanking", "stamp",
  "signatureAuthority", "mandateHolder", "maintainBalance", "openingBalance", "openingDate",
];

const LEDGER_HEADERS = [
  "accountId", "id", "date", "pdcDate", "ibftNo", "chequeNo",
  "description", "debit", "credit", "aa1Tick", "aa1At", "aa2Tick", "aa2At",
];

async function init() {
  await ensureSheet(BANKS_SHEET, BANK_HEADERS);
  await ensureSheet(LEDGER_SHEET, LEDGER_HEADERS);
}

function serializeBank(b: Record<string, unknown>): string[] {
  return BANK_HEADERS.map((h) => String(b[h] ?? ""));
}

function serializeEntry(accountId: string, e: Record<string, unknown>): string[] {
  return [accountId, ...LEDGER_HEADERS.slice(1).map((h) => String(e[h] ?? ""))];
}

export async function GET() {
  try {
    await init();

    const bankRows = await readSheet(BANKS_SHEET);
    const ledgerRows = await readSheet(LEDGER_SHEET);

    const banks = bankRows.slice(1).map((row) => {
      const obj: Record<string, string | number> = {};
      BANK_HEADERS.forEach((h, i) => {
        obj[h] = row[i] ?? "";
      });
      obj.openingBalance = parseFloat(String(obj.openingBalance)) || 0;
      return obj;
    });

    const ledger: Record<string, Record<string, unknown>[]> = {};
    for (const row of ledgerRows.slice(1)) {
      const accountId = row[0] ?? "";
      if (!accountId) continue;
      if (!ledger[accountId]) ledger[accountId] = [];
      const entry: Record<string, unknown> = {};
      LEDGER_HEADERS.slice(1).forEach((h, i) => {
        entry[h] = row[i + 1] ?? "";
      });
      entry.debit = entry.debit === "" ? null : parseFloat(String(entry.debit)) || 0;
      entry.credit = entry.credit === "" ? null : parseFloat(String(entry.credit)) || 0;
      entry.aa1Tick = entry.aa1Tick === "true";
      entry.aa2Tick = entry.aa2Tick === "true";
      ledger[accountId].push(entry);
    }

    return Response.json({ banks, ledger });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await init();
    const body = await request.json() as {
      action?: string;
      bank?: Record<string, unknown>;
      id?: string;
      accountId?: string;
      entry?: Record<string, unknown>;
      rowId?: string;
      banks?: Record<string, string | number>[];
      ledger?: Record<string, Record<string, unknown>[]>;
    };

    // ── Per-row bank upsert: touches only this bank's row. ──
    if (body.action === "upsert-bank" && body.bank) {
      const rows = await readSheet(BANKS_SHEET);
      const idx = rows.findIndex((r, i) => i > 0 && r[0] === body.bank!.id);
      const row = serializeBank(body.bank);
      if (idx > 0) await updateRow(BANKS_SHEET, idx + 1, row);
      else await writeRows(BANKS_SHEET, [row]);
      return Response.json({ saved: true });
    }

    // ── Per-row bank delete. (The client removes the account's ledger rows too,
    //    which arrive as their own delete-entry calls — no cascade needed here.) ──
    if (body.action === "delete-bank" && body.id) {
      const rows = await readSheet(BANKS_SHEET);
      const idx = rows.findIndex((r, i) => i > 0 && r[0] === body.id);
      if (idx > 0) await deleteRow(BANKS_SHEET, idx + 1);
      return Response.json({ deleted: true });
    }

    // ── Per-row ledger entry upsert: keyed by (accountId, entry id). ──
    if (body.action === "upsert-entry" && body.accountId && body.entry) {
      const rows = await readSheet(LEDGER_SHEET);
      const idx = rows.findIndex((r, i) => i > 0 && r[0] === body.accountId && r[1] === body.entry!.id);
      const row = serializeEntry(body.accountId, body.entry);
      if (idx > 0) await updateRow(LEDGER_SHEET, idx + 1, row);
      else await writeRows(LEDGER_SHEET, [row]);
      return Response.json({ saved: true });
    }

    // ── Per-row ledger entry delete. ──
    if (body.action === "delete-entry" && body.accountId && body.rowId) {
      const rows = await readSheet(LEDGER_SHEET);
      const idx = rows.findIndex((r, i) => i > 0 && r[0] === body.accountId && r[1] === body.rowId);
      if (idx > 0) await deleteRow(LEDGER_SHEET, idx + 1);
      return Response.json({ deleted: true });
    }

    // ── Legacy whole-state path (older cached tabs). MADE NON-DESTRUCTIVE:
    //    merge/upsert each bank + ledger row, NEVER clear a sheet — so a stale
    //    tab can no longer wipe the ledger. ──
    if (body.banks || body.ledger) {
      if (body.banks) {
        const rows = await readSheet(BANKS_SHEET);
        const idById = new Map<string, number>();
        rows.forEach((r, i) => { if (i > 0 && r[0]) idById.set(r[0], i + 1); });
        for (const bank of body.banks) {
          if (!bank.id) continue;
          const row = serializeBank(bank);
          const sheetRow = idById.get(String(bank.id));
          if (sheetRow) await updateRow(BANKS_SHEET, sheetRow, row);
          else await writeRows(BANKS_SHEET, [row]);
        }
      }
      if (body.ledger) {
        const rows = await readSheet(LEDGER_SHEET);
        const keyToRow = new Map<string, number>();
        rows.forEach((r, i) => { if (i > 0 && r[0]) keyToRow.set(`${r[0]}::${r[1]}`, i + 1); });
        for (const [accountId, entries] of Object.entries(body.ledger)) {
          for (const e of entries) {
            if (!e.id) continue;
            const row = serializeEntry(accountId, e);
            const sheetRow = keyToRow.get(`${accountId}::${e.id}`);
            if (sheetRow) await updateRow(LEDGER_SHEET, sheetRow, row);
            else await writeRows(LEDGER_SHEET, [row]);
          }
        }
      }
      return Response.json({ saved: true, merged: true });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await init();

    const body = await request.json() as {
      accountId: string;
      rowId: string;
      field: string;
      value: string | number | boolean | null;
    };

    const rows = await readSheet(LEDGER_SHEET);
    const fieldIdx = LEDGER_HEADERS.indexOf(body.field);
    if (fieldIdx === -1) {
      return Response.json({ error: `Unknown field: ${body.field}` }, { status: 400 });
    }

    let updatedRowIdx = -1;
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] === body.accountId && rows[i][1] === body.rowId) {
        rows[i][fieldIdx] = String(body.value ?? "");
        updatedRowIdx = i;
        break;
      }
    }

    if (updatedRowIdx === -1) {
      return Response.json({ error: "Row not found" }, { status: 404 });
    }

    // Write only the one changed row — no full-sheet rewrite.
    await updateRow(LEDGER_SHEET, updatedRowIdx + 1, rows[updatedRowIdx]);
    return Response.json({ updated: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}
