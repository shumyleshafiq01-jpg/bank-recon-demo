import Anthropic from "@anthropic-ai/sdk";
import * as XLSX from "xlsx";

/* ═══════════════════════════════════════════
   PDF WITH PASSWORD SUPPORT
   ═══════════════════════════════════════════ */
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

/* ═══════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════ */
interface Transaction {
  id: string;
  date: string;
  merchant: string;
  amount: number;
  type: "debit" | "credit";
}

interface StatementMeta {
  cardholderName: string;
  cardLast4: string;
  statementMonth: string;
  paymentDueDate: string;
  previousBalance: number | null;
  purchases: number | null;
  feeAndCharges: number | null;
  payments: number | null;
  currentBalance: number | null;
  minimumAmountDue: number | null;
}

interface GroupedHeader {
  header: string;
  total: number;
  count: number;
  transactions: Transaction[];
}

/* ═══════════════════════════════════════════
   MERCHANT NORMALIZATION
   ═══════════════════════════════════════════ */
const MERCHANT_ALIASES: Record<string, string> = {
  "TOTAL PARCO": "Fuel — Total Parco",
  "PARCO": "Fuel — Total Parco",
  "PSO": "Fuel — PSO",
  "SHELL": "Fuel — Shell",
  "BASKIN": "Dining — Baskin Robbins",
  "BASKIN ROBBINS": "Dining — Baskin Robbins",
  "MCDONALD": "Dining — McDonald's",
  "KFC": "Dining — KFC",
  "PIZZA HUT": "Dining — Pizza Hut",
  "DOMINO": "Dining — Domino's",
  "FOODPANDA": "Dining — Foodpanda",
  "CAREEM": "Transport — Careem",
  "UBER": "Transport — Uber",
  "DARAZ": "Shopping — Daraz",
  "AMAZON": "Shopping — Amazon",
};

function normalizemerchant(raw: string): string {
  const up = raw.toUpperCase().trim();
  for (const [key, label] of Object.entries(MERCHANT_ALIASES)) {
    if (up.includes(key)) return label;
  }
  // Clean up common suffixes and prefixes
  let cleaned = raw
    .replace(/\b(POS|PURCHASE|TXN|TRANSACTION|PK|PAK)\b/gi, "")
    .replace(/\d{4,}/g, "") // remove long numbers (card refs, terminal IDs)
    .replace(/[*#]+/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (cleaned.length < 3) cleaned = raw.trim();
  // Title case
  return cleaned.replace(/\w\S*/g, (t) => t.charAt(0).toUpperCase() + t.substring(1).toLowerCase());
}

/* ═══════════════════════════════════════════
   EXCEL / CSV PARSER
   ═══════════════════════════════════════════ */
const pad = (n: number) => String(n).padStart(2, "0");

function extractMetaFromRows(rows: unknown[][]): StatementMeta {
  const meta: StatementMeta = { cardholderName: "", cardLast4: "", statementMonth: "", paymentDueDate: "", previousBalance: null, purchases: null, feeAndCharges: null, payments: null, currentBalance: null, minimumAmountDue: null };
  for (let i = 0; i < Math.min(15, rows.length); i++) {
    const cell = String(rows[i]?.[0] ?? "").trim();
    if (!cell) continue;

    if (/credit\s*card\s*#\s*\d+/i.test(cell)) {
      const m = cell.match(/(\d{4})\s*$/);
      if (m) meta.cardLast4 = m[1];
    } else if (/^month\s+of\s+/i.test(cell)) {
      meta.statementMonth = cell.replace(/^month\s+of\s+/i, "").trim();
    } else if (/payment\s*due\s*date/i.test(cell)) {
      const m = cell.match(/:\s*(.+)$/);
      if (m) meta.paymentDueDate = m[1].trim();
    } else if (i === 0 && !cell.includes("#") && /^[A-Za-z ]+$/.test(cell) && cell.length > 3) {
      meta.cardholderName = cell;
    }
  }
  return meta;
}

function parseExcel(buffer: Buffer): { transactions: Transaction[]; meta: StatementMeta } {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const transactions: Transaction[] = [];
  let meta: StatementMeta = { cardholderName: "", cardLast4: "", statementMonth: "", paymentDueDate: "", previousBalance: null, purchases: null, feeAndCharges: null, payments: null, currentBalance: null, minimumAmountDue: null };
  let idCounter = 1;

  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
    if (data.length < 2) continue;

    const sheetMeta = extractMetaFromRows(data);
    if (sheetMeta.cardholderName || sheetMeta.cardLast4) meta = sheetMeta;

    // Find header row
    let dateCol = -1, descCol = -1, amtCol = -1, debitCol = -1, creditCol = -1;
    let headerIdx = -1;

    for (let i = 0; i < Math.min(15, data.length); i++) {
      const row = data[i];
      if (!row) continue;
      const lower = row.map((c: unknown) => String(c ?? "").toLowerCase());
      const dIdx = lower.findIndex((c: string) => c.includes("date") || c.includes("posting"));
      const mIdx = lower.findIndex((c: string) =>
        c.includes("desc") || c.includes("particular") || c.includes("narration") ||
        c.includes("merchant") || c.includes("detail") || c.includes("transaction")
      );
      const aIdx = lower.findIndex((c: string) => c === "amount" || c.includes("amount"));
      const drIdx = lower.findIndex((c: string) => c.includes("debit") || c.includes("withdrawal") || c.includes("purchase"));
      const crIdx = lower.findIndex((c: string) => c.includes("credit") || c.includes("payment") || c.includes("refund"));

      if (dIdx >= 0 && mIdx >= 0 && (aIdx >= 0 || drIdx >= 0)) {
        dateCol = dIdx;
        descCol = mIdx;
        amtCol = aIdx;
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

      // Parse date
      const rawDate = row[dateCol];
      if (!rawDate) continue;
      let dateStr = "";
      if (typeof rawDate === "number") {
        try {
          const d = XLSX.SSF.parse_date_code(rawDate);
          dateStr = `${pad(d.d)}-${pad(d.m)}-${d.y}`;
        } catch { continue; }
      } else {
        dateStr = String(rawDate).trim();
      }
      if (!dateStr) continue;

      // Parse merchant/description
      const merchant = String(row[descCol] ?? "").trim();
      if (!merchant) continue;

      // Parse amount
      let amount = 0;
      let type: "debit" | "credit" = "debit";

      if (debitCol >= 0 && creditCol >= 0) {
        const dr = parseFloat(String(row[debitCol] ?? "0").replace(/,/g, "")) || 0;
        const cr = parseFloat(String(row[creditCol] ?? "0").replace(/,/g, "")) || 0;
        if (dr > 0) { amount = dr; type = "debit"; }
        else if (cr > 0) { amount = cr; type = "credit"; }
        else continue;
      } else if (amtCol >= 0) {
        const raw = parseFloat(String(row[amtCol] ?? "0").replace(/,/g, "")) || 0;
        if (raw === 0) continue;
        amount = Math.abs(raw);
        type = raw < 0 ? "credit" : "debit";
      } else continue;

      transactions.push({
        id: `TXN-${String(idCounter++).padStart(3, "0")}`,
        date: dateStr,
        merchant,
        amount,
        type,
      });
    }
  }

  return { transactions, meta };
}

function parseCSV(text: string): Transaction[] {
  const lines = text.split("\n");
  const transactions: Transaction[] = [];
  let idCounter = 1;
  let headerIdx = -1;
  let dateCol = -1, descCol = -1, amtCol = -1, debitCol = -1, creditCol = -1;

  for (let i = 0; i < lines.length; i++) {
    const cells = lines[i].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    if (headerIdx === -1) {
      const lower = cells.map((c) => c.toLowerCase());
      dateCol = lower.findIndex((c) => c.includes("date"));
      descCol = lower.findIndex((c) => c.includes("desc") || c.includes("merchant") || c.includes("particular"));
      amtCol = lower.findIndex((c) => c === "amount" || c.includes("amount"));
      debitCol = lower.findIndex((c) => c.includes("debit"));
      creditCol = lower.findIndex((c) => c.includes("credit"));
      if (dateCol >= 0 && descCol >= 0 && (amtCol >= 0 || debitCol >= 0)) {
        headerIdx = i;
      }
      continue;
    }

    const cells2 = lines[i].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    const dateStr = cells2[dateCol]?.trim();
    const merchant = cells2[descCol]?.trim();
    if (!dateStr || !merchant) continue;

    let amount = 0;
    let type: "debit" | "credit" = "debit";
    if (debitCol >= 0 && creditCol >= 0) {
      const dr = parseFloat(String(cells2[debitCol] ?? "0").replace(/,/g, "")) || 0;
      const cr = parseFloat(String(cells2[creditCol] ?? "0").replace(/,/g, "")) || 0;
      if (dr > 0) { amount = dr; type = "debit"; }
      else if (cr > 0) { amount = cr; type = "credit"; }
      else continue;
    } else if (amtCol >= 0) {
      const raw = parseFloat(String(cells2[amtCol] ?? "0").replace(/,/g, "")) || 0;
      if (raw === 0) continue;
      amount = Math.abs(raw);
      type = raw < 0 ? "credit" : "debit";
    } else continue;

    transactions.push({
      id: `TXN-${String(idCounter++).padStart(3, "0")}`,
      date: dateStr,
      merchant,
      amount,
      type,
    });
  }

  return transactions;
}

/* ═══════════════════════════════════════════
   AI PDF EXTRACTION
   ═══════════════════════════════════════════ */
async function aiExtractTransactions(buffer: Buffer, fileName: string, password?: string): Promise<{ transactions: Transaction[]; meta?: StatementMeta; error?: string; passwordRequired?: boolean }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { transactions: [], error: `${fileName} needs AI extraction but no API key is configured.` };
  }

  const client = new Anthropic({ apiKey });

  const { text: pdfText, needsPassword } = await extractPdfText(buffer, password);
  if (needsPassword) {
    return { transactions: [], error: `${fileName} is password-protected. Please enter the password.`, passwordRequired: true };
  }

  const hasText = pdfText.replace(/\s/g, "").length > 100;

  try {
    const content: Anthropic.ContentBlockParam[] = hasText
      ? [{ type: "text", text: `Credit card statement text (columns may be fused):\n\n${pdfText}` }]
      : [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: buffer.toString("base64") } }];

    content.push({
      type: "text",
      text: `Extract ALL transactions AND statement metadata from this credit card statement.
Return a JSON object with this exact structure:
{
  "meta": {
    "cardholderName": "Full Name as printed on statement",
    "cardLast4": "1234",
    "statementMonth": "JUN-2026",
    "paymentDueDate": "26-JUL-2026",
    "previousBalance": 269194.84,
    "purchases": 197103.73,
    "feeAndCharges": 1288.87,
    "payments": 269195.00,
    "currentBalance": 198392.44,
    "minimumAmountDue": 3249.00
  },
  "transactions": [
    { "date": "DD-MM-YYYY", "merchant": "Merchant Name", "amount": 1234.56, "type": "debit" }
  ]
}
- "meta.cardholderName": the account/cardholder name shown on the statement
- "meta.cardLast4": the last 4 digits of the credit card number
- "meta.statementMonth": the billing month in MMM-YYYY format (e.g. DEC-2025)
- "meta.paymentDueDate": the payment due date in DD-MMM-YYYY format (e.g. 26-JAN-2026)
- "meta.previousBalance": the previous balance / opening balance from the account summary
- "meta.purchases": total purchases amount from the account summary
- "meta.feeAndCharges": total fee and charges from the account summary
- "meta.payments": total payments made from the account summary
- "meta.currentBalance": the current balance from the account summary
- "meta.minimumAmountDue": the minimum amount due from the account summary
- All amounts must be positive numbers (or 0)
- "type" is "debit" for purchases/charges, "credit" for payments/refunds
- Amount must always be positive
- Include every single transaction, do not skip any
- Return ONLY the JSON, no other text`,
    });

    const response = await client.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 16000,
      messages: [{ role: "user", content }],
    }).finalMessage();

    const textBlock = response.content.find((b) => b.type === "text");
    const raw = textBlock && textBlock.type === "text" ? textBlock.text : "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { transactions: [], error: `Could not extract transactions from ${fileName}.` };
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      meta?: { cardholderName?: string; cardLast4?: string; statementMonth?: string; paymentDueDate?: string };
      transactions?: { date: string; merchant: string; amount: number; type?: string }[];
    };

    const toNum = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
    const meta: StatementMeta = {
      cardholderName: String(parsed.meta?.cardholderName ?? "").trim(),
      cardLast4: String(parsed.meta?.cardLast4 ?? "").trim(),
      statementMonth: String(parsed.meta?.statementMonth ?? "").trim(),
      paymentDueDate: String(parsed.meta?.paymentDueDate ?? "").trim(),
      previousBalance: toNum(parsed.meta?.previousBalance),
      purchases: toNum(parsed.meta?.purchases),
      feeAndCharges: toNum(parsed.meta?.feeAndCharges),
      payments: toNum(parsed.meta?.payments),
      currentBalance: toNum(parsed.meta?.currentBalance),
      minimumAmountDue: toNum(parsed.meta?.minimumAmountDue),
    };

    let idCounter = 1;
    const transactions: Transaction[] = [];
    for (const t of parsed.transactions ?? []) {
      const amount = Number(t.amount) || 0;
      if (amount === 0) continue;
      transactions.push({
        id: `TXN-${String(idCounter++).padStart(3, "0")}`,
        date: String(t.date ?? "").trim(),
        merchant: String(t.merchant ?? "").trim(),
        amount: Math.abs(amount),
        type: t.type === "credit" ? "credit" : "debit",
      });
    }

    return { transactions, meta };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { transactions: [], error: `AI extraction failed for ${fileName}: ${msg}` };
  }
}

/* ═══════════════════════════════════════════
   GROUP BY MERCHANT
   ═══════════════════════════════════════════ */
function groupTransactions(transactions: Transaction[]): GroupedHeader[] {
  const groups = new Map<string, Transaction[]>();

  for (const txn of transactions) {
    const header = normalizemerchant(txn.merchant);
    const list = groups.get(header) ?? [];
    list.push(txn);
    groups.set(header, list);
  }

  const result: GroupedHeader[] = [];
  for (const [header, txns] of groups) {
    result.push({
      header,
      total: txns.reduce((s, t) => s + (t.type === "debit" ? t.amount : -t.amount), 0),
      count: txns.length,
      transactions: txns.sort((a, b) => a.date.localeCompare(b.date)),
    });
  }

  // Sort by total descending (biggest spend first)
  result.sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
  return result;
}

/* ═══════════════════════════════════════════
   FORMAT HELPERS
   ═══════════════════════════════════════════ */
const fmt = (n: number) =>
  n === 0 ? "" : n.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ═══════════════════════════════════════════
   ENDPOINT
   ═══════════════════════════════════════════ */
export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("statementFile") as File | null;
    const password = (formData.get("password") as string) || undefined;

    if (!file) {
      return Response.json({ error: "Please upload a credit card statement." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.name.toLowerCase().split(".").pop() ?? "";

    let transactions: Transaction[] = [];
    let meta: StatementMeta = { cardholderName: "", cardLast4: "", statementMonth: "", paymentDueDate: "", previousBalance: null, purchases: null, feeAndCharges: null, payments: null, currentBalance: null, minimumAmountDue: null };
    let extractionWarning: string | undefined;

    if (ext === "csv") {
      transactions = parseCSV(buffer.toString("utf-8"));
    } else if (ext === "xls" || ext === "xlsx") {
      const result = parseExcel(buffer);
      transactions = result.transactions;
      meta = result.meta;
    } else if (ext === "pdf") {
      const result = await aiExtractTransactions(buffer, file.name, password);
      if (result.passwordRequired) {
        return Response.json({ passwordRequired: true, fileName: file.name }, { status: 200 });
      }
      transactions = result.transactions;
      if (result.meta) meta = result.meta;
      if (result.error) extractionWarning = result.error;
    } else {
      return Response.json({ error: `Unsupported file format: .${ext}. Use PDF, XLS, XLSX, or CSV.` }, { status: 400 });
    }

    if (transactions.length === 0 && !extractionWarning) {
      return Response.json({ error: "No transactions found in the uploaded file." }, { status: 400 });
    }

    const grouped = groupTransactions(transactions);
    const totalSpend = transactions.filter((t) => t.type === "debit").reduce((s, t) => s + t.amount, 0);
    const totalPayments = transactions.filter((t) => t.type === "credit").reduce((s, t) => s + t.amount, 0);

    return Response.json({
      transactionCount: transactions.length,
      groupCount: grouped.length,
      totalSpend: fmt(totalSpend),
      totalPayments: fmt(totalPayments),
      netAmount: fmt(totalSpend - totalPayments),
      meta,
      groups: grouped.map((g) => ({
        header: g.header,
        total: fmt(Math.abs(g.total)),
        totalRaw: g.total,
        count: g.count,
        transactions: g.transactions.map((t) => ({
          id: t.id,
          date: t.date,
          merchant: t.merchant,
          amount: fmt(t.amount),
          amountRaw: t.amount,
          type: t.type,
        })),
      })),
      warning: extractionWarning,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: `Server error: ${msg}` }, { status: 500 });
  }
}
