export const maxDuration = 60;
export const runtime = "nodejs";

import * as XLSX from "xlsx";

type LedgerEntry = {
  date: string;
  ref: string;
  doc: string;
  desc: string;
  debit: number;
  credit: number;
};

const pad = (n: number) => String(n).padStart(2, "0");

function parseLedgerExcel(buffer: Buffer): LedgerEntry[] {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const rows: LedgerEntry[] = [];
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

    let colDate = 0, colRef = 1, colDesc = 2, colDoc = 3, colDebit = 5, colCredit = 6;
    for (const row of data) {
      if (!row) continue;
      const cells: string[] = Array.from({ length: row.length }, (_, i) => {
        const c = row[i];
        return c == null ? "" : String(c).trim().toUpperCase();
      });
      const dateIdx = cells.findIndex(c => c === "DATE");
      const debitIdx = cells.findIndex(c => c === "DEBIT");
      const creditIdx = cells.findIndex(c => c === "CREDIT");
      if (dateIdx >= 0 && debitIdx >= 0 && creditIdx >= 0) {
        colDate = dateIdx;
        colDebit = debitIdx;
        colCredit = creditIdx;
        const partIdx = cells.findIndex(c => c === "PARTICULARS" || c === "DESCRIPTION" || c === "NARRATION");
        if (partIdx >= 0) colDesc = partIdx;
        const vchIdx = cells.findIndex(c => c.includes("VCH") && c.includes("NO"));
        if (vchIdx >= 0) colDoc = vchIdx;
        const refIdx = cells.findIndex(c => c === "REF" || c === "REFERENCE" || c === "VCH TYPE" || (c.includes("VCH") && c.includes("TYPE")));
        if (refIdx >= 0) colRef = refIdx;
        break;
      }
    }

    for (const row of data) {
      if (!row || row.length < Math.max(colDebit, colCredit) + 1) continue;
      const cell0 = String(row[colDate] ?? "").trim().toUpperCase();
      if (cell0 === "DATE" || cell0 === "") continue;
      const rawDate = row[colDate];
      const ref = String(row[colRef] ?? "");
      let desc = String(row[colDesc] ?? "");
      if ((desc === "To" || desc === "By") && row[colDesc + 1]) {
        desc = desc + " " + String(row[colDesc + 1]);
      }
      const doc = String(row[colDoc] ?? "");
      const debit = typeof row[colDebit] === "number" ? row[colDebit] : 0;
      const credit = typeof row[colCredit] === "number" ? row[colCredit] : 0;
      if (debit === 0 && credit === 0) continue;
      let dateStr = "";
      if (typeof rawDate === "number") {
        const d = XLSX.SSF.parse_date_code(rawDate);
        dateStr = `${pad(d.d)}-${pad(d.m)}-${d.y}`;
      } else if (typeof rawDate === "string") {
        dateStr = rawDate;
      }
      rows.push({ date: dateStr, ref, doc, desc, debit, credit });
    }
  }
  return rows;
}

function parseDate(ddmmyyyy: string): number | null {
  const m = ddmmyyyy.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!m) return null;
  return new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1])).getTime();
}

const DAY_MS = 86400000;

type MatchedPair = {
  companyEntry: LedgerEntry;
  vendorEntry: LedgerEntry;
  matchType: "exact" | "date-proximity";
};

function reconcile(companyEntries: LedgerEntry[], vendorEntries: LedgerEntry[]) {
  const matched: MatchedPair[] = [];
  const usedCompany = new Set<number>();
  const usedVendor = new Set<number>();

  // In ledger vs ledger, company's debit matches vendor's credit and vice versa
  // Company books: "To Vendor" (debit) = they owe vendor
  // Vendor books: "By Company" (credit) = they received from company
  // So company debit amount should match vendor credit amount

  // Pass 1: exact date + amount match (cross-side: company debit = vendor credit)
  for (let ci = 0; ci < companyEntries.length; ci++) {
    if (usedCompany.has(ci)) continue;
    const ce = companyEntries[ci];
    const ceAmt = ce.debit || ce.credit;
    const ceIsDebit = ce.debit > 0;

    for (let vi = 0; vi < vendorEntries.length; vi++) {
      if (usedVendor.has(vi)) continue;
      const ve = vendorEntries[vi];
      const veAmt = ve.debit || ve.credit;
      const veIsDebit = ve.debit > 0;

      if (Math.abs(ceAmt - veAmt) > 0.01) continue;
      // Cross-match: company debit ↔ vendor credit, company credit ↔ vendor debit
      if (ceIsDebit === veIsDebit) continue;
      if (ce.date !== ve.date) continue;

      matched.push({ companyEntry: ce, vendorEntry: ve, matchType: "exact" });
      usedCompany.add(ci);
      usedVendor.add(vi);
      break;
    }
  }

  // Pass 2: same amount, cross-side, date within 7 days
  for (let ci = 0; ci < companyEntries.length; ci++) {
    if (usedCompany.has(ci)) continue;
    const ce = companyEntries[ci];
    const ceAmt = ce.debit || ce.credit;
    const ceIsDebit = ce.debit > 0;
    const ceDate = parseDate(ce.date);

    for (let vi = 0; vi < vendorEntries.length; vi++) {
      if (usedVendor.has(vi)) continue;
      const ve = vendorEntries[vi];
      const veAmt = ve.debit || ve.credit;
      const veIsDebit = ve.debit > 0;

      if (Math.abs(ceAmt - veAmt) > 0.01) continue;
      if (ceIsDebit === veIsDebit) continue;

      const veDate = parseDate(ve.date);
      if (ceDate && veDate && Math.abs(ceDate - veDate) <= 7 * DAY_MS) {
        matched.push({ companyEntry: ce, vendorEntry: ve, matchType: "date-proximity" });
        usedCompany.add(ci);
        usedVendor.add(vi);
        break;
      }
    }
  }

  // Pass 3: same-side amount match (both debits or both credits) — could be same transaction recorded the same way
  for (let ci = 0; ci < companyEntries.length; ci++) {
    if (usedCompany.has(ci)) continue;
    const ce = companyEntries[ci];
    const ceAmt = ce.debit || ce.credit;
    const ceIsDebit = ce.debit > 0;
    const ceDate = parseDate(ce.date);

    for (let vi = 0; vi < vendorEntries.length; vi++) {
      if (usedVendor.has(vi)) continue;
      const ve = vendorEntries[vi];
      const veAmt = ve.debit || ve.credit;
      const veIsDebit = ve.debit > 0;

      if (Math.abs(ceAmt - veAmt) > 0.01) continue;
      if (ceIsDebit !== veIsDebit) continue;

      const veDate = parseDate(ve.date);
      if (ceDate && veDate && Math.abs(ceDate - veDate) <= 3 * DAY_MS) {
        matched.push({ companyEntry: ce, vendorEntry: ve, matchType: "date-proximity" });
        usedCompany.add(ci);
        usedVendor.add(vi);
        break;
      }
    }
  }

  const companyUnmatched = companyEntries.filter((_, i) => !usedCompany.has(i));
  const vendorUnmatched = vendorEntries.filter((_, i) => !usedVendor.has(i));

  return { matched, companyUnmatched, vendorUnmatched };
}

const fmt = (n: number) =>
  n === 0 ? "0.00" : n.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export async function POST(req: Request) {
  try {
    const fd = await req.formData();
    const companyFile = fd.get("companyFile") as File | null;
    const vendorFile = fd.get("vendorFile") as File | null;

    if (!companyFile || !vendorFile) {
      return Response.json({ error: "Both company ledger and vendor/customer ledger are required." }, { status: 400 });
    }

    const companyExt = companyFile.name.split(".").pop()?.toLowerCase();
    const vendorExt = vendorFile.name.split(".").pop()?.toLowerCase();

    if (!["xls", "xlsx"].includes(companyExt || "")) {
      return Response.json({ error: `Company ledger must be XLS/XLSX. Got: ${companyExt}` }, { status: 400 });
    }
    if (!["xls", "xlsx"].includes(vendorExt || "")) {
      return Response.json({ error: `Vendor/customer ledger must be XLS/XLSX. Got: ${vendorExt}` }, { status: 400 });
    }

    const companyBuffer = Buffer.from(await companyFile.arrayBuffer());
    const vendorBuffer = Buffer.from(await vendorFile.arrayBuffer());

    const companyEntries = parseLedgerExcel(companyBuffer);
    const vendorEntries = parseLedgerExcel(vendorBuffer);

    if (companyEntries.length === 0) {
      return Response.json({ error: "No data found in company ledger. Make sure it has Date, Debit, Credit columns." }, { status: 400 });
    }
    if (vendorEntries.length === 0) {
      return Response.json({ error: "No data found in vendor/customer ledger. Make sure it has Date, Debit, Credit columns." }, { status: 400 });
    }

    const { matched, companyUnmatched, vendorUnmatched } = reconcile(companyEntries, vendorEntries);

    const companyTotalDR = companyEntries.reduce((s, e) => s + e.debit, 0);
    const companyTotalCR = companyEntries.reduce((s, e) => s + e.credit, 0);
    const vendorTotalDR = vendorEntries.reduce((s, e) => s + e.debit, 0);
    const vendorTotalCR = vendorEntries.reduce((s, e) => s + e.credit, 0);

    const companyUnmatchedDR = companyUnmatched.reduce((s, e) => s + e.debit, 0);
    const companyUnmatchedCR = companyUnmatched.reduce((s, e) => s + e.credit, 0);
    const vendorUnmatchedDR = vendorUnmatched.reduce((s, e) => s + e.debit, 0);
    const vendorUnmatchedCR = vendorUnmatched.reduce((s, e) => s + e.credit, 0);

    return Response.json({
      companyTotal: companyEntries.length,
      vendorTotal: vendorEntries.length,
      matchedCount: matched.length,
      exactMatchCount: matched.filter(m => m.matchType === "exact").length,
      proximityMatchCount: matched.filter(m => m.matchType === "date-proximity").length,
      matched: matched.map(m => ({
        companyDate: m.companyEntry.date,
        companyDesc: m.companyEntry.desc,
        companyRef: m.companyEntry.ref,
        companyDoc: m.companyEntry.doc,
        companyDebit: m.companyEntry.debit,
        companyCredit: m.companyEntry.credit,
        vendorDate: m.vendorEntry.date,
        vendorDesc: m.vendorEntry.desc,
        vendorRef: m.vendorEntry.ref,
        vendorDoc: m.vendorEntry.doc,
        vendorDebit: m.vendorEntry.debit,
        vendorCredit: m.vendorEntry.credit,
        matchType: m.matchType,
      })),
      companyUnmatched,
      vendorUnmatched,
      summary: {
        companyTotalDR: fmt(companyTotalDR),
        companyTotalCR: fmt(companyTotalCR),
        vendorTotalDR: fmt(vendorTotalDR),
        vendorTotalCR: fmt(vendorTotalCR),
        companyUnmatchedCount: companyUnmatched.length,
        companyUnmatchedDR: fmt(companyUnmatchedDR),
        companyUnmatchedCR: fmt(companyUnmatchedCR),
        vendorUnmatchedCount: vendorUnmatched.length,
        vendorUnmatchedDR: fmt(vendorUnmatchedDR),
        vendorUnmatchedCR: fmt(vendorUnmatchedCR),
      },
    });
  } catch (err) {
    console.error("Ledger vs Ledger error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Unexpected error" },
      { status: 500 }
    );
  }
}
