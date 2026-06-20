import { ensureSheet, readSheet, clearAndWrite } from "@/lib/google-sheets";

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
      banks: Record<string, string | number>[];
      ledger: Record<string, Record<string, unknown>[]>;
    };

    const bankData = [BANK_HEADERS];
    for (const bank of body.banks) {
      bankData.push(BANK_HEADERS.map((h) => String(bank[h] ?? "")));
    }
    await clearAndWrite(BANKS_SHEET, bankData);

    const ledgerData = [LEDGER_HEADERS];
    for (const [accountId, rows] of Object.entries(body.ledger)) {
      for (const row of rows) {
        ledgerData.push([
          accountId,
          ...LEDGER_HEADERS.slice(1).map((h) => String(row[h] ?? "")),
        ]);
      }
    }
    await clearAndWrite(LEDGER_SHEET, ledgerData);

    return Response.json({ saved: true });
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

    let updated = false;
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] === body.accountId && rows[i][1] === body.rowId) {
        rows[i][fieldIdx] = String(body.value ?? "");
        updated = true;
        break;
      }
    }

    if (!updated) {
      return Response.json({ error: "Row not found" }, { status: 404 });
    }

    await clearAndWrite(LEDGER_SHEET, rows);
    return Response.json({ updated: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}
