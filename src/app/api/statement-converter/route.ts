/**
 * POST /api/statement-converter — Module 5: Bank Statement Converter.
 *
 * Converts any bank statement PDF into a clean, standardized XLS file
 * with fixed columns (Date, Description, Debit, Credit, Balance) that
 * Module 4 can read with 100% accuracy regardless of bank format changes.
 *
 * FormData:
 *   - files[]: one or more bank statement PDFs
 *   - banks[]: bank name per file (same index)
 */

export const maxDuration = 300;
export const runtime = "nodejs";

import * as XLSX from "xlsx";
import Anthropic from "@anthropic-ai/sdk";
import { logUsage } from "@/lib/usage-tracker";

const CONVERT_PROMPT = `This is a bank statement from a Pakistani bank. Extract EVERY transaction row from ALL pages.

Respond with ONLY a JSON object, no other text:
{
  "bank": "<bank name as printed on the statement>",
  "opening_balance": <opening/period-start balance as number, or null>,
  "closing_balance": <closing/period-end balance as number, or null>,
  "transactions": [
    {
      "date": "DD-MM-YYYY",
      "description": "<transaction description, max 80 chars>",
      "debit": 0,
      "credit": 0,
      "balance": 0
    }
  ]
}

Rules:
- date must be DD-MM-YYYY using the booking/transaction date (first date column).
- debit = withdrawal/money out, credit = deposit/money in. Exactly one of them is non-zero per row.
- balance = running balance AFTER this transaction. Include it for every row.
- amounts as plain numbers with no commas (e.g. 30000.00).
- Percentages or rates inside descriptions (e.g. "15.00 %") are NOT amounts.
- One transaction = one JSON row, even if its description wraps across multiple lines.
- Skip opening/closing balance rows, totals, and headers — only actual transactions.
- Do not skip any transaction and do not invent any. Accuracy is critical.`;

type ConvertedEntry = {
  date: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
};

type ConvertResult = {
  fileName: string;
  bank: string;
  entries: ConvertedEntry[];
  openingBalance: number | null;
  closingBalance: number | null;
  error?: string;
  warning?: string;
};

const MONTHS: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
};
const pad = (n: number) => String(n).padStart(2, "0");

function normDate(raw: string): string {
  let m = raw.match(/^(\d{1,2})\s+(\w{3})\s+(\d{2})$/);
  if (m) { const mo = MONTHS[m[2].toUpperCase()]; if (mo) return `${pad(parseInt(m[1]))}-${pad(mo)}-${2000 + parseInt(m[3])}`; }
  m = raw.match(/^(\d{1,2})-(\w{3})-(\d{4})$/);
  if (m) { const mo = MONTHS[m[2].toUpperCase()]; if (mo) return `${pad(parseInt(m[1]))}-${pad(mo)}-${parseInt(m[3])}`; }
  m = raw.match(/^(\d{1,2})-(\w{3})-(\d{2})$/);
  if (m) { const mo = MONTHS[m[2].toUpperCase()]; if (mo) return `${pad(parseInt(m[1]))}-${pad(mo)}-${2000 + parseInt(m[3])}`; }
  m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${pad(parseInt(m[1]))}-${pad(parseInt(m[2]))}-${parseInt(m[3])}`;
  m = raw.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (m) return raw;
  m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (m) return `${pad(parseInt(m[1]))}-${pad(parseInt(m[2]))}-${2000 + parseInt(m[3])}`;
  m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = raw.match(/^(\d{1,2})\s+(\w{3})\s+(\d{4})$/);
  if (m) { const mo = MONTHS[m[2].toUpperCase()]; if (mo) return `${pad(parseInt(m[1]))}-${pad(mo)}-${parseInt(m[3])}`; }
  return raw;
}

async function convertFile(file: File, bankHint: string): Promise<ConvertResult> {
  const fileName = file.name;
  const buffer = Buffer.from(await file.arrayBuffer());

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { fileName, bank: bankHint || fileName, entries: [], openingBalance: null, closingBalance: null, error: "No API key configured. Set ANTHROPIC_API_KEY in .env.local." };
  }

  if (buffer.length > 30 * 1024 * 1024) {
    return { fileName, bank: bankHint || fileName, entries: [], openingBalance: null, closingBalance: null, error: `${fileName} is too large (max 30 MB). Split it into smaller files.` };
  }

  const client = new Anthropic({ apiKey });

  // Try text extraction first for text-layer PDFs
  let extractedText = "";
  try {
    const pdfParse = (await import("pdf-parse")).default;
    extractedText = (await pdfParse(buffer)).text ?? "";
  } catch { /* no text layer */ }

  const systemHint = bankHint ? `The user has identified this as a ${bankHint} bank statement. ` : "";
  const prompt = systemHint + CONVERT_PROMPT;

  async function callAI(block: Anthropic.ContentBlockParam): Promise<ConvertResult> {
    const response = await client.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 32000,
      messages: [{ role: "user", content: [block, { type: "text", text: prompt }] }],
    }).finalMessage();

    if (response.usage) {
      logUsage("Statement Converter", "claude-sonnet-4-6", response.usage.input_tokens, response.usage.output_tokens);
    }

    const textBlock = response.content.find((b) => b.type === "text");
    const raw = textBlock && textBlock.type === "text" ? textBlock.text : "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { fileName, bank: bankHint || fileName, entries: [], openingBalance: null, closingBalance: null, error: `AI could not extract transactions from ${fileName}.` };
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      bank?: string;
      opening_balance?: number | null;
      closing_balance?: number | null;
      transactions?: { date: string; description: string; debit: number; credit: number; balance: number }[];
    };

    const bank = parsed.bank || bankHint || "Unknown Bank";
    const entries: ConvertedEntry[] = [];

    for (const t of parsed.transactions ?? []) {
      const date = normDate(String(t.date ?? "").trim());
      const debit = Number(t.debit) || 0;
      const credit = Number(t.credit) || 0;
      const balance = Number(t.balance) || 0;
      if (debit === 0 && credit === 0) continue;
      entries.push({
        date,
        description: String(t.description ?? "").substring(0, 80),
        debit,
        credit,
        balance,
      });
    }

    const openingBalance = typeof parsed.opening_balance === "number" ? parsed.opening_balance : null;
    const closingBalance = typeof parsed.closing_balance === "number" ? parsed.closing_balance : null;

    // Verify arithmetic
    let warning: string | undefined;
    if (openingBalance !== null && closingBalance !== null && entries.length > 0) {
      const totalDR = entries.reduce((s, e) => s + e.debit, 0);
      const totalCR = entries.reduce((s, e) => s + e.credit, 0);
      const computed = openingBalance + totalCR - totalDR;
      const diff = Math.abs(computed - closingBalance);
      if (diff > 1) {
        warning = `Balance check: opening ${openingBalance.toFixed(2)} + credits ${totalCR.toFixed(2)} − debits ${totalDR.toFixed(2)} = ${computed.toFixed(2)}, but statement closing is ${closingBalance.toFixed(2)} (off by ${diff.toFixed(2)}). Spot-check before using.`;
      }
    } else if (entries.length > 0) {
      warning = "Statement opening/closing balances not found — could not verify extraction accuracy. Spot-check before using.";
    }

    return { fileName, bank, entries, openingBalance, closingBalance, warning };
  }

  // Try as PDF document first
  try {
    return await callAI({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: buffer.toString("base64") },
    });
  } catch {
    // Fallback: send extracted text if available
    if (extractedText.replace(/\s/g, "").length >= 100) {
      try {
        return await callAI({
          type: "text",
          text: `Raw text extracted from the bank statement PDF:\n\n${extractedText}`,
        });
      } catch (err2) {
        const msg = err2 instanceof Error ? err2.message : String(err2);
        return { fileName, bank: bankHint || fileName, entries: [], openingBalance: null, closingBalance: null, error: `AI extraction failed: ${msg}` };
      }
    }
    return { fileName, bank: bankHint || fileName, entries: [], openingBalance: null, closingBalance: null, error: `AI extraction failed for ${fileName} and no text layer found.` };
  }
}

function buildXLSX(results: ConvertResult[]): Buffer {
  const wb = XLSX.utils.book_new();

  for (const result of results) {
    if (result.entries.length === 0) continue;

    const sheetData: (string | number)[][] = [
      ["Date", "Description", "Debit", "Credit", "Balance"],
    ];

    for (const e of result.entries) {
      sheetData.push([e.date, e.description, e.debit || "", e.credit || "", e.balance || ""]);
    }

    // Summary rows at the bottom
    sheetData.push([]);
    if (result.openingBalance !== null) sheetData.push(["Opening Balance", "", "", "", result.openingBalance]);
    if (result.closingBalance !== null) sheetData.push(["Closing Balance", "", "", "", result.closingBalance]);
    sheetData.push(["Total Transactions", result.entries.length, "", "", ""]);

    const ws = XLSX.utils.aoa_to_sheet(sheetData);

    // Column widths
    ws["!cols"] = [
      { wch: 14 },  // Date
      { wch: 45 },  // Description
      { wch: 16 },  // Debit
      { wch: 16 },  // Credit
      { wch: 16 },  // Balance
    ];

    // Safe sheet name (max 31 chars, no special chars)
    const sheetName = result.bank.replace(/[:\\/?*[\]]/g, "").substring(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, sheetName || "Statement");
  }

  // If all files failed, add an error sheet
  if (wb.SheetNames.length === 0) {
    const ws = XLSX.utils.aoa_to_sheet([["Error"], ["No transactions could be extracted."]]);
    XLSX.utils.book_append_sheet(wb, ws, "Error");
  }

  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const files = formData.getAll("files") as File[];
    const banks = formData.getAll("banks") as string[];

    if (files.length === 0) {
      return Response.json({ error: "No files uploaded." }, { status: 400 });
    }

    // Convert all files in parallel
    const results = await Promise.all(
      files.map((file, i) => convertFile(file, banks[i] || ""))
    );

    const totalEntries = results.reduce((s, r) => s + r.entries.length, 0);
    const errors = results.filter((r) => r.error).map((r) => r.error!);
    const warnings = results.filter((r) => r.warning).map((r) => `${r.fileName}: ${r.warning}`);

    if (totalEntries === 0) {
      return Response.json({
        error: "No transactions could be extracted from any file.",
        details: errors,
      }, { status: 400 });
    }

    // Build the XLSX
    const xlsxBuffer = buildXLSX(results);
    const fileName = results.length === 1
      ? results[0].bank.replace(/[^a-zA-Z0-9\s-]/g, "").trim() + ".xlsx"
      : "bank-statements.xlsx";

    // Return metadata + base64 XLSX
    return Response.json({
      success: true,
      fileName,
      xlsxBase64: xlsxBuffer.toString("base64"),
      files: results.map((r) => ({
        fileName: r.fileName,
        bank: r.bank,
        count: r.entries.length,
        openingBalance: r.openingBalance,
        closingBalance: r.closingBalance,
        error: r.error,
        warning: r.warning,
      })),
      totalEntries,
      errors,
      warnings,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: `Server error: ${msg}` }, { status: 500 });
  }
}
