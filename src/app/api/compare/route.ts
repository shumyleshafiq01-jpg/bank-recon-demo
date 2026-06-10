/**
 * POST /api/compare — Debit/Credit comparison endpoint.
 *
 * Accepts FormData with:
 *   - bankFile: PDF file (bank statement)
 *   - ledgerFile: XLS/XLSX/CSV file (journal ledger)
 *
 * Parses both, extracts debit/credit amounts, and cross-matches.
 */

export const maxDuration = 60;
export const runtime = "nodejs";

import * as XLSX from "xlsx";

type BankEntry = {
  date: string;
  particulars: string;
  debit: number;
  credit: number;
};

type LedgerEntry = {
  date: string;
  ref: string;
  desc: string;
  debit: number;
  credit: number;
};

/* ── Parse bank statement text (fixed-width columns from PDF) ── */
function parseBankText(text: string): BankEntry[] {
  const rows: BankEntry[] = [];
  const skip = [
    /^-{4,}/, /^KAFI/, /^DATE\s/, /^Page \d/, /^\*REVE/,
    /^This is a computer/, /^KARACHI/, /^SINDH/, /^032/,
    /BALANCE AT PERIOD/, /Account Number/, /Account Status/,
    /Pakistan Rupees/, /Statement Period/, /Branch Name/,
    /KAFI HOUSE/, /TOTAL DEBIT/, /CLOSING BAL/, /TOTAL WITH/,
    /^\s*$/,
  ];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (skip.some((p) => p.test(line.trim()))) continue;
    const m = line.match(
      /^(\d{2}\s+\w{3}\s+\d{2})\s+(.+?)\s{2,}(\d{2}\s+\w{3}\s+\d{2})(.*)/
    );
    if (!m) continue;
    const date = m[1].trim();
    const particulars = m[2].trim();
    const raw = m[4];
    const nums: { val: number; pos: number }[] = [];
    const rx = /([\d,]+\.\d{2})/g;
    let nm;
    while ((nm = rx.exec(raw)) !== null)
      nums.push({ val: parseFloat(nm[1].replace(/,/g, "")), pos: nm.index });
    let debit = 0,
      credit = 0;
    if (nums.length === 3) {
      debit = nums[0].val;
      credit = nums[1].val;
    } else if (nums.length === 2) {
      nums[0].pos > 18 ? (credit = nums[0].val) : (debit = nums[0].val);
    }
    if (debit === 0 && credit === 0) continue;
    rows.push({ date, particulars, debit, credit });
  }
  return rows;
}

/* ── Parse ledger from XLS/XLSX/CSV ── */
function parseLedgerExcel(buffer: Buffer): LedgerEntry[] {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const rows: LedgerEntry[] = [];

  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

    for (const row of data) {
      if (!row || row.length < 8) continue;
      if (row[0] === "Date") continue; // header

      const rawDate = row[0];
      const ref = String(row[1] ?? "");
      const desc = String(row[2] ?? "");
      const debit = typeof row[5] === "number" ? row[5] : 0;
      const credit = typeof row[6] === "number" ? row[6] : 0;
      if (debit === 0 && credit === 0) continue;

      let dateStr = "";
      if (typeof rawDate === "number") {
        // ERP DD-MM vs MM-DD bug: swap month and day for serial dates
        const d = XLSX.SSF.parse_date_code(rawDate);
        dateStr = `${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}-${d.y}`;
      } else if (typeof rawDate === "string") {
        dateStr = rawDate;
      }

      rows.push({ date: dateStr, ref, desc, debit, credit });
    }
  }
  return rows;
}

function parseLedgerCSV(text: string): LedgerEntry[] {
  const rows: LedgerEntry[] = [];
  const lines = text.split("\n");
  let headerIdx = -1;
  let debitCol = -1;
  let creditCol = -1;
  let dateCol = -1;
  let refCol = -1;
  let descCol = -1;

  for (let i = 0; i < lines.length; i++) {
    const cells = lines[i].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    if (headerIdx === -1) {
      const lower = cells.map((c) => c.toLowerCase());
      dateCol = lower.findIndex((c) => c.includes("date"));
      refCol = lower.findIndex((c) => c.includes("ref"));
      descCol = lower.findIndex((c) => c.includes("desc") || c.includes("account"));
      debitCol = lower.findIndex((c) => c === "debit" || c.includes("debit"));
      creditCol = lower.findIndex((c) => c === "credit" || c.includes("credit"));
      if (debitCol >= 0 || creditCol >= 0) {
        headerIdx = i;
        continue;
      }
      continue;
    }
    const debit = debitCol >= 0 ? parseFloat(String(cells[debitCol]).replace(/,/g, "")) || 0 : 0;
    const credit = creditCol >= 0 ? parseFloat(String(cells[creditCol]).replace(/,/g, "")) || 0 : 0;
    if (debit === 0 && credit === 0) continue;
    rows.push({
      date: dateCol >= 0 ? cells[dateCol] || "" : "",
      ref: refCol >= 0 ? cells[refCol] || "" : "",
      desc: descCol >= 0 ? cells[descCol] || "" : "",
      debit,
      credit,
    });
  }
  return rows;
}

/* ── Frequency-based comparison ── */
function compare(bankEntries: BankEntry[], ledgerEntries: LedgerEntry[]) {
  const key = (n: number) => n.toFixed(2);

  function buildFreq(amounts: number[]) {
    const map = new Map<string, number>();
    for (const a of amounts) {
      const k = key(a);
      map.set(k, (map.get(k) || 0) + 1);
    }
    return map;
  }

  const bankAmounts = bankEntries.map((r) => r.debit || r.credit);
  const ledgerAmounts = ledgerEntries.map((r) => r.debit || r.credit);

  const bankFreq = buildFreq(bankAmounts);
  const ledgerFreq = buildFreq(ledgerAmounts);

  // Bank amounts not matched in ledger
  const ledgerFreqCopy = new Map(ledgerFreq);
  const bankMissing: BankEntry[] = [];
  for (const r of bankEntries) {
    const amt = r.debit || r.credit;
    const k = key(amt);
    const count = ledgerFreqCopy.get(k) || 0;
    if (count > 0) {
      ledgerFreqCopy.set(k, count - 1);
    } else {
      bankMissing.push(r);
    }
  }

  // Ledger amounts not matched in bank
  const bankFreqCopy = new Map(bankFreq);
  const ledgerMissing: LedgerEntry[] = [];
  for (const r of ledgerEntries) {
    const amt = r.debit || r.credit;
    const k = key(amt);
    const count = bankFreqCopy.get(k) || 0;
    if (count > 0) {
      bankFreqCopy.set(k, count - 1);
    } else {
      ledgerMissing.push(r);
    }
  }

  return { bankMissing, ledgerMissing };
}

const fmt = (n: number) =>
  n === 0 ? "" : n.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const bankFile = formData.get("bankFile") as File | null;
    const ledgerFile = formData.get("ledgerFile") as File | null;

    if (!bankFile || !ledgerFile) {
      return Response.json({ error: "Both bank statement and ledger file are required." }, { status: 400 });
    }

    // Parse bank PDF
    const bankBuffer = Buffer.from(await bankFile.arrayBuffer());
    let bankText: string;
    try {
      const pdfParse = (await import("pdf-parse")).default;
      const data = await pdfParse(bankBuffer);
      bankText = data.text ?? "";
    } catch {
      return Response.json({ error: "Failed to parse bank statement PDF. Make sure it's a valid PDF file." }, { status: 400 });
    }

    const bankEntries = parseBankText(bankText);
    if (bankEntries.length === 0) {
      return Response.json({ error: "Could not extract any transactions from the bank statement PDF." }, { status: 400 });
    }

    // Parse ledger
    const ledgerBuffer = Buffer.from(await ledgerFile.arrayBuffer());
    const ext = ledgerFile.name.toLowerCase().split(".").pop() ?? "";
    let ledgerEntries: LedgerEntry[];

    if (ext === "csv") {
      ledgerEntries = parseLedgerCSV(ledgerBuffer.toString("utf-8"));
    } else if (ext === "xls" || ext === "xlsx") {
      ledgerEntries = parseLedgerExcel(ledgerBuffer);
    } else {
      return Response.json({ error: "Ledger file must be .xls, .xlsx, or .csv" }, { status: 400 });
    }

    if (ledgerEntries.length === 0) {
      return Response.json({ error: "Could not extract any entries from the ledger file. Check that it has Date, Debit, Credit columns." }, { status: 400 });
    }

    // Compare
    const { bankMissing, ledgerMissing } = compare(bankEntries, ledgerEntries);

    const bankDR = bankMissing.reduce((s, r) => s + r.debit, 0);
    const bankCR = bankMissing.reduce((s, r) => s + r.credit, 0);
    const ledDR = ledgerMissing.reduce((s, r) => s + r.debit, 0);
    const ledCR = ledgerMissing.reduce((s, r) => s + r.credit, 0);

    return Response.json({
      bankTotal: bankEntries.length,
      ledgerTotal: ledgerEntries.length,
      bankMissing: bankMissing.map((r) => ({
        date: r.date,
        particulars: r.particulars,
        debit: r.debit,
        credit: r.credit,
      })),
      ledgerMissing: ledgerMissing.map((r) => ({
        date: r.date,
        ref: r.ref,
        desc: r.desc.substring(0, 60),
        debit: r.debit,
        credit: r.credit,
      })),
      summary: {
        bankMissingCount: bankMissing.length,
        bankMissingDR: fmt(bankDR),
        bankMissingCR: fmt(bankCR),
        ledgerMissingCount: ledgerMissing.length,
        ledgerMissingDR: fmt(ledDR),
        ledgerMissingCR: fmt(ledCR),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: `Server error: ${msg}` }, { status: 500 });
  }
}
