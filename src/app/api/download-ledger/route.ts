/**
 * GET /api/download-ledger
 * Generates an Excel file containing the updated journal ledger
 * with all corrective entries for Kafi Commodities ABL-950028.
 */

import * as XLSX from "xlsx";

export const runtime = "nodejs";

export async function GET() {
  const wb = XLSX.utils.book_new();

  /* ── Sheet 1: Cover / Summary ────────────────────── */
  const summary = [
    ["UPDATED JOURNAL LEDGER — CORRECTIVE ENTRIES"],
    ["Kafi Commodities (Pvt) Limited"],
    ["ABL A/C: 0010092704950028 | Clifton, Karachi"],
    ["Period: 01 October 2025 to 30 May 2026"],
    ["Generated: " + new Date().toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" })],
    [],
    ["STATUS: PENDING MANAGEMENT APPROVAL"],
    [],
    ["This workbook contains the journal entries required to reconcile the"],
    ["bank statement (ABL-950028.pdf) against the journal ledger."],
    [],
    ["Verified closing balances:"],
    ["  Bank Statement (29 May 2026):  PKR 27,770,416.90"],
    ["  Journal Ledger (25 May 2026):  PKR 16,867,366.04"],
    ["  Difference to reconcile:       PKR 10,903,050.86"],
    [],
    ["The corrective entries below address PKR 95,194.86 of this gap."],
    ["The remaining PKR 10,807,856.00 represents outstanding cheques and"],
    ["timing differences between 25-29 May 2026 — these require manual review."],
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(summary);
  ws1["!cols"] = [{ wch: 75 }];
  XLSX.utils.book_append_sheet(wb, ws1, "Summary");

  /* ── Sheet 2: Corrective Journal Entries ────────── */
  const je = [
    ["CORRECTIVE JOURNAL ENTRIES — PENDING APPROVAL"],
    [],
    ["JE #", "Date", "Account Code", "Account Name", "Description", "Debit (PKR)", "Credit (PKR)"],
    [],
    // JE-1: Bank Charges (combined)
    ["JE-1", "Period", "6410", "Bank Charges Expense", "Service charges, online charges, cheque book, statement, stop payment (19 entries)", 12191.72, ""],
    ["JE-1", "Period", "1110", "ABL-950028 Cash at Bank", "", "", 12191.72],
    [],
    // JE-2: FED
    ["JE-2", "Period", "7120", "FED on Bank Charges", "FED deductions across period (18 entries from Oct 25 to Apr 26)", 1525.24, ""],
    ["JE-2", "Period", "1110", "ABL-950028 Cash at Bank", "", "", 1525.24],
    [],
    // JE-3: WHT
    ["JE-3", "31-Dec-25", "1350", "WHT Receivable", "Withholding tax on Q4 2025 bank profit", 27227.96, ""],
    ["JE-3", "31-Dec-25", "1110", "ABL-950028 Cash at Bank", "", "", 27227.96],
    [],
    // JE-4: Bank Profit
    ["JE-4", "31-Dec-25", "1110", "ABL-950028 Cash at Bank", "Bank profit earned Q4 2025 (PLS profit credit)", 136139.78, ""],
    ["JE-4", "31-Dec-25", "4210", "Profit on Bank Deposit", "", "", 136139.78],
    [],
    [],
    ["", "", "", "TOTAL DEBITS", "", 177084.70, ""],
    ["", "", "", "TOTAL CREDITS", "", "", 177084.70],
    ["", "", "", "Net effect on Cash at Bank", "Increase of PKR 95,194.86", "", ""],
    [],
    [],
    ["APPROVAL"],
    [],
    ["Prepared by:    AI Agent Finance (by Sheikh Shumyle)"],
    ["Date:           " + new Date().toLocaleDateString("en-PK")],
    [],
    ["Reviewed by:    _________________________________________________"],
    ["Date:           _________________________________________________"],
    [],
    ["Approved by:    _________________________________________________"],
    ["Date:           _________________________________________________"],
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(je);
  ws2["!cols"] = [{ wch: 8 }, { wch: 12 }, { wch: 14 }, { wch: 26 }, { wch: 50 }, { wch: 15 }, { wch: 15 }];
  XLSX.utils.book_append_sheet(wb, ws2, "Corrective JEs");

  /* ── Sheet 3: FED Detail ─────────────────────────── */
  const fedData = [
    ["FED DEDUCTIONS — DETAIL"],
    ["Federal Excise Duty on bank services — not recorded in ledger"],
    [],
    ["Date", "Reference / Cheque #", "Amount (PKR)"],
    ["08-Oct-25", "AC-PL52058", 130.00],
    ["14-Oct-25", "(no ref)", 4.56],
    ["18-Oct-25", "87345500", 3.00],
    ["18-Oct-25", "87345502", 3.00],
    ["21-Oct-25", "(no ref)", 4.56],
    ["29-Oct-25", "CCY=PKR", 180.00],
    ["30-Oct-25", "AC-PL52058", 130.00],
    ["07-Nov-25", "(no ref)", 520.00],
    ["29-Nov-25", "87961675", 3.00],
    ["29-Nov-25", "87961676", 3.00],
    ["06-Dec-25", "87961678", 3.00],
    ["12-Dec-25", "(no ref)", 4.56],
    ["12-Dec-25", "(no ref)", 4.56],
    ["10-Jan-26", "87961701", 3.00],
    ["21-Feb-26", "87961741", 3.00],
    ["27-Feb-26", "(no ref)", 520.00],
    ["04-Apr-26", "88839698", 3.00],
    ["25-Apr-26", "88839725", 3.00],
    [],
    ["", "TOTAL", 1525.24],
  ];
  const ws3 = XLSX.utils.aoa_to_sheet(fedData);
  ws3["!cols"] = [{ wch: 14 }, { wch: 26 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, ws3, "FED Detail");

  /* ── Sheet 4: All Bank Charges Detail ─────────────── */
  const chargesData = [
    ["BANK CHARGES — DETAIL"],
    ["All bank-side charges missing from ledger"],
    [],
    ["Category", "Date", "Reference / Detail", "Amount (PKR)"],
    ["Service Charge (IBFT/RTGS)", "08-Oct-25", "IWCLGRTLCYS", 1000.00],
    ["Service Charge (IBFT/RTGS)", "30-Oct-25", "IWCLGRTLCYS", 1000.00],
    ["Online Transfer Charge", "18-Oct-25", "87345500", 20.00],
    ["Online Transfer Charge", "18-Oct-25", "87345502", 20.00],
    ["Online Transfer Charge", "07-Nov-25", "AC-0020153410340015", 690.00],
    ["Online Transfer Charge", "29-Nov-25", "87961675", 20.00],
    ["Online Transfer Charge", "29-Nov-25", "87961676", 20.00],
    ["Online Transfer Charge", "06-Dec-25", "87961678", 20.00],
    ["Online Transfer Charge", "10-Jan-26", "87961701", 20.00],
    ["Online Transfer Charge", "21-Feb-26", "87961741", 20.00],
    ["Online Transfer Charge", "04-Apr-26", "88839698", 20.00],
    ["Online Transfer Charge", "25-Apr-26", "88839725", 20.00],
    ["Cheque Book Charge", "07-Nov-25", "New cheque book", 4000.00],
    ["Cheque Book Charge", "27-Feb-26", "New cheque book", 4000.00],
    ["Account Statement Charge", "14-Oct-25", "Statement request", 30.43],
    ["Account Statement Charge", "21-Oct-25", "Statement request", 30.43],
    ["Account Statement Charge", "12-Dec-25", "Statement request", 30.43],
    ["Account Statement Charge", "12-Dec-25", "Statement request", 30.43],
    ["Stop Payment Charge", "29-Oct-25", "CCY=PKR", 1200.00],
    [],
    ["", "", "TOTAL", 12191.72],
  ];
  const ws4 = XLSX.utils.aoa_to_sheet(chargesData);
  ws4["!cols"] = [{ wch: 28 }, { wch: 14 }, { wch: 28 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, ws4, "Bank Charges Detail");

  /* ── Sheet 5: Account Sweeps (for verification) ───── */
  const sweepData = [
    ["ACCOUNT SWEEPS — REQUIRES MANUAL VERIFICATION"],
    ["Auto-transfers from linked Export account (ABL-950011)"],
    [],
    ["Date", "Description", "Amount (PKR)", "Verify Against"],
    ["24-Oct-25", "Account Sweep", 4265662.83, "J-xxx ABL-950011 entry in ledger"],
    ["18-Dec-25", "Account Sweep", 4313036.82, "J-xxx ABL-950011 entry in ledger"],
    ["09-Jan-26", "Account Sweep", 3534360.52, "J-xxx ABL-950011 entry in ledger"],
    ["26-Jan-26", "Account Sweep", 4300497.98, "J-xxx ABL-950011 entry in ledger"],
    ["03-Feb-26", "Account Sweep", 5183585.00, "J-xxx ABL-950011 entry in ledger"],
    ["26-Mar-26", "Account Sweep", 2451360.68, "J-xxx ABL-950011 entry in ledger"],
    ["02-Apr-26", "Account Sweep", 3907522.25, "J-xxx ABL-950011 entry in ledger"],
    ["25-May-26", "Account Sweep", 9202114.28, "J-xxx ABL-950011 entry in ledger"],
    [],
    ["", "TOTAL", 37158140.36, ""],
  ];
  const ws5 = XLSX.utils.aoa_to_sheet(sweepData);
  ws5["!cols"] = [{ wch: 14 }, { wch: 24 }, { wch: 18 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, ws5, "Account Sweeps");

  /* ── Output ──────────────────────────────────────── */
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="Updated-Ledger-ABL-950028.xlsx"',
    },
  });
}
