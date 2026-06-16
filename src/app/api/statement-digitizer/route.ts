/**
 * POST /api/statement-digitizer — Statement Digitizer module.
 *
 * Multi-step flow:
 *   step=A  → Validate & extract bank statement
 *   step=B  → Validate & extract ledger
 *   step=C  → (future) Learn from corrections
 *
 * FormData:
 *   - step: "A" | "B"
 *   - file: the uploaded file
 *   - password?: optional PDF password
 */

export const maxDuration = 300;
export const runtime = "nodejs";

import Anthropic from "@anthropic-ai/sdk";

/* ── PDF text extraction with password support ── */

async function extractPdfText(buffer: Buffer, password?: string): Promise<{ text: string; needsPassword: boolean }> {
  try {
    const PDFJS = require("pdf-parse/lib/pdf.js/v2.0.550/build/pdf.js");
    PDFJS.disableWorker = true;
    const source = password ? { data: new Uint8Array(buffer), password } : new Uint8Array(buffer);
    const doc = await PDFJS.getDocument(source);
    let text = "";
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      let lastY: number | undefined;
      for (const item of content.items) {
        const y = (item as { transform: number[] }).transform[5];
        if (lastY !== undefined && lastY !== y) text += "\n";
        text += (item as { str: string }).str;
        lastY = y;
      }
      text += "\n\n";
    }
    doc.destroy();
    return { text, needsPassword: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/password/i.test(msg) || /PasswordException/i.test(msg) || /encrypted/i.test(msg)) {
      return { text: "", needsPassword: true };
    }
    return { text: "", needsPassword: false };
  }
}

/* ── Extract text from any file type ── */

async function extractFileContent(
  file: File,
  password?: string,
): Promise<{ text: string; needsPassword: boolean; base64?: string; mediaType?: string }> {
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  const buffer = Buffer.from(await file.arrayBuffer());

  if (ext === "pdf") {
    const { text, needsPassword } = await extractPdfText(buffer, password);
    if (needsPassword) return { text: "", needsPassword: true };
    const base64 = buffer.toString("base64");
    return { text, needsPassword: false, base64, mediaType: "application/pdf" };
  }

  if (ext === "xls" || ext === "xlsx") {
    const XLSX = require("xlsx");
    const wb = XLSX.read(buffer, { type: "buffer" });
    let allText = "";
    for (const name of wb.SheetNames) {
      const ws = wb.Sheets[name];
      allText += `--- Sheet: ${name} ---\n`;
      allText += XLSX.utils.sheet_to_csv(ws) + "\n\n";
    }
    return { text: allText, needsPassword: false };
  }

  if (ext === "csv") {
    return { text: buffer.toString("utf-8"), needsPassword: false };
  }

  return { text: "", needsPassword: false };
}

/* ── AI Prompts ── */

const STEP_A_PROMPT = `You are a document validator and bank statement parser.

FIRST: Determine if this document is a BANK STATEMENT. A bank statement is issued by a bank and contains:
- Bank name/logo
- Account holder name
- Account number
- Transaction rows with dates, descriptions, and amounts (debit/credit/balance)

If this is NOT a bank statement (e.g. it's a ledger, invoice, receipt, letter, or any other document), respond with:
{"valid": false, "reason": "This does not appear to be a bank statement. It looks like a [what it actually is]."}

If it IS a valid bank statement, extract ALL transactions and respond with:
{
  "valid": true,
  "bankName": "<exact bank name as printed>",
  "bankNameNormalized": "<standardized short name, e.g. 'Habib Metropolitan Bank' for HMB/HMPB/Habib Metro etc>",
  "accountTitle": "<account holder name>",
  "accountNumber": "<account number>",
  "currency": "<currency code e.g. PKR, USD>",
  "statementPeriod": "<e.g. 01-May-2026 to 31-May-2026>",
  "openingBalance": <number or null>,
  "closingBalance": <number or null>,
  "transactions": [
    {
      "date": "DD-MM-YYYY",
      "description": "<transaction description, max 100 chars>",
      "debit": 0,
      "credit": 0,
      "balance": 0
    }
  ]
}

Rules:
- date must be DD-MM-YYYY
- debit = withdrawal/money out, credit = deposit/money in
- amounts as plain numbers, no commas
- One transaction per row, skip headers/totals/opening-closing balance rows
- Do NOT skip any transaction. Do NOT invent transactions. Accuracy is critical.
- Respond with ONLY the JSON object, no other text.`;

const STEP_B_PROMPT = `You are a document validator and ledger parser.

FIRST: Determine if this document is a LEDGER or BOOK OF ACCOUNTS. A ledger typically contains:
- Account name or party name
- Transaction rows with dates, descriptions/particulars, and debit/credit amounts
- It may come from accounting software (Tally, QuickBooks, SAP, etc.) or be manually prepared
- It records the company's own books, NOT a bank-issued statement

If this is NOT a ledger (e.g. it's a bank statement, invoice, receipt, or any other document), respond with:
{"valid": false, "reason": "This does not appear to be a ledger. It looks like a [what it actually is]."}

If it IS a valid ledger, extract ALL entries and respond with:
{
  "valid": true,
  "ledgerName": "<account/party name from the ledger>",
  "period": "<date range if visible, e.g. 1-Jul-22 to 30-Jun-23>",
  "software": "<detected software if any: Tally, QuickBooks, SAP, Manual, Unknown>",
  "openingBalance": <number or null>,
  "closingBalance": <number or null>,
  "entries": [
    {
      "date": "DD-MM-YYYY",
      "particulars": "<description/party name, max 100 chars>",
      "voucherType": "<Journal, Receipt, Payment, Contra, etc. or empty>",
      "voucherNo": "<voucher/reference number or empty>",
      "debit": 0,
      "credit": 0
    }
  ]
}

Rules:
- date must be DD-MM-YYYY
- In Tally ledgers: "To" prefix = Debit entry, "By" prefix = Credit entry
- amounts as plain numbers, no commas
- One entry per row, skip headers/totals/carried-forward/brought-forward rows
- Do NOT skip any entry. Do NOT invent entries. Accuracy is critical.
- Respond with ONLY the JSON object, no other text.`;

/* ── AI call helper ── */

async function callAI(
  prompt: string,
  content: { text?: string; base64?: string; mediaType?: string },
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("No API key configured. Set ANTHROPIC_API_KEY in .env.local.");

  const client = new Anthropic({ apiKey });
  const blocks: Anthropic.ContentBlockParam[] = [];

  if (content.base64 && content.mediaType === "application/pdf") {
    blocks.push({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: content.base64 },
    });
  }

  if (content.text && content.text.replace(/\s/g, "").length >= 50) {
    blocks.push({
      type: "text",
      text: `Document content:\n\n${content.text}`,
    });
  }

  if (blocks.length === 0) {
    throw new Error("No readable content could be extracted from the file.");
  }

  blocks.push({ type: "text", text: prompt });

  const response = await client.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: 32000,
    messages: [{ role: "user", content: blocks }],
  }).finalMessage();

  const textBlock = response.content.find((b) => b.type === "text");
  return textBlock && textBlock.type === "text" ? textBlock.text : "";
}

/* ── POST handler ── */

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const step = (formData.get("step") as string) ?? "";
    const file = formData.get("file") as File | null;
    const password = (formData.get("password") as string) || undefined;

    if (!file) {
      return Response.json({ error: "No file uploaded." }, { status: 400 });
    }

    if (file.size > 30 * 1024 * 1024) {
      return Response.json({ error: "File too large (max 30 MB)." }, { status: 400 });
    }

    const { text, needsPassword, base64, mediaType } = await extractFileContent(file, password);

    if (needsPassword) {
      return Response.json({ passwordRequired: true });
    }

    if (!text && !base64) {
      return Response.json({ error: "Could not extract any content from the file. Ensure it is a valid PDF, Excel, or CSV." }, { status: 400 });
    }

    if (step === "A") {
      const raw = await callAI(STEP_A_PROMPT, { text, base64, mediaType });
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return Response.json({ error: "AI could not process this file. Please try again." }, { status: 400 });
      }
      const parsed = JSON.parse(jsonMatch[0]);

      if (!parsed.valid) {
        return Response.json({ valid: false, reason: parsed.reason || "This does not appear to be a bank statement." });
      }

      return Response.json({
        valid: true,
        bankName: parsed.bankName || "Unknown Bank",
        bankNameNormalized: parsed.bankNameNormalized || parsed.bankName || "Unknown Bank",
        accountTitle: parsed.accountTitle || "",
        accountNumber: parsed.accountNumber || "",
        currency: parsed.currency || "PKR",
        statementPeriod: parsed.statementPeriod || "",
        openingBalance: parsed.openingBalance ?? null,
        closingBalance: parsed.closingBalance ?? null,
        transactions: (parsed.transactions || []).map((t: Record<string, unknown>) => ({
          date: String(t.date || ""),
          description: String(t.description || "").substring(0, 100),
          debit: Number(t.debit) || 0,
          credit: Number(t.credit) || 0,
          balance: Number(t.balance) || 0,
        })),
      });
    }

    if (step === "B") {
      const raw = await callAI(STEP_B_PROMPT, { text, base64, mediaType });
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return Response.json({ error: "AI could not process this file. Please try again." }, { status: 400 });
      }
      const parsed = JSON.parse(jsonMatch[0]);

      if (!parsed.valid) {
        return Response.json({ valid: false, reason: parsed.reason || "This does not appear to be a ledger." });
      }

      return Response.json({
        valid: true,
        ledgerName: parsed.ledgerName || "Unknown Ledger",
        period: parsed.period || "",
        software: parsed.software || "Unknown",
        openingBalance: parsed.openingBalance ?? null,
        closingBalance: parsed.closingBalance ?? null,
        entries: (parsed.entries || []).map((e: Record<string, unknown>) => ({
          date: String(e.date || ""),
          particulars: String(e.particulars || "").substring(0, 100),
          voucherType: String(e.voucherType || ""),
          voucherNo: String(e.voucherNo || ""),
          debit: Number(e.debit) || 0,
          credit: Number(e.credit) || 0,
        })),
      });
    }

    return Response.json({ error: "Invalid step. Use step=A or step=B." }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}
