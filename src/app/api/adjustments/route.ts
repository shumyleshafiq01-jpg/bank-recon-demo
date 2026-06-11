/**
 * POST /api/adjustments — Module 3: Adjustments & Corrections.
 *
 * Accepts FormData with bankFile (PDF) + ledgerFile (XLS/XLSX/CSV).
 * Internally runs Module 2's amount-only frequency match to get missing lists,
 * then cross-matches those missing entries by DATE + amount to resolve them.
 *
 * Output:
 *   resolved[]     — entries missing in Module 2 but matched by date (timing diffs)
 *   bankUnresolved[]  — bank entries truly not in ledger (need correction JEs)
 *   ledgerUnresolved[] — ledger entries truly not in bank (outstanding cheques/pending)
 */

export const maxDuration = 60;
export const runtime = "nodejs";

import * as XLSX from "xlsx";

type BankEntry = {
  date: string;       // normalized DD-MM-YYYY
  dateRaw: string;    // original from PDF e.g. "01 OCT 25"
  particulars: string;
  debit: number;
  credit: number;
};

type LedgerEntry = {
  date: string;       // normalized DD-MM-YYYY
  ref: string;
  doc: string;
  desc: string;
  debit: number;
  credit: number;
};

type ResolvedPair = {
  bankDate: string;
  ledgerDate: string;
  amount: number;
  direction: string;  // "DR" or "CR" from bank perspective
  bankParticulars: string;
  ledgerRef: string;
  ledgerDoc: string;
  ledgerDesc: string;
};

const MONTHS: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
};
const pad = (n: number) => String(n).padStart(2, "0");

function normBankDate(raw: string): string {
  const m = raw.match(/^(\d{2})\s+(\w{3})\s+(\d{2})$/);
  if (!m) return raw;
  const mon = MONTHS[m[2].toUpperCase()];
  if (!mon) return raw;
  return `${m[1]}-${pad(mon)}-${2000 + parseInt(m[3])}`;
}

/* ── Parse bank statement text (same logic as Module 2, untouched) ── */
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
  for (const line of text.split("\n")) {
    if (skip.some((p) => p.test(line.trim()))) continue;
    const m = line.match(
      /^(\d{2}\s+\w{3}\s+\d{2})\s+(.+?)\s{2,}(\d{2}\s+\w{3}\s+\d{2})(.*)/
    );
    if (!m) continue;
    const dateRaw = m[1].trim();
    const date = normBankDate(dateRaw);
    const particulars = m[2].trim();
    const raw = m[4];
    const nums: { val: number; pos: number }[] = [];
    const rx = /([\d,]+\.\d{2})/g;
    let nm;
    while ((nm = rx.exec(raw)) !== null)
      nums.push({ val: parseFloat(nm[1].replace(/,/g, "")), pos: nm.index });
    let debit = 0,
      credit = 0;
    if (nums.length === 3) { debit = nums[0].val; credit = nums[1].val; }
    else if (nums.length === 2) { nums[0].pos > 18 ? (credit = nums[0].val) : (debit = nums[0].val); }
    if (debit === 0 && credit === 0) continue;
    rows.push({ date, dateRaw, particulars, debit, credit });
  }
  return rows;
}

/* ── Parse ledger from XLS/XLSX ── */
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
      if (row[0] === "Date") continue;

      const rawDate = row[0];
      const ref = String(row[1] ?? "");
      const desc = String(row[2] ?? "");
      const doc = String(row[3] ?? "");
      const debit = typeof row[5] === "number" ? row[5] : 0;
      const credit = typeof row[6] === "number" ? row[6] : 0;
      if (debit === 0 && credit === 0) continue;

      let dateStr = "";
      if (typeof rawDate === "number") {
        const d = XLSX.SSF.parse_date_code(rawDate);
        // ERP swap bug: serial month = real day, serial day = real month
        dateStr = `${pad(d.m)}-${pad(d.d)}-${d.y}`;
      } else if (typeof rawDate === "string") {
        dateStr = rawDate; // already DD-MM-YYYY
      }

      rows.push({ date: dateStr, ref, doc, desc, debit, credit });
    }
  }
  return rows;
}

function parseLedgerCSV(text: string): LedgerEntry[] {
  const rows: LedgerEntry[] = [];
  const lines = text.split("\n");
  let headerIdx = -1;
  let debitCol = -1, creditCol = -1, dateCol = -1, refCol = -1, descCol = -1, docCol = -1;

  for (let i = 0; i < lines.length; i++) {
    const cells = lines[i].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    if (headerIdx === -1) {
      const lower = cells.map((c) => c.toLowerCase());
      dateCol = lower.findIndex((c) => c.includes("date"));
      refCol = lower.findIndex((c) => c.includes("ref"));
      descCol = lower.findIndex((c) => c.includes("desc") || c.includes("account"));
      docCol = lower.findIndex((c) => c.includes("doc") || c.includes("document"));
      debitCol = lower.findIndex((c) => c === "debit" || c.includes("debit"));
      creditCol = lower.findIndex((c) => c === "credit" || c.includes("credit"));
      if (debitCol >= 0 || creditCol >= 0) { headerIdx = i; continue; }
      continue;
    }
    const debit = debitCol >= 0 ? parseFloat(String(cells[debitCol]).replace(/,/g, "")) || 0 : 0;
    const credit = creditCol >= 0 ? parseFloat(String(cells[creditCol]).replace(/,/g, "")) || 0 : 0;
    if (debit === 0 && credit === 0) continue;
    rows.push({
      date: dateCol >= 0 ? cells[dateCol] || "" : "",
      ref: refCol >= 0 ? cells[refCol] || "" : "",
      doc: docCol >= 0 ? cells[docCol] || "" : "",
      desc: descCol >= 0 ? cells[descCol] || "" : "",
      debit,
      credit,
    });
  }
  return rows;
}

/* ── Step 1: Amount-only frequency match (identical to Module 2) ── */
function amountOnlyMatch(bankEntries: BankEntry[], ledgerEntries: LedgerEntry[]) {
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

  const ledgerFreqCopy = new Map(ledgerFreq);
  const bankMissing: BankEntry[] = [];
  for (const r of bankEntries) {
    const k = key(r.debit || r.credit);
    const count = ledgerFreqCopy.get(k) || 0;
    if (count > 0) ledgerFreqCopy.set(k, count - 1);
    else bankMissing.push(r);
  }

  const bankFreqCopy = new Map(bankFreq);
  const ledgerMissing: LedgerEntry[] = [];
  for (const r of ledgerEntries) {
    const k = key(r.debit || r.credit);
    const count = bankFreqCopy.get(k) || 0;
    if (count > 0) bankFreqCopy.set(k, count - 1);
    else ledgerMissing.push(r);
  }

  return { bankMissing, ledgerMissing };
}

/* ── Step 2: Cross-match missing entries by date + amount ── */
function resolveByDate(bankMissing: BankEntry[], ledgerMissing: LedgerEntry[]) {
  const resolved: ResolvedPair[] = [];
  const bankUnresolved: BankEntry[] = [];
  const ledgerUsed = new Set<number>();

  // Bank DR ↔ Ledger CR (money out), Bank CR ↔ Ledger DR (money in)
  for (const bk of bankMissing) {
    const amt = bk.debit || bk.credit;
    const bankDir = bk.debit ? "OUT" : "IN";
    let matched = false;

    // Exact date match first
    for (let j = 0; j < ledgerMissing.length; j++) {
      if (ledgerUsed.has(j)) continue;
      const lg = ledgerMissing[j];
      const ledAmt = lg.debit || lg.credit;
      const ledDir = lg.credit ? "OUT" : "IN";
      if (Math.abs(amt - ledAmt) < 0.01 && bankDir === ledDir && bk.date === lg.date) {
        resolved.push({
          bankDate: bk.date,
          ledgerDate: lg.date,
          amount: amt,
          direction: bk.debit ? "DR" : "CR",
          bankParticulars: bk.particulars,
          ledgerRef: lg.ref,
          ledgerDoc: lg.doc,
          ledgerDesc: lg.desc,
        });
        ledgerUsed.add(j);
        matched = true;
        break;
      }
    }

    // ±3 day fuzzy match if exact didn't work
    if (!matched) {
      const bkDate = parseDate(bk.date);
      for (let j = 0; j < ledgerMissing.length; j++) {
        if (ledgerUsed.has(j)) continue;
        const lg = ledgerMissing[j];
        const ledAmt = lg.debit || lg.credit;
        const ledDir = lg.credit ? "OUT" : "IN";
        if (Math.abs(amt - ledAmt) < 0.01 && bankDir === ledDir) {
          const lgDate = parseDate(lg.date);
          if (bkDate && lgDate && Math.abs(bkDate - lgDate) <= 3 * 86400000) {
            resolved.push({
              bankDate: bk.date,
              ledgerDate: lg.date,
              amount: amt,
              direction: bk.debit ? "DR" : "CR",
              bankParticulars: bk.particulars,
              ledgerRef: lg.ref,
              ledgerDoc: lg.doc,
              ledgerDesc: lg.desc,
            });
            ledgerUsed.add(j);
            matched = true;
            break;
          }
        }
      }
    }

    if (!matched) bankUnresolved.push(bk);
  }

  const ledgerUnresolved = ledgerMissing.filter((_, i) => !ledgerUsed.has(i));
  return { resolved, bankUnresolved, ledgerUnresolved };
}

function parseDate(ddmmyyyy: string): number | null {
  const m = ddmmyyyy.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!m) return null;
  return new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1])).getTime();
}

const fmt = (n: number) =>
  n === 0 ? "" : n.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const bankFile = formData.get("bankFile") as File | null;
    const ledgerFile = formData.get("ledgerFile") as File | null;

    if (!bankFile || !ledgerFile) {
      return Response.json({ error: "Both files are required." }, { status: 400 });
    }

    // Parse bank PDF
    const bankBuffer = Buffer.from(await bankFile.arrayBuffer());
    let bankText: string;
    try {
      const pdfParse = (await import("pdf-parse")).default;
      bankText = (await pdfParse(bankBuffer)).text ?? "";
    } catch {
      return Response.json({ error: "Failed to parse bank statement PDF." }, { status: 400 });
    }

    const bankEntries = parseBankText(bankText);
    if (bankEntries.length === 0) {
      return Response.json({ error: "No transactions found in bank statement." }, { status: 400 });
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
      return Response.json({ error: "Ledger must be .xls, .xlsx, or .csv" }, { status: 400 });
    }

    if (ledgerEntries.length === 0) {
      return Response.json({ error: "No entries found in ledger." }, { status: 400 });
    }

    // Step 1: Amount-only frequency match (same as Module 2)
    const { bankMissing, ledgerMissing } = amountOnlyMatch(bankEntries, ledgerEntries);

    // Step 2: Resolve by date + amount cross-match
    const { resolved, bankUnresolved, ledgerUnresolved } = resolveByDate(bankMissing, ledgerMissing);

    return Response.json({
      bankTotal: bankEntries.length,
      ledgerTotal: ledgerEntries.length,
      module2BankMissing: bankMissing.length,
      module2LedgerMissing: ledgerMissing.length,
      resolved: resolved.map((r) => ({
        bankDate: r.bankDate,
        ledgerDate: r.ledgerDate,
        amount: r.amount,
        direction: r.direction,
        bankParticulars: r.bankParticulars,
        ledgerRef: r.ledgerRef,
        ledgerDoc: r.ledgerDoc,
        ledgerDesc: r.ledgerDesc.substring(0, 60),
      })),
      bankUnresolved: bankUnresolved.map((r) => ({
        date: r.date,
        particulars: r.particulars,
        debit: r.debit,
        credit: r.credit,
      })),
      ledgerUnresolved: ledgerUnresolved.map((r) => ({
        date: r.date,
        ref: r.ref,
        doc: r.doc,
        desc: r.desc.substring(0, 60),
        debit: r.debit,
        credit: r.credit,
      })),
      summary: {
        resolvedCount: resolved.length,
        resolvedTotal: fmt(resolved.reduce((s, r) => s + r.amount, 0)),
        bankUnresolvedCount: bankUnresolved.length,
        bankUnresolvedDR: fmt(bankUnresolved.reduce((s, r) => s + r.debit, 0)),
        bankUnresolvedCR: fmt(bankUnresolved.reduce((s, r) => s + r.credit, 0)),
        ledgerUnresolvedCount: ledgerUnresolved.length,
        ledgerUnresolvedDR: fmt(ledgerUnresolved.reduce((s, r) => s + r.debit, 0)),
        ledgerUnresolvedCR: fmt(ledgerUnresolved.reduce((s, r) => s + r.credit, 0)),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: `Server error: ${msg}` }, { status: 500 });
  }
}
