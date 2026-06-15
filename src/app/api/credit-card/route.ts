import Anthropic from "@anthropic-ai/sdk";
import * as XLSX from "xlsx";

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

function parseExcel(buffer: Buffer): Transaction[] {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const transactions: Transaction[] = [];
  let idCounter = 1;

  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
    if (data.length < 2) continue;

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

  return transactions;
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
async function aiExtractTransactions(buffer: Buffer, fileName: string): Promise<{ transactions: Transaction[]; error?: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { transactions: [], error: `${fileName} needs AI extraction but no API key is configured.` };
  }

  const client = new Anthropic({ apiKey });

  // Try with extracted text first for text-based PDFs
  let pdfText = "";
  try {
    const pdfParse = (await import("pdf-parse")).default;
    const extracted = await pdfParse(buffer);
    pdfText = extracted.text ?? "";
  } catch { /* ignore */ }

  const hasText = pdfText.replace(/\s/g, "").length > 100;

  try {
    const content: Anthropic.ContentBlockParam[] = hasText
      ? [{ type: "text", text: `Credit card statement text (columns may be fused):\n\n${pdfText}` }]
      : [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: buffer.toString("base64") } }];

    content.push({
      type: "text",
      text: `Extract ALL transactions from this credit card statement.
Return a JSON object with this exact structure:
{
  "transactions": [
    { "date": "DD-MM-YYYY", "merchant": "Merchant Name", "amount": 1234.56, "type": "debit" }
  ]
}
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
      transactions?: { date: string; merchant: string; amount: number; type?: string }[];
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

    return { transactions };
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

    if (!file) {
      return Response.json({ error: "Please upload a credit card statement." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.name.toLowerCase().split(".").pop() ?? "";

    let transactions: Transaction[] = [];
    let extractionWarning: string | undefined;

    if (ext === "csv") {
      transactions = parseCSV(buffer.toString("utf-8"));
    } else if (ext === "xls" || ext === "xlsx") {
      transactions = parseExcel(buffer);
    } else if (ext === "pdf") {
      const result = await aiExtractTransactions(buffer, file.name);
      transactions = result.transactions;
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
