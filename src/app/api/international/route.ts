/**
 * POST /api/international — Module 6: International Reconciliation.
 *
 * Universal AI-based parser for international bank statements (UAE, USA, UK, etc.)
 * with multi-currency support. No bank dropdown — AI auto-detects format and currency.
 *
 * FormData:
 *   - bankFiles: one or more bank statement files (PDF/XLS/XLSX/CSV)
 *   - ledgerFile: single journal ledger (XLS/XLSX/CSV/PDF)
 */

export const maxDuration = 300;
export const runtime = "nodejs";

import * as XLSX from "xlsx";
import Anthropic from "@anthropic-ai/sdk";
import { logUsage } from "@/lib/usage-tracker";

type BankEntry = {
  date: string;
  particulars: string;
  debit: number;
  credit: number;
  currency: string;
  source: string;
};

type LedgerEntry = {
  date: string;
  ref: string;
  doc: string;
  desc: string;
  debit: number;
  credit: number;
};

const MONTHS: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
  JANUARY: 1, FEBRUARY: 2, MARCH: 3, APRIL: 4, JUNE: 6,
  JULY: 7, AUGUST: 8, SEPTEMBER: 9, OCTOBER: 10, NOVEMBER: 11, DECEMBER: 12,
};
const pad = (n: number) => String(n).padStart(2, "0");

function parseDate(ddmmyyyy: string): number | null {
  const m = ddmmyyyy.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!m) return null;
  return new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1])).getTime();
}

function normDate(raw: string): string {
  let m = raw.match(/^(\d{1,2})\s+(\w{3,9})\s+(\d{2})$/);
  if (m) { const mo = MONTHS[m[2].toUpperCase()]; if (mo) return `${pad(parseInt(m[1]))}-${pad(mo)}-${2000 + parseInt(m[3])}`; }
  m = raw.match(/^(\d{1,2})-(\w{3,9})-(\d{4})$/);
  if (m) { const mo = MONTHS[m[2].toUpperCase()]; if (mo) return `${pad(parseInt(m[1]))}-${pad(mo)}-${parseInt(m[3])}`; }
  m = raw.match(/^(\d{1,2})-(\w{3,9})-(\d{2})$/);
  if (m) { const mo = MONTHS[m[2].toUpperCase()]; if (mo) return `${pad(parseInt(m[1]))}-${pad(mo)}-${2000 + parseInt(m[3])}`; }
  m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${pad(parseInt(m[1]))}-${pad(parseInt(m[2]))}-${parseInt(m[3])}`;
  m = raw.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (m) return raw;
  m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (m) return `${pad(parseInt(m[1]))}-${pad(parseInt(m[2]))}-${2000 + parseInt(m[3])}`;
  m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = raw.match(/^(\d{1,2})\s+(\w{3,9})\s+(\d{4})$/);
  if (m) { const mo = MONTHS[m[2].toUpperCase()]; if (mo) return `${pad(parseInt(m[1]))}-${pad(mo)}-${parseInt(m[3])}`; }
  // MM/DD/YYYY (US format) — handled by AI prompt normalizing to DD-MM-YYYY
  return raw;
}

/* ═══════════════════════════════════════════
   BLUEPRINT SYSTEM — learn once, parse forever
   ═══════════════════════════════════════════ */
import * as fs from "fs";
import * as path from "path";

interface Blueprint {
  bank: string;
  currency: string;
  dateFormat: string;        // regex pattern the AI identified for dates
  headerKeywords: string[];  // keywords that identify the header row
  columnOrder: string[];     // ordered list: "date", "description", "debit", "credit", "balance", etc.
  amountColumns: { debit: number; credit: number }; // 0-based index among amounts found per line
  skipPatterns: string[];    // regex patterns for rows to skip (totals, headers, balances)
  learnedAt: string;
  sampleCount: number;       // how many transactions the AI found when learning
}

const BLUEPRINTS_PATH = path.join(process.cwd(), "data", "bank-blueprints.json");

function loadBlueprints(): Record<string, Blueprint> {
  try {
    if (fs.existsSync(BLUEPRINTS_PATH)) {
      return JSON.parse(fs.readFileSync(BLUEPRINTS_PATH, "utf-8"));
    }
  } catch { /* corrupted file — start fresh */ }
  return {};
}

function saveBlueprints(blueprints: Record<string, Blueprint>) {
  const dir = path.dirname(BLUEPRINTS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(BLUEPRINTS_PATH, JSON.stringify(blueprints, null, 2), "utf-8");
}

function normalizeBankKey(name: string): string {
  return name.toUpperCase().replace(/[^A-Z0-9]/g, " ").replace(/\s+/g, " ").trim();
}

/* ═══════════════════════════════════════════
   BLUEPRINT-BASED LOCAL PARSER
   ═══════════════════════════════════════════ */
function parseWithBlueprint(text: string, blueprint: Blueprint, fileName: string): BankEntry[] {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const entries: BankEntry[] = [];
  const dateRx = new RegExp(blueprint.dateFormat);
  const skipRxs = blueprint.skipPatterns.map((p) => new RegExp(p, "i"));

  for (const line of lines) {
    // Skip lines matching skip patterns
    if (skipRxs.some((rx) => rx.test(line))) continue;

    // Must contain a date
    const dateMatch = line.match(dateRx);
    if (!dateMatch) continue;
    const rawDate = dateMatch[0];
    const dateStr = normDate(rawDate);
    if (!dateStr || !/\d{2}-\d{2}-\d{4}/.test(dateStr)) continue;

    // Extract all amounts from the line
    const amtMatches = line.match(/[\d,]+\.\d{2}/g);
    if (!amtMatches || amtMatches.length === 0) continue;
    const amounts = amtMatches.map((a) => parseFloat(a.replace(/,/g, ""))).filter((n) => n > 0);
    if (amounts.length === 0) continue;

    // Use blueprint's column mapping to identify debit vs credit
    const drIdx = blueprint.amountColumns.debit;
    const crIdx = blueprint.amountColumns.credit;
    let debit = 0, credit = 0;

    if (drIdx >= 0 && drIdx < amounts.length) debit = amounts[drIdx];
    if (crIdx >= 0 && crIdx < amounts.length) credit = amounts[crIdx];
    if (debit === 0 && credit === 0 && amounts.length > 0) debit = amounts[0];

    // Extract description: text between date and first amount
    const dateEnd = line.indexOf(rawDate) + rawDate.length;
    const firstAmtStr = amtMatches[0];
    const firstAmtPos = line.indexOf(firstAmtStr, dateEnd);
    let desc = line.substring(dateEnd, firstAmtPos > dateEnd ? firstAmtPos : undefined).trim();
    desc = desc.replace(/^[\s,;|-]+|[\s,;|-]+$/g, "").trim();
    if (desc.length < 2) {
      desc = line.substring(dateEnd).replace(/[\d,]+\.\d{2}/g, "").replace(/\s{2,}/g, " ").trim();
    }
    if (desc.length < 2) continue;

    entries.push({
      date: dateStr,
      particulars: desc.substring(0, 80),
      debit,
      credit,
      currency: blueprint.currency,
      source: `${fileName} (${blueprint.bank})`,
    });
  }

  return entries;
}

/* ═══════════════════════════════════════════
   AI EXTRACTION + BLUEPRINT LEARNING
   ═══════════════════════════════════════════ */
const AI_EXTRACT_PROMPT = `Extract ALL transactions from this bank statement. This may be from any country (UAE, USA, UK, Pakistan, etc.) and any currency.

Return a JSON object with this exact structure:
{
  "bank": "<bank name EXACTLY as printed on the statement>",
  "currency": "<3-letter currency code, e.g. AED, USD, GBP, PKR>",
  "blueprint": {
    "dateFormat": "<regex pattern that matches dates in this statement, e.g. \\\\d{2}/\\\\d{2}/\\\\d{4}>",
    "headerKeywords": ["<words from the column header row, e.g. 'Date', 'Description', 'Withdrawal'>"],
    "columnOrder": ["date", "description", "debit", "credit", "balance"],
    "amountColumns": { "debit": 0, "credit": 1 },
    "skipPatterns": ["<regex patterns for rows to skip: totals, headers, balances, e.g. ^Total, ^Opening Balance>"]
  },
  "transactions": [
    {
      "date": "DD-MM-YYYY",
      "description": "<transaction description, max 80 chars>",
      "debit": 0,
      "credit": 0
    }
  ]
}

Rules:
- "bank" must be the EXACT bank name printed on the statement (e.g. "Emirates NBD", "HSBC UK", "Citibank N.A.")
- Date format MUST be DD-MM-YYYY regardless of how the statement prints it.
- For US-format dates (MM/DD/YYYY), convert to DD-MM-YYYY.
- debit = withdrawal/money out, credit = deposit/money in. Exactly one non-zero per row.
- Amounts as plain numbers, no commas, no currency symbols (e.g. 30000.00).
- In the blueprint.amountColumns, "debit" and "credit" are 0-based indices into the amounts found on each transaction line (e.g. if debit is the 1st amount column, index 0; credit is the 2nd, index 1).
- blueprint.dateFormat must be a valid JavaScript regex that matches dates as they appear in the raw extracted text.
- blueprint.skipPatterns must be valid JavaScript regex patterns.
- One transaction = one JSON row, even if description wraps multiple lines.
- Skip opening/closing balance rows, totals, headers — only actual transactions.
- Do not skip any transaction. Accuracy is critical.
- Return ONLY the JSON, no other text.`;

type AIResult = {
  entries: BankEntry[];
  bank: string;
  currency: string;
  error?: string;
  warning?: string;
  usedBlueprint: boolean;
};

async function parseBankPdf(buffer: Buffer, fileName: string): Promise<AIResult> {
  // Step 1: Extract text
  let pdfText = "";
  try {
    const pdfParse = (await import("pdf-parse")).default;
    pdfText = (await pdfParse(buffer)).text ?? "";
  } catch { /* no text layer */ }
  const hasText = pdfText.replace(/\s/g, "").length > 100;

  // Step 2: Check for saved blueprint
  if (hasText) {
    const blueprints = loadBlueprints();
    // Try to match bank name from the first ~30 lines of text
    const headerText = pdfText.split("\n").slice(0, 30).join(" ").toUpperCase();
    for (const [key, bp] of Object.entries(blueprints)) {
      const bankWords = key.split(" ").filter((w) => w.length > 2);
      const matchCount = bankWords.filter((w) => headerText.includes(w)).length;
      if (matchCount >= Math.max(1, bankWords.length * 0.6)) {
        // Found a matching blueprint — try local parse
        const entries = parseWithBlueprint(pdfText, bp, fileName);
        if (entries.length >= 3) {
          return {
            entries,
            bank: bp.bank,
            currency: bp.currency,
            usedBlueprint: true,
            warning: `Used saved blueprint for ${bp.bank} (learned from ${bp.sampleCount} samples). No API credits used.`,
          };
        }
        // Blueprint matched but parsed too few entries — fall through to AI
      }
    }
  }

  // Step 3: Fall back to AI
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { entries: [], bank: fileName, currency: "???", error: "No API key configured and no saved blueprint matches this bank.", usedBlueprint: false };
  }

  const client = new Anthropic({ apiKey });

  async function callAI(block: Anthropic.ContentBlockParam) {
    const response = await client.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 32000,
      messages: [{ role: "user", content: [block, { type: "text", text: AI_EXTRACT_PROMPT }] }],
    }).finalMessage();

    if (response.usage) {
      logUsage("International", "claude-sonnet-4-6", response.usage.input_tokens, response.usage.output_tokens);
    }

    const textBlock = response.content.find((b) => b.type === "text");
    const raw = textBlock && textBlock.type === "text" ? textBlock.text : "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in AI response");
    return JSON.parse(jsonMatch[0]);
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let parsed: any;
    try {
      parsed = await callAI({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: buffer.toString("base64") },
      });
    } catch {
      if (!hasText) throw new Error("PDF has no text layer and document mode failed");
      parsed = await callAI({
        type: "text",
        text: `Raw text from bank statement PDF:\n\n${pdfText}`,
      });
    }

    const bank = parsed.bank || "Unknown Bank";
    const currency = parsed.currency || "???";
    const entries: BankEntry[] = [];

    for (const t of parsed.transactions ?? []) {
      const debit = Number(t.debit) || 0;
      const credit = Number(t.credit) || 0;
      if (debit === 0 && credit === 0) continue;
      entries.push({
        date: normDate(String(t.date ?? "").trim()),
        particulars: String(t.description ?? "").substring(0, 80),
        debit,
        credit,
        currency,
        source: `${fileName} (${bank})`,
      });
    }

    // Step 4: Save blueprint for next time
    if (entries.length > 0 && parsed.blueprint && bank !== "Unknown Bank") {
      try {
        const blueprints = loadBlueprints();
        const key = normalizeBankKey(bank);
        const bp = parsed.blueprint;
        blueprints[key] = {
          bank,
          currency,
          dateFormat: String(bp.dateFormat ?? "\\d{2}[/-]\\d{2}[/-]\\d{4}"),
          headerKeywords: Array.isArray(bp.headerKeywords) ? bp.headerKeywords : [],
          columnOrder: Array.isArray(bp.columnOrder) ? bp.columnOrder : [],
          amountColumns: {
            debit: typeof bp.amountColumns?.debit === "number" ? bp.amountColumns.debit : 0,
            credit: typeof bp.amountColumns?.credit === "number" ? bp.amountColumns.credit : 1,
          },
          skipPatterns: Array.isArray(bp.skipPatterns) ? bp.skipPatterns : [],
          learnedAt: new Date().toISOString(),
          sampleCount: entries.length,
        };
        saveBlueprints(blueprints);
      } catch { /* blueprint save failed — non-fatal */ }
    }

    return { entries, bank, currency, usedBlueprint: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { entries: [], bank: fileName, currency: "???", error: `AI extraction failed for ${fileName}: ${msg}`, usedBlueprint: false };
  }
}

/* ═══════════════════════════════════════════
   EXCEL / CSV BANK PARSING (structured files)
   ═══════════════════════════════════════════ */
function parseBankExcel(buffer: Buffer, fileName: string): { entries: BankEntry[]; bank: string; currency: string; error?: string; warning?: string } {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const entries: BankEntry[] = [];

  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
    if (data.length < 2) continue;

    let dateCol = -1, descCol = -1, debitCol = -1, creditCol = -1;
    let headerIdx = -1;

    for (let i = 0; i < Math.min(15, data.length); i++) {
      const row = data[i];
      if (!row) continue;
      const lower = row.map((c: unknown) => String(c ?? "").toLowerCase());
      const dIdx = lower.findIndex((c: string) => c.includes("date") || c.includes("posting"));
      const mIdx = lower.findIndex((c: string) =>
        c.includes("desc") || c.includes("particular") || c.includes("narration") ||
        c.includes("detail") || c.includes("reference") || c.includes("transaction")
      );
      const drIdx = lower.findIndex((c: string) => c.includes("debit") || c.includes("withdrawal") || c.includes("payment"));
      const crIdx = lower.findIndex((c: string) => c.includes("credit") || c.includes("deposit") || c.includes("receipt"));

      if (dIdx >= 0 && mIdx >= 0 && (drIdx >= 0 || crIdx >= 0)) {
        dateCol = dIdx;
        descCol = mIdx;
        debitCol = drIdx;
        creditCol = crIdx;
        headerIdx = i;
        break;
      }
    }

    if (headerIdx === -1) continue;

    for (let i = headerIdx + 1; i < data.length; i++) {
      const row = data[i];
      if (!row) continue;

      const rawDate = row[dateCol];
      if (!rawDate) continue;
      let dateStr = "";
      if (typeof rawDate === "number") {
        try {
          const d = XLSX.SSF.parse_date_code(rawDate);
          dateStr = `${pad(d.d)}-${pad(d.m)}-${d.y}`;
        } catch { continue; }
      } else {
        dateStr = normDate(String(rawDate).trim());
      }
      if (!dateStr || !/\d/.test(dateStr)) continue;

      const desc = String(row[descCol] ?? "").trim();
      if (!desc) continue;

      const dr = debitCol >= 0 ? (parseFloat(String(row[debitCol] ?? "0").replace(/,/g, "")) || 0) : 0;
      const cr = creditCol >= 0 ? (parseFloat(String(row[creditCol] ?? "0").replace(/,/g, "")) || 0) : 0;
      if (dr === 0 && cr === 0) continue;

      entries.push({
        date: dateStr,
        particulars: desc.substring(0, 80),
        debit: dr,
        credit: cr,
        currency: "???",
        source: fileName,
      });
    }
  }

  return { entries, bank: "Excel Import", currency: "???" };
}

function parseBankCSV(text: string, fileName: string): { entries: BankEntry[]; bank: string; currency: string; error?: string; warning?: string } {
  const lines = text.split("\n");
  const entries: BankEntry[] = [];
  let headerIdx = -1;
  let dateCol = -1, descCol = -1, debitCol = -1, creditCol = -1;

  for (let i = 0; i < lines.length; i++) {
    const cells = lines[i].split(",").map((c) => c.trim().replace(/^"|"$/g, "").toLowerCase());
    if (headerIdx === -1) {
      dateCol = cells.findIndex((c) => c.includes("date"));
      descCol = cells.findIndex((c) => c.includes("desc") || c.includes("particular") || c.includes("narration"));
      debitCol = cells.findIndex((c) => c.includes("debit") || c.includes("withdrawal"));
      creditCol = cells.findIndex((c) => c.includes("credit") || c.includes("deposit"));
      if (dateCol >= 0 && descCol >= 0 && (debitCol >= 0 || creditCol >= 0)) {
        headerIdx = i;
      }
      continue;
    }

    const cells2 = lines[i].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    const dateStr = normDate(cells2[dateCol]?.trim() ?? "");
    const desc = cells2[descCol]?.trim();
    if (!dateStr || !desc) continue;

    const dr = debitCol >= 0 ? (parseFloat(cells2[debitCol]?.replace(/,/g, "") ?? "0") || 0) : 0;
    const cr = creditCol >= 0 ? (parseFloat(cells2[creditCol]?.replace(/,/g, "") ?? "0") || 0) : 0;
    if (dr === 0 && cr === 0) continue;

    entries.push({ date: dateStr, particulars: desc.substring(0, 80), debit: dr, credit: cr, currency: "???", source: fileName });
  }

  return { entries, bank: "CSV Import", currency: "???" };
}

/* ═══════════════════════════════════════════
   LEDGER PARSERS (same as Module 4)
   ═══════════════════════════════════════════ */
function parseLedgerExcel(buffer: Buffer): LedgerEntry[] {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const entries: LedgerEntry[] = [];

  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
    if (data.length < 2) continue;

    let dateCol = -1, refCol = -1, docCol = -1, descCol = -1, debitCol = -1, creditCol = -1;
    let headerIdx = -1;

    for (let i = 0; i < Math.min(15, data.length); i++) {
      const row = data[i];
      if (!row) continue;
      const lower = row.map((c: unknown) => String(c ?? "").toLowerCase());
      const dIdx = lower.findIndex((c: string) => c.includes("date") || c.includes("posting"));
      const mIdx = lower.findIndex((c: string) =>
        c.includes("desc") || c.includes("particular") || c.includes("narration") || c.includes("detail")
      );
      const drIdx = lower.findIndex((c: string) => c.includes("debit") || c.includes("withdrawal"));
      const crIdx = lower.findIndex((c: string) => c.includes("credit") || c.includes("deposit"));

      if (dIdx >= 0 && mIdx >= 0 && (drIdx >= 0 || crIdx >= 0)) {
        dateCol = dIdx;
        descCol = mIdx;
        debitCol = drIdx;
        creditCol = crIdx;
        refCol = lower.findIndex((c: string) => c.includes("ref") || c.includes("voucher") || c.includes("vch"));
        docCol = lower.findIndex((c: string) => c.includes("doc") || c.includes("cheque") || c.includes("instrument"));
        headerIdx = i;
        break;
      }
    }

    if (headerIdx === -1) continue;

    for (let i = headerIdx + 1; i < data.length; i++) {
      const row = data[i];
      if (!row) continue;

      const rawDate = row[dateCol];
      if (!rawDate) continue;
      let dateStr = "";
      if (typeof rawDate === "number") {
        try {
          const d = XLSX.SSF.parse_date_code(rawDate);
          dateStr = `${pad(d.d)}-${pad(d.m)}-${d.y}`;
        } catch { continue; }
      } else {
        dateStr = normDate(String(rawDate).trim());
      }
      if (!dateStr || !/\d/.test(dateStr)) continue;

      const desc = String(row[descCol] ?? "").trim();
      const dr = debitCol >= 0 ? (parseFloat(String(row[debitCol] ?? "0").replace(/,/g, "")) || 0) : 0;
      const cr = creditCol >= 0 ? (parseFloat(String(row[creditCol] ?? "0").replace(/,/g, "")) || 0) : 0;
      if (dr === 0 && cr === 0) continue;

      entries.push({
        date: dateStr,
        ref: refCol >= 0 ? String(row[refCol] ?? "").trim() : "",
        doc: docCol >= 0 ? String(row[docCol] ?? "").trim() : "",
        desc,
        debit: dr,
        credit: cr,
      });
    }
  }

  return entries;
}

function parseLedgerCSV(text: string): LedgerEntry[] {
  const lines = text.split("\n");
  const entries: LedgerEntry[] = [];
  let headerIdx = -1;
  let dateCol = -1, refCol = -1, docCol = -1, descCol = -1, debitCol = -1, creditCol = -1;

  for (let i = 0; i < lines.length; i++) {
    const cells = lines[i].split(",").map((c) => c.trim().replace(/^"|"$/g, "").toLowerCase());
    if (headerIdx === -1) {
      dateCol = cells.findIndex((c) => c.includes("date"));
      descCol = cells.findIndex((c) => c.includes("desc") || c.includes("particular"));
      debitCol = cells.findIndex((c) => c.includes("debit"));
      creditCol = cells.findIndex((c) => c.includes("credit"));
      refCol = cells.findIndex((c) => c.includes("ref") || c.includes("voucher"));
      docCol = cells.findIndex((c) => c.includes("doc") || c.includes("cheque"));
      if (dateCol >= 0 && descCol >= 0 && (debitCol >= 0 || creditCol >= 0)) {
        headerIdx = i;
      }
      continue;
    }

    const cells2 = lines[i].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    const dateStr = normDate(cells2[dateCol]?.trim() ?? "");
    const desc = cells2[descCol]?.trim();
    if (!dateStr || !desc) continue;

    const dr = debitCol >= 0 ? (parseFloat(cells2[debitCol]?.replace(/,/g, "") ?? "0") || 0) : 0;
    const cr = creditCol >= 0 ? (parseFloat(cells2[creditCol]?.replace(/,/g, "") ?? "0") || 0) : 0;
    if (dr === 0 && cr === 0) continue;

    entries.push({
      date: dateStr,
      ref: refCol >= 0 ? (cells2[refCol]?.trim() ?? "") : "",
      doc: docCol >= 0 ? (cells2[docCol]?.trim() ?? "") : "",
      desc,
      debit: dr,
      credit: cr,
    });
  }

  return entries;
}

function parseTallyLedger(text: string): LedgerEntry[] {
  const DATE_PREFIX_RX = /^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})(.*)/;
  const AMT_RX = /^[\d,]+\.\d{2}$/;
  const DOUBLE_AMT_RX = /([\d,]+\.\d{2})([\d,]+\.\d{2})/;
  const SUB_DETAIL_RX = /[\d,]+\.\d{2}\s*(Dr|Cr)\s*$/;
  const VCH_NO_RX = /^\d+\/[\w-]+$/;
  const VCH_TYPES = new Set([
    "Bank Payment", "Bank Receipt Voucher", "Bank Receipt",
    "Journal", "Receipt", "Contra",
  ]);
  const SKIP_STARTS = [
    "Carried Over", "Brought Forward", "Closing Balance", "Opening Balance", "Page ",
  ];
  const HEADER_RX = /^(\d{1,2}-[A-Za-z]{3}-\d+\s+to\s+\d{1,2}-[A-Za-z]{3}-\d+|Date\s*Particulars|Credit\s*Debit|Vch No|Vch Type)/i;

  const entries: LedgerEntry[] = [];
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  let currentDate = "";
  let entryDir: "By" | "To" | null = null;
  let descParts: string[] = [];
  let amount = 0;
  let vchno = "";
  let entryDate = "";

  function commitEntry() {
    if (entryDir && amount > 0 && descParts.length > 0) {
      entries.push({
        date: entryDate,
        ref: vchno,
        doc: vchno,
        desc: descParts.join(" ").trim().substring(0, 80),
        debit: entryDir === "To" ? amount : 0,
        credit: entryDir === "By" ? amount : 0,
      });
    }
    entryDir = null;
    descParts = [];
    amount = 0;
    vchno = "";
  }

  for (const line of lines) {
    if (SUB_DETAIL_RX.test(line)) continue;
    if (DOUBLE_AMT_RX.test(line.replace(/\s/g, ""))) continue;
    if (SKIP_STARTS.some((s) => line.startsWith(s))) {
      entryDir = null; descParts = []; amount = 0; vchno = "";
      continue;
    }
    if (HEADER_RX.test(line)) continue;

    const dpM = line.match(DATE_PREFIX_RX);
    if (dpM) {
      const d = parseInt(dpM[1]);
      const mon = MONTHS[dpM[2].toUpperCase()];
      const y = dpM[3].length === 2 ? 2000 + parseInt(dpM[3]) : parseInt(dpM[3]);
      if (mon) {
        currentDate = `${pad(d)}-${pad(mon)}-${y}`;
        const rest = dpM[4].trim();
        if (rest === "By" || rest === "To") {
          commitEntry();
          entryDir = rest as "By" | "To";
          entryDate = currentDate;
        }
      }
      continue;
    }

    if (line === "By" || line === "To") {
      commitEntry();
      entryDir = line as "By" | "To";
      entryDate = currentDate;
      continue;
    }

    if (VCH_TYPES.has(line)) {
      commitEntry();
      continue;
    }

    if (VCH_NO_RX.test(line)) {
      if (entryDir && !vchno) vchno = line;
      continue;
    }

    if (AMT_RX.test(line)) {
      if (entryDir && amount === 0) amount = parseFloat(line.replace(/,/g, ""));
      continue;
    }

    if (entryDir && line !== "0.00") descParts.push(line);
  }

  commitEntry();
  return entries;
}

/* ═══════════════════════════════════════════
   MATCHING LOGIC
   ═══════════════════════════════════════════ */
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
  for (const r of bankEntries) { const k = key(r.debit || r.credit); const c = lfc.get(k) || 0; if (c > 0) lfc.set(k, c - 1); else bankMissing++; }
  let ledgerMissing = 0;
  const bfc = new Map(bankFreq);
  for (const r of ledgerEntries) { const k = key(r.debit || r.credit); const c = bfc.get(k) || 0; if (c > 0) bfc.set(k, c - 1); else ledgerMissing++; }
  return { bankMissing, ledgerMissing };
}

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
          const lgMs = parseDate(lg.date);
          if (bkMs && lgMs) { const d = Math.abs(bkMs - lgMs); if (d < bestDelta) { bestDelta = d; bestIdx = lg.idx; } }
          else { bestIdx = lg.idx; break; }
        } else if (maxDays === 0) {
          if (bk.date === lg.date) { bestIdx = lg.idx; break; }
        } else {
          const lgMs = parseDate(lg.date);
          if (bkMs && lgMs) { const d = Math.abs(bkMs - lgMs); if (d <= maxDays * 86400000 && d < bestDelta) { bestDelta = d; bestIdx = lg.idx; } }
        }
      }
      if (bestIdx >= 0) { pairs.push({ bankIdx: bk.idx, ledgerIdx: bestIdx }); usedBank.add(bk.idx); usedLedger.add(bestIdx); }
    }
  }
  pass(0); pass(3); pass(7); pass(null);
  return pairs;
}

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
  const allKeys = new Set([...bankGroups.keys(), ...ledgerGroups.keys()]);

  for (const k of allKeys) {
    const bList = bankGroups.get(k) ?? [];
    const lList = ledgerGroups.get(k) ?? [];
    if (bList.length === lList.length) continue;

    if (bList.length > lList.length) {
      if (lList.length === 0) { for (const b of bList) bankMissing.push(b.entry); continue; }
      const paired = pairByDate(
        bList.map((b) => ({ idx: b.idx, date: b.entry.date })),
        lList.map((l) => ({ idx: l.idx, date: l.entry.date })),
      );
      const pairedBankIdxs = new Set(paired.map((p) => p.bankIdx));
      for (const b of bList) if (!pairedBankIdxs.has(b.idx)) bankMissing.push(b.entry);
    } else {
      if (bList.length === 0) { for (const l of lList) ledgerMissing.push(l.entry); continue; }
      const paired = pairByDate(
        bList.map((b) => ({ idx: b.idx, date: b.entry.date })),
        lList.map((l) => ({ idx: l.idx, date: l.entry.date })),
      );
      const pairedLedgerIdxs = new Set(paired.map((p) => p.ledgerIdx));
      for (const l of lList) if (!pairedLedgerIdxs.has(l.idx)) ledgerMissing.push(l.entry);
    }
  }
  return { bankUnresolved: bankMissing, ledgerUnresolved: ledgerMissing };
}

const fmt = (n: number) =>
  n === 0 ? "" : n.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ═══════════════════════════════════════════
   ENDPOINT
   ═══════════════════════════════════════════ */
export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const bankFiles = formData.getAll("bankFiles") as File[];
    const ledgerFile = formData.get("ledgerFile") as File | null;

    if (bankFiles.length === 0 || !ledgerFile) {
      return Response.json({ error: "At least one bank statement and a ledger file are required." }, { status: 400 });
    }

    const allBankEntries: BankEntry[] = [];
    const bankSources: { name: string; bank: string; currency: string; count: number; error?: string }[] = [];
    const warnings: string[] = [];
    const currencies = new Set<string>();

    const results = await Promise.all(
      bankFiles.map(async (file) => {
        const ext = file.name.toLowerCase().split(".").pop() ?? "";
        const buffer = Buffer.from(await file.arrayBuffer());

        if (ext === "pdf") {
          return parseBankPdf(buffer, file.name);
        } else if (ext === "xls" || ext === "xlsx") {
          return parseBankExcel(buffer, file.name);
        } else if (ext === "csv") {
          return parseBankCSV(buffer.toString("utf-8"), file.name);
        } else {
          return { entries: [] as BankEntry[], bank: file.name, currency: "???", error: `Unsupported format: .${ext}` };
        }
      })
    );

    for (let i = 0; i < bankFiles.length; i++) {
      const result = results[i];
      bankSources.push({
        name: bankFiles[i].name,
        bank: result.bank,
        currency: result.currency,
        count: result.entries.length,
        error: result.error,
      });
      if (result.error) warnings.push(result.error);
      if (result.warning) warnings.push(result.warning);
      if (result.currency && result.currency !== "???") currencies.add(result.currency);
      allBankEntries.push(...result.entries);
    }

    if (allBankEntries.length === 0) {
      return Response.json({ error: "No transactions extracted from any bank statement.", warnings }, { status: 400 });
    }

    // Parse ledger
    const ledgerBuffer = Buffer.from(await ledgerFile.arrayBuffer());
    const ext = ledgerFile.name.toLowerCase().split(".").pop() ?? "";
    let ledgerEntries: LedgerEntry[];
    if (ext === "csv") {
      ledgerEntries = parseLedgerCSV(ledgerBuffer.toString("utf-8"));
    } else if (ext === "xls" || ext === "xlsx") {
      ledgerEntries = parseLedgerExcel(ledgerBuffer);
    } else if (ext === "pdf") {
      try {
        const pdfParse = (await import("pdf-parse")).default;
        const extracted = await pdfParse(ledgerBuffer);
        ledgerEntries = parseTallyLedger(extracted.text ?? "");
        if (ledgerEntries.length === 0) {
          return Response.json({ error: "No entries found in ledger PDF." }, { status: 400 });
        }
      } catch {
        return Response.json({ error: "Could not extract text from ledger PDF." }, { status: 400 });
      }
    } else {
      return Response.json({ error: "Ledger must be .xls, .xlsx, .csv, or .pdf" }, { status: 400 });
    }

    if (ledgerEntries.length === 0) {
      return Response.json({ error: "No entries found in ledger." }, { status: 400 });
    }

    const m2 = amountOnlyCount(allBankEntries, ledgerEntries);
    const { bankUnresolved, ledgerUnresolved } = dateAwareMatch(allBankEntries, ledgerEntries);

    const resolvedFromBank = m2.bankMissing - bankUnresolved.length;
    const resolvedFromLedger = m2.ledgerMissing - ledgerUnresolved.length;

    return Response.json({
      bankTotal: allBankEntries.length,
      ledgerTotal: ledgerEntries.length,
      bankSources,
      currencies: Array.from(currencies),
      warnings,
      module2BankMissing: m2.bankMissing,
      module2LedgerMissing: m2.ledgerMissing,
      resolvedCount: resolvedFromBank + resolvedFromLedger,
      bankUnresolved: bankUnresolved.map((r) => ({
        date: r.date,
        particulars: r.particulars,
        debit: r.debit,
        credit: r.credit,
        currency: r.currency,
        source: r.source,
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
