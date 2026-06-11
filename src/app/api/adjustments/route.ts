/**
 * POST /api/adjustments — Module 3: Adjustments & Corrections.
 *
 * Accepts FormData with bankFile (PDF) + ledgerFile (XLS/XLSX/CSV).
 *
 * Strategy:
 *   1. Parse both files fully (date, ref, doc#, desc, debit, credit).
 *   2. Run Module 2's amount-only frequency match (for reference counts).
 *   3. Do a FULL date-aware matching across ALL entries:
 *      - Group by amount+direction
 *      - Pair by date: exact → ±3 days → ±7 days
 *      - Unpaired = truly missing
 *   This avoids Module 2's arbitrary pick when 30,000 appears 5× vs 4×.
 */

export const maxDuration = 60;
export const runtime = "nodejs";

import * as XLSX from "xlsx";

type BankEntry = {
  date: string;       // DD-MM-YYYY
  particulars: string;
  debit: number;
  credit: number;
};

type LedgerEntry = {
  date: string;       // DD-MM-YYYY
  ref: string;
  doc: string;
  desc: string;
  debit: number;
  credit: number;
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

function parseDate(ddmmyyyy: string): number | null {
  const m = ddmmyyyy.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!m) return null;
  return new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1])).getTime();
}

/* ── Parse bank statement PDF text ── */
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
    const date = normBankDate(m[1].trim());
    const particulars = m[2].trim();
    const raw = m[4];
    const nums: { val: number; pos: number }[] = [];
    const rx = /([\d,]+\.\d{2})/g;
    let nm;
    while ((nm = rx.exec(raw)) !== null)
      nums.push({ val: parseFloat(nm[1].replace(/,/g, "")), pos: nm.index });
    let debit = 0, credit = 0;
    if (nums.length === 3) { debit = nums[0].val; credit = nums[1].val; }
    else if (nums.length === 2) { nums[0].pos > 18 ? (credit = nums[0].val) : (debit = nums[0].val); }
    if (debit === 0 && credit === 0) continue;
    rows.push({ date, particulars, debit, credit });
  }
  return rows;
}

/* ── Parse ledger XLS ── */
function parseLedgerExcel(buffer: Buffer): LedgerEntry[] {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const rows: LedgerEntry[] = [];
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
    for (const row of data) {
      if (!row || row.length < 8 || row[0] === "Date") continue;
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
        dateStr = `${pad(d.m)}-${pad(d.d)}-${d.y}`;
      } else if (typeof rawDate === "string") {
        dateStr = rawDate;
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
      debit, credit,
    });
  }
  return rows;
}

/* ── Module 2 amount-only frequency match (for reference counts) ── */
function amountOnlyCount(bankEntries: BankEntry[], ledgerEntries: LedgerEntry[]) {
  const key = (n: number) => n.toFixed(2);
  function buildFreq(amounts: number[]) {
    const map = new Map<string, number>();
    for (const a of amounts) { const k = key(a); map.set(k, (map.get(k) || 0) + 1); }
    return map;
  }
  const bankFreq = buildFreq(bankEntries.map((r) => r.debit || r.credit));
  const ledgerFreq = buildFreq(ledgerEntries.map((r) => r.debit || r.credit));

  let bankMissing = 0;
  const lfc = new Map(ledgerFreq);
  for (const r of bankEntries) {
    const k = key(r.debit || r.credit);
    const c = lfc.get(k) || 0;
    if (c > 0) lfc.set(k, c - 1); else bankMissing++;
  }
  let ledgerMissing = 0;
  const bfc = new Map(bankFreq);
  for (const r of ledgerEntries) {
    const k = key(r.debit || r.credit);
    const c = bfc.get(k) || 0;
    if (c > 0) bfc.set(k, c - 1); else ledgerMissing++;
  }
  return { bankMissing, ledgerMissing };
}

/* ── Date-aware selection of missing entries ──
   Same counts as Module 2, but picks the RIGHT entries.
   For each amount: if bank has B and ledger has L:
     - If B > L: pair B bank entries with L ledger entries by date, the B-L unpaired = truly missing
     - If L > B: pair L ledger entries with B bank entries by date, the L-B unpaired = truly missing
     - If B == L: all matched, none missing */
function dateAwareMatch(bankEntries: BankEntry[], ledgerEntries: LedgerEntry[]) {
  const amtKey = (n: number) => n.toFixed(2);

  type BankItem = { idx: number; entry: BankEntry };
  type LedgerItem = { idx: number; entry: LedgerEntry };

  const bankGroups = new Map<string, BankItem[]>();
  bankEntries.forEach((e, idx) => {
    const k = amtKey(e.debit || e.credit);
    (bankGroups.get(k) ?? bankGroups.set(k, []).get(k)!).push({ idx, entry: e });
  });

  const ledgerGroups = new Map<string, LedgerItem[]>();
  ledgerEntries.forEach((e, idx) => {
    const k = amtKey(e.debit || e.credit);
    (ledgerGroups.get(k) ?? ledgerGroups.set(k, []).get(k)!).push({ idx, entry: e });
  });

  const bankMissing: BankEntry[] = [];
  const ledgerMissing: LedgerEntry[] = [];

  // All amounts that appear in either file
  const allKeys = new Set([...bankGroups.keys(), ...ledgerGroups.keys()]);

  for (const k of allKeys) {
    const bList = bankGroups.get(k) ?? [];
    const lList = ledgerGroups.get(k) ?? [];

    if (bList.length === lList.length) continue; // perfectly balanced

    if (bList.length > lList.length) {
      // More bank entries than ledger — need to find which bank entries have no ledger counterpart
      const excess = bList.length - lList.length;
      if (lList.length === 0) {
        // All bank entries are missing
        for (const b of bList) bankMissing.push(b.entry);
        continue;
      }
      // Pair by date to protect the ones that have date matches
      const paired = pairByDate(
        bList.map((b) => ({ idx: b.idx, date: b.entry.date })),
        lList.map((l) => ({ idx: l.idx, date: l.entry.date })),
      );
      const pairedBankIdxs = new Set(paired.map((p) => p.bankIdx));
      // Unpaired bank entries are the missing ones
      const unpaired = bList.filter((b) => !pairedBankIdxs.has(b.idx));
      for (const u of unpaired) bankMissing.push(u.entry);
    } else {
      // More ledger entries than bank
      const excess = lList.length - bList.length;
      if (bList.length === 0) {
        for (const l of lList) ledgerMissing.push(l.entry);
        continue;
      }
      const paired = pairByDate(
        bList.map((b) => ({ idx: b.idx, date: b.entry.date })),
        lList.map((l) => ({ idx: l.idx, date: l.entry.date })),
      );
      const pairedLedgerIdxs = new Set(paired.map((p) => p.ledgerIdx));
      const unpaired = lList.filter((l) => !pairedLedgerIdxs.has(l.idx));
      for (const u of unpaired) ledgerMissing.push(u.entry);
    }
  }

  return { bankUnresolved: bankMissing, ledgerUnresolved: ledgerMissing };
}

/* Pair bank indices with ledger indices by date proximity.
   Returns up to min(bank.length, ledger.length) pairs.
   Greedy: exact date first, then ±3, then ±7, then any remaining by closest. */
function pairByDate(
  bankItems: { idx: number; date: string }[],
  ledgerItems: { idx: number; date: string }[],
): { bankIdx: number; ledgerIdx: number }[] {
  const pairs: { bankIdx: number; ledgerIdx: number }[] = [];
  const limit = Math.min(bankItems.length, ledgerItems.length);
  const usedBank = new Set<number>();
  const usedLedger = new Set<number>();

  function pass(maxDays: number | null) {
    for (const bk of bankItems) {
      if (usedBank.has(bk.idx) || pairs.length >= limit) continue;
      const bkMs = parseDate(bk.date);

      let bestIdx = -1, bestDelta = Infinity;
      for (const lg of ledgerItems) {
        if (usedLedger.has(lg.idx)) continue;
        if (maxDays === null) {
          // Any remaining — pair by closest date
          const lgMs = parseDate(lg.date);
          if (bkMs && lgMs) {
            const d = Math.abs(bkMs - lgMs);
            if (d < bestDelta) { bestDelta = d; bestIdx = lg.idx; }
          } else {
            bestIdx = lg.idx; break; // can't compare dates, just pair
          }
        } else if (maxDays === 0) {
          if (bk.date === lg.date) { bestIdx = lg.idx; break; }
        } else {
          const lgMs = parseDate(lg.date);
          if (bkMs && lgMs) {
            const d = Math.abs(bkMs - lgMs);
            if (d <= maxDays * 86400000 && d < bestDelta) { bestDelta = d; bestIdx = lg.idx; }
          }
        }
      }
      if (bestIdx >= 0) {
        pairs.push({ bankIdx: bk.idx, ledgerIdx: bestIdx });
        usedBank.add(bk.idx);
        usedLedger.add(bestIdx);
      }
    }
  }

  pass(0);   // exact date
  pass(3);   // ±3 days
  pass(7);   // ±7 days
  pass(null); // any remaining — pair by closest

  return pairs;
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

    const ledgerBuffer = Buffer.from(await ledgerFile.arrayBuffer());
    const ext = ledgerFile.name.toLowerCase().split(".").pop() ?? "";
    let ledgerEntries: LedgerEntry[];
    if (ext === "csv") ledgerEntries = parseLedgerCSV(ledgerBuffer.toString("utf-8"));
    else if (ext === "xls" || ext === "xlsx") ledgerEntries = parseLedgerExcel(ledgerBuffer);
    else return Response.json({ error: "Ledger must be .xls, .xlsx, or .csv" }, { status: 400 });

    if (ledgerEntries.length === 0) {
      return Response.json({ error: "No entries found in ledger." }, { status: 400 });
    }

    // Module 2 reference counts
    const m2 = amountOnlyCount(bankEntries, ledgerEntries);

    // Full date-aware matching
    const { bankUnresolved, ledgerUnresolved } = dateAwareMatch(bankEntries, ledgerEntries);

    const resolvedFromBank = m2.bankMissing - bankUnresolved.length;
    const resolvedFromLedger = m2.ledgerMissing - ledgerUnresolved.length;

    return Response.json({
      bankTotal: bankEntries.length,
      ledgerTotal: ledgerEntries.length,
      module2BankMissing: m2.bankMissing,
      module2LedgerMissing: m2.ledgerMissing,
      resolvedCount: resolvedFromBank + resolvedFromLedger,
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
        resolvedFromBank,
        resolvedFromLedger,
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
