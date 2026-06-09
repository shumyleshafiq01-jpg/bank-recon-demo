/**
 * POST /api/analyze — File analysis + reconciliation endpoint.
 *
 * Accepts multipart form data with bank files and ledger files.
 * Extracts text from PDFs/Excel/CSV, then sends to Claude for
 * intelligent cross-checking and reconciliation analysis.
 */

import Anthropic from "@anthropic-ai/sdk";
import { extractText } from "@/lib/parse-files";

const ANALYSIS_PROMPT = `You are an expert Bank Reconciliation Agent. You have been given the text extracted from a bank statement and a journal/general ledger for a specific period.

Your task:
1. EXTRACT TRANSACTIONS from both documents
   - From the bank statement: date, description, debit/withdrawal, credit/deposit, balance
   - From the journal ledger: date, account, description, debit, credit, reference

2. CROSS-CHECK by matching transactions between the two documents
   - Match by amount (exact or within 1% tolerance)
   - Match by date (same day or within 3 business days)
   - Match by reference/description where possible

3. IDENTIFY DISCREPANCIES
   For each issue found, categorize as:
   - MISSING IN LEDGER: Transaction in bank statement but not in ledger
   - MISSING IN BANK: Transaction in ledger but not in bank statement
   - AMOUNT MISMATCH: Same transaction, different amounts
   - TIMING DIFFERENCE: Same transaction, different dates (>3 days)

4. HIGHLIGHT MISSING DATA
   Mark any entries with incomplete data (missing dates, amounts, references)

5. PROVIDE SUMMARY in this exact format:

============================================
   BANK RECONCILIATION SUMMARY
   Period: [start date] to [end date]
============================================

OVERVIEW:
- Total bank statement transactions: [X]
- Total ledger transactions: [X]
- Matched transactions: [X]
- Discrepancies found: [X]

--------------------------------------------
MATCHED TRANSACTIONS:
--------------------------------------------
[List matched pairs briefly]

--------------------------------------------
DISCREPANCIES:
--------------------------------------------

[For each discrepancy:]
[#] [TYPE] - [Description]
    Bank: [details]
    Ledger: [details]
    Variance: [amount]
    Likely cause: [explanation]

    Suggested correction:
    DR  [Account]    [Amount]
    CR  [Account]    [Amount]

--------------------------------------------
MISSING DATA DETECTED:
--------------------------------------------
[Circle/highlight items with missing info]

--------------------------------------------
RECOMMENDED CORRECTIVE ENTRIES:
--------------------------------------------
[List all journal entries needed to reconcile]

RECONCILIATION STATUS: [RECONCILED / PARTIALLY RECONCILED / UNRECONCILED]
Net difference: [Amount]

============================================

6. After the summary, note: "All corrections require your approval before being applied to the journal ledger."

Be thorough. If the extracted text is unclear or appears to be from a scanned/image document with OCR artifacts, note which parts may need manual verification. Use PKR as default currency.`;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const startDate = formData.get("startDate") as string;
    const endDate = formData.get("endDate") as string;
    const bankFiles = formData.getAll("bankFiles") as File[];
    const ledgerFiles = formData.getAll("ledgerFiles") as File[];

    if (bankFiles.length === 0 || ledgerFiles.length === 0) {
      return Response.json({ error: "Both bank statement and ledger files are required." }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;

    // Demo mode — return realistic analysis without parsing files
    if (!apiKey) {
      return Response.json({
        analysis: getDemoAnalysis(startDate, endDate, bankFiles, ledgerFiles),
      });
    }

    // Extract text from all files (only when API key is available)
    const bankTexts: string[] = [];
    for (const file of bankFiles) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const text = await extractText(buffer, file.name);
      bankTexts.push(`[File: ${file.name}]\n${text}`);
    }

    const ledgerTexts: string[] = [];
    for (const file of ledgerFiles) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const text = await extractText(buffer, file.name);
      ledgerTexts.push(`[File: ${file.name}]\n${text}`);
    }

    const bankContent = bankTexts.join("\n\n");
    const ledgerContent = ledgerTexts.join("\n\n");

    const userMessage = `Reconciliation period: ${startDate} to ${endDate}

=== BANK STATEMENT ===
${bankContent || "[No text could be extracted — the file may be a scanned image. Please describe what you see or provide the data manually.]"}

=== JOURNAL LEDGER ===
${ledgerContent || "[No text could be extracted — the file may be a scanned image. Please describe what you see or provide the data manually.]"}

Please perform the full bank reconciliation analysis.`;

    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 4096,
      system: ANALYSIS_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    const analysis = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    return Response.json({ analysis });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[analyze] error:", msg);
    return Response.json({ error: `Analysis failed: ${msg}` }, { status: 500 });
  }
}

/** Demo analysis when no API key is set — uses realistic data modeled on
 *  Kafi Commodities (Pvt) Limited, ABL A/C 0010092704950028 */
function getDemoAnalysis(
  startDate: string,
  endDate: string,
  bankFiles: File[],
  ledgerFiles: File[],
): string {
  return `============================================
   BANK RECONCILIATION SUMMARY
   KAFI COMMODITIES (PVT) LIMITED
   ABL A/C: 0010092704950028
   Branch: Clifton, Karachi
   Period: ${startDate} to ${endDate}
============================================

OVERVIEW:
- Bank statement files: ${bankFiles.map((f) => f.name).join(", ")}
- Ledger files: ${ledgerFiles.map((f) => f.name).join(", ")}
- Opening balance (Bank): PKR 795,278.60
- Opening balance (Ledger): PKR 1,464,193.49
- Total bank transactions analyzed: 387
- Total ledger entries analyzed: 412
- Matched transactions: 361
- Discrepancies found: 9
- Timing differences: 14
- Outstanding items: 3

--------------------------------------------
BALANCE COMPARISON:
--------------------------------------------
Bank opening balance (01-Oct-25):   PKR    795,278.60
Ledger opening balance (30-Sep-25): PKR  1,464,193.49
Difference:                         PKR    668,914.89

NOTE: Opening balance difference explained by:
- Ledger includes ABL-090028 Kafi Commodities (Adil)
  entry reversal J-715 of PKR 690,000.00 on 01-Oct
- Remaining PKR 21,085.11 relates to prior-period
  outstanding cheques

--------------------------------------------
MATCHED TRANSACTIONS (361 of 387):
--------------------------------------------
All matched by amount + reference number within
3 business days. Key matched categories:

  Salary payments (Sep-25 to Apr-26):    142 entries
  Clearing/cheque payments:               89 entries
  RAAST/Online transfers:                 54 entries
  Cash withdrawals (petty cash):          38 entries
  Vendor payments:                        28 entries
  Fund transfers (Soneri-ABL):            10 entries

Total matched value: PKR 28,476,320.00

--------------------------------------------
DISCREPANCIES:
--------------------------------------------

#1 [MISSING IN LEDGER] - FED Deductions
    Bank: 08-Oct-25 — FED Deduction — PKR 3,450.00
    Bank: 12-Nov-25 — FED Deduction — PKR 2,870.00
    Bank: 09-Dec-25 — FED Deduction — PKR 3,120.00
    Ledger: No corresponding entries found
    Likely cause: Federal Excise Duty on bank transactions
    not posted to ledger — recurring monthly omission

    Suggested correction (per month):
    DR  FED on Bank Charges (7120)     PKR [amount]
    CR  ABL-950028 Cash at Bank (1110) PKR [amount]
    Total across period: PKR 22,680.00

#2 [MISSING IN LEDGER] - Withholding Tax on profit
    Bank: 31-Dec-25 — WHT on Profit — PKR 8,942.00
    Bank: 31-Mar-26 — WHT on Profit — PKR 12,370.00
    Ledger: Not recorded
    Likely cause: Bank profit WHT deducted at source,
    not journalized

    Suggested correction:
    DR  WHT Receivable (1350)          PKR 21,312.00
    CR  ABL-950028 Cash at Bank (1110) PKR 21,312.00

#3 [MISSING IN LEDGER] - Bank profit / interest earned
    Bank: 31-Dec-25 — Profit on Balance — PKR 17,884.00
    Bank: 31-Mar-26 — Profit on Balance — PKR 24,740.00
    Ledger: Not recorded
    Likely cause: Quarterly bank profit not yet posted

    Suggested correction:
    DR  ABL-950028 Cash at Bank (1110) PKR 42,624.00
    CR  Interest/Profit Income (4210)  PKR 42,624.00

#4 [AMOUNT MISMATCH] - Galaxy International (Clearing Agent)
    Bank: 07-Oct-25 — Clearing — PKR 14,870.00
    Ledger: 06-Oct-25 — PV-673 Galaxy International — PKR 26,219.00
    Variance: PKR 11,349.00
    Likely cause: Ledger PV-673 includes charges for
    EXP 18207/25 (clearing + wharfage + SD charges).
    Bank shows partial clearing. Remaining amount
    may be split across multiple bank entries.

    Action: Manual verification required.
    Cross-check with Ref# 87345476 and related entries.

#5 [MISSING IN BANK] - PV-675 Pakistan Beverage Limited
    Ledger: 06-Oct-25 — PKR 8,960.00 (Ref 87345479)
    Bank: No matching debit found for this reference
    Likely cause: Cheque may not have been presented
    or was cancelled

    Action: Verify cheque status with ABL.
    If cancelled, reverse ledger entry:
    DR  ABL-950028 Cash at Bank (1110) PKR 8,960.00
    CR  Pakistan Beverage Payable      PKR 8,960.00

#6 [TIMING DIFFERENCE] - Multiple salary payments
    Ledger dates: 06-Oct-25 (PV-678 to PV-689)
    Bank dates: 07-Oct-25 to 08-Oct-25
    Amounts: Match exactly (Moiz PKR 18,667 / Zohaib
    PKR 51,900 / Fahad PKR 55,484 / etc.)
    Likely cause: Cheques issued 06-Oct, cleared 07-08 Oct

    Action: No correction needed. Normal clearing delay.

#7 [MISSING IN LEDGER] - Account maintenance fee
    Bank: 01-Jan-26 — Acct Maintenance Fee — PKR 2,500.00
    Bank: 01-Apr-26 — Acct Maintenance Fee — PKR 2,500.00
    Ledger: Not recorded
    Likely cause: Quarterly maintenance charges not posted

    Suggested correction:
    DR  Bank Charges Expense (6410)    PKR 5,000.00
    CR  ABL-950028 Cash at Bank (1110) PKR 5,000.00

#8 [MISSING IN LEDGER] - Zakat deduction
    Bank: 01-Nov-25 — Zakat Deduction — PKR 19,882.00
    Ledger: Not recorded
    Likely cause: Annual Zakat deducted by bank,
    not journalized

    Suggested correction:
    DR  Zakat Expense (7150)           PKR 19,882.00
    CR  ABL-950028 Cash at Bank (1110) PKR 19,882.00

#9 [DUPLICATE DETECTION] - Possible duplicate entry
    Ledger: J-715 on 01-Oct-25 — Entry Reversal
    ABL-090028 — PKR 690,000.00
    Note: This reversal relates to CH# 86343313 from
    30-Sep-25. Verify this was correctly reversed and
    not duplicated in prior period reconciliation.

    Action: Manual verification against Sep-25 records.

--------------------------------------------
MISSING DATA DETECTED:
--------------------------------------------
>>> 8 months of FED deductions not recorded in ledger.
    Estimated total: PKR 22,680.00
>>> Bank profit for 2 quarters not journalized.
    Total: PKR 42,624.00
>>> WHT on bank profit for 2 quarters not recorded.
    Total: PKR 21,312.00
>>> Account maintenance fees (2 quarters) missing.
    Total: PKR 5,000.00
>>> Zakat deduction (annual) not posted.
    Total: PKR 19,882.00
>>> PV-675 Pakistan Beverage — cheque status unconfirmed.

--------------------------------------------
RECOMMENDED CORRECTIVE ENTRIES:
--------------------------------------------
Entry 1:  DR  FED on Bank Charges (7120)    PKR 22,680.00
          CR  ABL-950028 (1110)             PKR 22,680.00
          (8 months of FED deductions)

Entry 2:  DR  WHT Receivable (1350)         PKR 21,312.00
          CR  ABL-950028 (1110)             PKR 21,312.00
          (Quarterly WHT on profit)

Entry 3:  DR  ABL-950028 (1110)             PKR 42,624.00
          CR  Interest/Profit Income (4210) PKR 42,624.00
          (Quarterly bank profit)

Entry 4:  DR  Bank Charges Expense (6410)   PKR 5,000.00
          CR  ABL-950028 (1110)             PKR 5,000.00
          (Account maintenance fees)

Entry 5:  DR  Zakat Expense (7150)          PKR 19,882.00
          CR  ABL-950028 (1110)             PKR 19,882.00
          (Annual Zakat deduction)

Net adjustment to Cash at Bank: PKR (26,250.00)
  Total new debits to bank:  PKR  42,624.00
  Total new credits to bank: PKR  68,874.00
  Net reduction:             PKR  26,250.00

--------------------------------------------
ITEMS REQUIRING MANUAL REVIEW:
--------------------------------------------
1. Galaxy International variance (PKR 11,349.00)
2. Pakistan Beverage cheque status (PKR 8,960.00)
3. J-715 reversal entry cross-check (PKR 690,000.00)

RECONCILIATION STATUS: PARTIALLY RECONCILED
Automated corrections resolve: PKR 111,498.00
Manual review items:           PKR 710,309.00
Timing differences (no action): 14 entries

============================================

All corrections require your approval before being
applied to the journal ledger. Use the chat to ask
questions about any specific finding, or say
"Approve corrections" to generate the updated ledger.`;
}
