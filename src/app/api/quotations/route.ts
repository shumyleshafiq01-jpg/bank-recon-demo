/**
 * POST /api/quotations — Quotation Comparison Module
 *
 * Accepts multiple quotation files (PDF, images, Word docs, scanned docs)
 * and uses AI to extract line items from each. Returns structured data
 * for tabular comparison across vendors.
 *
 * FormData:
 *   - files[]: one or more quotation files
 *   - category: business category (freight, food, packaging, etc.)
 */

export const maxDuration = 300;
export const runtime = "nodejs";

import Anthropic from "@anthropic-ai/sdk";
import * as XLSX from "xlsx";
import { logUsage } from "@/lib/usage-tracker";

const EXTRACT_PROMPT = `You are extracting line items from a vendor quotation / price quote.

Extract EVERY line item from this quotation. Respond with ONLY a JSON object:

{
  "vendor": "<vendor/supplier company name>",
  "quoteNumber": "<quote/reference number if visible, or null>",
  "quoteDate": "<date on the quotation, DD-MM-YYYY, or null>",
  "currency": "<currency code, e.g. PKR, USD, AED, GBP — detect from symbols or text>",
  "validUntil": "<expiry/validity date if mentioned, or null>",
  "lineItems": [
    {
      "description": "<item/service description, concise but clear>",
      "quantity": <quantity as number, or 1 if not specified>,
      "unit": "<unit of measure: pcs, kg, trips, hours, sqft, etc. or null>",
      "unitPrice": <unit price as number>,
      "totalPrice": <total price for this line = quantity × unitPrice>,
      "isLabor": <true if this is a labor/service/installation/manpower charge, false if material/product>
    }
  ],
  "subtotal": <sum of all line item totals, or null if not shown>,
  "tax": <tax amount if shown, or 0>,
  "grandTotal": <grand total including tax, or null if not shown>,
  "notes": "<any special terms, delivery conditions, or payment terms — short summary, or null>"
}

Rules:
- Extract amounts as plain numbers, no commas (e.g. 150000.00 not 150,000.00)
- If a line item has no explicit quantity, assume 1
- isLabor = true for: labor, installation, service charges, manpower, transport charges, handling fees, loading/unloading, fitting, welding, painting labor, etc.
- isLabor = false for: physical materials, products, equipment, parts, consumables, etc.
- If the quotation has grouped sections, flatten into one lineItems array
- Detect currency from ₨, Rs, PKR, $, USD, AED, £, GBP, €, EUR or text clues
- Do NOT skip any line item. Do NOT invent items.
- If you see a discount line, include it as a line item with negative totalPrice`;

// Fixes "mojibake" — UTF-8 punctuation (en/em dashes, curly quotes, bullets,
// ellipsis, ©/®/°) that got misread as Windows-1252 and re-encoded, which is
// a common artifact when the AI transcribes styled punctuation from a PDF.
// Only replaces these exact known-bad byte sequences, so it can't corrupt
// text that wasn't already broken.
const MOJIBAKE_MAP: [string, string][] = [
  ["â€“", "–"], ["â€”", "—"],
  ["â€˜", "‘"], ["â€™", "’"],
  ["â€œ", "“"], ["â€", "”"], ["â€", "”"],
  ["â€¢", "•"], ["â€¦", "…"],
  ["Â®", "®"], ["Â©", "©"], ["Â°", "°"], ["Â ", " "],
];

function fixMojibake(s: string): string {
  let out = s;
  for (const [bad, good] of MOJIBAKE_MAP) out = out.split(bad).join(good);
  return out;
}

type LineItem = {
  description: string;
  quantity: number;
  unit: string | null;
  unitPrice: number;
  totalPrice: number;
  isLabor: boolean;
};

type ParsedQuotation = {
  fileName: string;
  vendor: string;
  quoteNumber: string | null;
  quoteDate: string | null;
  currency: string;
  validUntil: string | null;
  lineItems: LineItem[];
  subtotal: number | null;
  tax: number;
  grandTotal: number | null;
  notes: string | null;
  error?: string;
};

function blankQuotation(fileName: string, error?: string): ParsedQuotation {
  return { fileName, vendor: "", quoteNumber: null, quoteDate: null, currency: "PKR", validUntil: null, lineItems: [], subtotal: null, tax: 0, grandTotal: null, notes: null, error };
}

/* ═══════════════════════════════════════════
   LOCAL (NON-AI) EXTRACTION — no API cost, best-effort.
   Only works on files with real text (digital PDFs, DOCX, CSV, XLS/XLSX).
   Scanned/image quotations have no text layer to parse locally, so those
   are reported back to the user rather than attempting OCR (unreliable
   in this environment — use AI mode for scans instead).
   ═══════════════════════════════════════════ */
function getPDFJS() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const PDFJS = require("pdf-parse/lib/pdf.js/v2.0.550/build/pdf.js");
  PDFJS.disableWorker = true;
  return PDFJS;
}

async function extractPdfTextLocal(buffer: Buffer): Promise<string> {
  try {
    const PDFJS = getPDFJS();
    const doc = await PDFJS.getDocument(new Uint8Array(buffer));
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
    return text;
  } catch {
    return "";
  }
}

const LABOR_KEYWORDS = /\b(labor|labour|installation|install|service|manpower|transport|handling|loading|unloading|fitting|welding|commissioning|delivery|freight)\b/i;

// Best-effort heuristic: a line item is any line ending in a properly
// formatted amount (1-3 digits, comma-grouped thousands, 2 decimals),
// optionally preceded by a small leading quantity. Everything before the
// trailing amount(s) becomes the description.
function localExtractLineItems(text: string): LineItem[] {
  const AMOUNT_RX = /([\d,]{1,12}\.\d{2})\s*$/;
  const LEADING_QTY_RX = /^(\d{1,4})\s+(?=\D)/;

  const items: LineItem[] = [];
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    const amountMatch = line.match(AMOUNT_RX);
    if (!amountMatch) continue;

    const amount = parseFloat(amountMatch[1].replace(/,/g, ""));
    if (!amount || amount <= 0) continue;

    let rest = line.slice(0, amountMatch.index).trim();
    // Strip a second trailing number if present (rate column before total column)
    const secondAmount = rest.match(AMOUNT_RX);
    let unitPrice = amount;
    if (secondAmount) {
      unitPrice = parseFloat(secondAmount[1].replace(/,/g, ""));
      rest = rest.slice(0, secondAmount.index).trim();
    }

    const qtyMatch = rest.match(LEADING_QTY_RX);
    const quantity = qtyMatch ? parseInt(qtyMatch[1], 10) : 1;
    const description = (qtyMatch ? rest.slice(qtyMatch[0].length) : rest).trim();

    if (description.length < 3 || /^[\d\s.,#-]+$/.test(description)) continue; // not a real description

    items.push({
      description: description.substring(0, 120),
      quantity: quantity || 1,
      unit: null,
      unitPrice: secondAmount ? unitPrice : amount,
      totalPrice: amount,
      isLabor: LABOR_KEYWORDS.test(description),
    });
  }

  return items;
}

function parseCsvLocal(text: string): LineItem[] {
  const rows = text.split(/\r?\n/).map((r) => r.split(",").map((c) => c.trim().replace(/^"|"$/g, ""))).filter((r) => r.some((c) => c));
  if (rows.length < 2) return [];

  const header = rows[0].map((h) => h.toLowerCase());
  const findCol = (...names: string[]) => header.findIndex((h) => names.some((n) => h.includes(n)));
  const descCol = findCol("description", "item", "particular");
  const qtyCol = findCol("qty", "quantity");
  const priceCol = findCol("unit price", "unit cost", "rate", "price");
  const totalCol = findCol("total", "amount");
  // "unit" alone (not "unit price"/"unit cost") — e.g. pcs, kg, hrs
  const unitCol = header.findIndex((h, i) => (h === "unit" || h.includes("uom")) && i !== priceCol);

  if (descCol === -1 || (priceCol === -1 && totalCol === -1)) return [];

  const items: LineItem[] = [];
  for (const row of rows.slice(1)) {
    const description = row[descCol]?.trim();
    if (!description) continue;
    const quantity = qtyCol >= 0 ? parseFloat(row[qtyCol]?.replace(/,/g, "")) || 1 : 1;
    const unitPrice = priceCol >= 0 ? parseFloat(row[priceCol]?.replace(/,/g, "")) || 0 : 0;
    const totalPrice = totalCol >= 0 ? parseFloat(row[totalCol]?.replace(/,/g, "")) || 0 : quantity * unitPrice;
    if (!totalPrice && !unitPrice) continue;
    items.push({
      description: description.substring(0, 120),
      quantity,
      unit: unitCol >= 0 ? (row[unitCol]?.trim() || null) : null,
      unitPrice: unitPrice || (quantity ? totalPrice / quantity : totalPrice),
      totalPrice: totalPrice || quantity * unitPrice,
      isLabor: LABOR_KEYWORDS.test(description),
    });
  }
  return items;
}

function parseExcelLocal(buffer: Buffer): LineItem[] {
  try {
    const wb = XLSX.read(buffer, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const csv = XLSX.utils.sheet_to_csv(ws);
    return parseCsvLocal(csv);
  } catch {
    return [];
  }
}

async function parseQuotationLocal(file: File, buffer: Buffer, ext: string): Promise<ParsedQuotation> {
  const fileName = file.name;
  const vendor = fileName.replace(/\.[^.]+$/, "").substring(0, 80);

  let lineItems: LineItem[] = [];

  if (ext === "csv") {
    lineItems = parseCsvLocal(buffer.toString("utf-8"));
  } else if (ext === "xls" || ext === "xlsx") {
    lineItems = parseExcelLocal(buffer);
  } else if (ext === "pdf") {
    const text = await extractPdfTextLocal(buffer);
    if (text.replace(/\s/g, "").length < 50) {
      return blankQuotation(fileName, `${fileName} looks like a scanned/image PDF — no text layer to parse locally. Please enable AI mode for this file.`);
    }
    lineItems = localExtractLineItems(text);
  } else if (ext === "docx") {
    try {
      const JSZip = (await import("jszip")).default;
      const zip = await JSZip.loadAsync(buffer);
      const docXml = await zip.file("word/document.xml")?.async("text");
      const text = docXml ? docXml.replace(/<[^>]+>/g, "\n").replace(/\n+/g, "\n").trim() : "";
      lineItems = localExtractLineItems(text);
    } catch {
      return blankQuotation(fileName, `Could not read ${fileName} locally. Please enable AI mode for this file.`);
    }
  } else if (MIME_MAP[ext]) {
    return blankQuotation(fileName, `${fileName} is an image — local parsing needs a text layer, which images don't have. Please enable AI mode for this file.`);
  } else {
    const text = buffer.toString("utf-8");
    lineItems = localExtractLineItems(text);
  }

  if (lineItems.length === 0) {
    return blankQuotation(fileName, `Local parser could not find any line items in ${fileName}. Try enabling AI mode.`);
  }

  const subtotal = lineItems.reduce((s, i) => s + i.totalPrice, 0);
  return {
    fileName, vendor, quoteNumber: null, quoteDate: null, currency: "PKR", validUntil: null,
    lineItems, subtotal, tax: 0, grandTotal: subtotal, notes: null,
  };
}

const MIME_MAP: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  tiff: "image/tiff",
  tif: "image/tiff",
};

async function parseQuotation(file: File, category: string, useAI: boolean): Promise<ParsedQuotation> {
  const fileName = file.name;
  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = fileName.toLowerCase().split(".").pop() ?? "";

  if (!useAI) {
    return parseQuotationLocal(file, buffer, ext);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { fileName, vendor: "", quoteNumber: null, quoteDate: null, currency: "PKR", validUntil: null, lineItems: [], subtotal: null, tax: 0, grandTotal: null, notes: null, error: "No API key configured." };
  }

  if (buffer.length > 30 * 1024 * 1024) {
    return { fileName, vendor: "", quoteNumber: null, quoteDate: null, currency: "PKR", validUntil: null, lineItems: [], subtotal: null, tax: 0, grandTotal: null, notes: null, error: `${fileName} is too large (max 30 MB).` };
  }

  const client = new Anthropic({ apiKey });
  const categoryHint = category ? `This is a quotation for the "${category}" category. ` : "";
  const prompt = categoryHint + EXTRACT_PROMPT;

  const contentBlocks: Anthropic.ContentBlockParam[] = [];

  if (ext === "pdf") {
    contentBlocks.push({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: buffer.toString("base64") },
    });
  } else if (MIME_MAP[ext]) {
    contentBlocks.push({
      type: "image",
      source: { type: "base64", media_type: MIME_MAP[ext] as Anthropic.Base64ImageSource["media_type"], data: buffer.toString("base64") },
    });
  } else if (ext === "doc" || ext === "docx") {
    // For Word documents, try to extract text
    let text = "";
    try {
      if (ext === "docx") {
        // Simple DOCX text extraction — docx files are ZIP archives
        const JSZip = (await import("jszip")).default;
        const zip = await JSZip.loadAsync(buffer);
        const docXml = await zip.file("word/document.xml")?.async("text");
        if (docXml) {
          text = docXml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        }
      }
    } catch { /* fall through to raw text attempt */ }

    if (text.length > 50) {
      contentBlocks.push({ type: "text", text: `Quotation document content (${fileName}):\n\n${text}` });
    } else {
      // Try sending as PDF-like document
      contentBlocks.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: buffer.toString("base64") },
      });
    }
  } else {
    // Try as text
    const textContent = buffer.toString("utf-8");
    if (textContent.replace(/\s/g, "").length > 20) {
      contentBlocks.push({ type: "text", text: `Quotation content from ${fileName}:\n\n${textContent}` });
    } else {
      return { fileName, vendor: "", quoteNumber: null, quoteDate: null, currency: "PKR", validUntil: null, lineItems: [], subtotal: null, tax: 0, grandTotal: null, notes: null, error: `Unsupported file format: .${ext}` };
    }
  }

  contentBlocks.push({ type: "text", text: prompt });

  try {
    const response = await client.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 16000,
      messages: [{ role: "user", content: contentBlocks }],
    }).finalMessage();

    if (response.usage) {
      logUsage("Quotations", "claude-sonnet-4-6", response.usage.input_tokens, response.usage.output_tokens);
    }

    const textBlock = response.content.find((b) => b.type === "text");
    const raw = textBlock && textBlock.type === "text" ? textBlock.text : "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { fileName, vendor: "", quoteNumber: null, quoteDate: null, currency: "PKR", validUntil: null, lineItems: [], subtotal: null, tax: 0, grandTotal: null, notes: null, error: `AI could not extract data from ${fileName}.` };
    }

    const parsed = JSON.parse(jsonMatch[0]);

    const lineItems: LineItem[] = (parsed.lineItems ?? []).map((item: Record<string, unknown>) => ({
      description: fixMojibake(String(item.description ?? "").substring(0, 120)),
      quantity: Number(item.quantity) || 1,
      unit: item.unit ? fixMojibake(String(item.unit)) : null,
      unitPrice: Number(item.unitPrice) || 0,
      totalPrice: Number(item.totalPrice) || 0,
      isLabor: Boolean(item.isLabor),
    }));

    return {
      fileName,
      vendor: fixMojibake(String(parsed.vendor ?? "Unknown Vendor").substring(0, 80)),
      quoteNumber: parsed.quoteNumber ? fixMojibake(String(parsed.quoteNumber)) : null,
      quoteDate: parsed.quoteDate ? String(parsed.quoteDate) : null,
      currency: String(parsed.currency ?? "PKR").toUpperCase(),
      validUntil: parsed.validUntil ? String(parsed.validUntil) : null,
      lineItems,
      subtotal: typeof parsed.subtotal === "number" ? parsed.subtotal : null,
      tax: Number(parsed.tax) || 0,
      grandTotal: typeof parsed.grandTotal === "number" ? parsed.grandTotal : null,
      notes: parsed.notes ? fixMojibake(String(parsed.notes).substring(0, 200)) : null,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { fileName, vendor: "", quoteNumber: null, quoteDate: null, currency: "PKR", validUntil: null, lineItems: [], subtotal: null, tax: 0, grandTotal: null, notes: null, error: `AI extraction failed: ${msg}` };
  }
}

type MatchGroup = { label: string; items: { vendor: number; item: number }[] };

const MATCH_PROMPT = `You are matching line items across quotations from DIFFERENT vendors competing for the SAME procurement request. Each vendor may list several different brands/models on one sheet — some items refer to the exact same real-world product that another vendor also quoted (same brand AND same capacity/spec), just written with different spelling because these are handwritten/scanned documents read by OCR (e.g. "Ziewhic" and "Ziewnie" are likely the same brand misread two different ways). Other items are unique to a single vendor and have no match elsewhere.

Group items that represent the SAME product/spec together. Rules:
- Group by brand/model AND capacity/spec together — e.g. "5KW" only matches "5KW", never "6.2KW" or "10KW", even if the brand looks similar.
- Account for spelling/OCR variance in brand names, but do not force a match just because two items are the same capacity with completely different brand names.
- EVERY item from EVERY vendor must appear in exactly one group. Items with no match anywhere else still get their own group, containing just that one item.
- When in doubt whether two items are the same product, do NOT group them — leave them separate. A wrong "no match" is far less costly than a wrong forced match.

ITEMS TO GROUP:
{{ITEMS}}

Respond with ONLY a JSON array, no other text:
[
  { "label": "<short canonical description for this product, e.g. 'Ziewnic 5KW Lithium Battery'>", "items": [{"vendor": <vendor index>, "item": <item index>}, ...] }
]`;

async function groupLineItems(vendors: ParsedQuotation[]): Promise<MatchGroup[] | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const itemLines: string[] = [];
  for (let vi = 0; vi < vendors.length; vi++) {
    itemLines.push(`Vendor ${vi}: ${vendors[vi].vendor}`);
    vendors[vi].lineItems.forEach((item, ii) => {
      itemLines.push(`  Item ${ii}: "${item.description}" qty=${item.quantity} unit=${item.unit ?? "null"} unitPrice=${item.unitPrice} totalPrice=${item.totalPrice}${item.isLabor ? " (labor)" : ""}`);
    });
  }

  const prompt = MATCH_PROMPT.replace("{{ITEMS}}", itemLines.join("\n"));

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 8000,
      messages: [{ role: "user", content: [{ type: "text", text: prompt }] }],
    }).finalMessage();

    if (response.usage) {
      logUsage("Quotations-Match", "claude-sonnet-4-6", response.usage.input_tokens, response.usage.output_tokens);
    }

    const textBlock = response.content.find((b) => b.type === "text");
    const raw = textBlock && textBlock.type === "text" ? textBlock.text : "";
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as unknown;
    if (!Array.isArray(parsed)) return null;

    const groups: MatchGroup[] = parsed
      .filter((g): g is { label: unknown; items: unknown } => typeof g === "object" && g !== null)
      .map((g) => ({
        label: fixMojibake(String((g as { label?: unknown }).label ?? "")),
        items: Array.isArray((g as { items?: unknown }).items)
          ? ((g as { items: unknown[] }).items)
              .filter((it): it is { vendor: unknown; item: unknown } => typeof it === "object" && it !== null)
              .map((it) => ({ vendor: Number((it as { vendor?: unknown }).vendor), item: Number((it as { item?: unknown }).item) }))
              .filter((it) => Number.isInteger(it.vendor) && Number.isInteger(it.item))
          : [],
      }))
      .filter((g) => g.label && g.items.length > 0);

    // Validate coverage: every real item must be referenced exactly once.
    // If the AI missed or duplicated anything, don't trust the grouping —
    // fall back to per-item rows rather than risk silently dropping a line item.
    const covered = new Set<string>();
    for (const g of groups) {
      for (const it of g.items) {
        if (it.vendor < 0 || it.vendor >= vendors.length) return null;
        if (it.item < 0 || it.item >= vendors[it.vendor].lineItems.length) return null;
        const key = `${it.vendor}:${it.item}`;
        if (covered.has(key)) return null; // duplicate reference
        covered.add(key);
      }
    }
    const totalItems = vendors.reduce((s, v) => s + v.lineItems.length, 0);
    if (covered.size !== totalItems) return null; // missing coverage

    return groups;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const files = formData.getAll("files") as File[];
    const category = (formData.get("category") as string) || "";
    const useAI = formData.get("useAI") !== "false";

    if (files.length < 2) {
      return Response.json({ error: "Upload at least 2 quotations to compare." }, { status: 400 });
    }

    if (files.length > 10) {
      return Response.json({ error: "Maximum 10 quotations at a time." }, { status: 400 });
    }

    const results = await Promise.all(
      files.map((file) => parseQuotation(file, category, useAI))
    );

    const successful = results.filter((r) => r.lineItems.length > 0);
    const errors = results.filter((r) => r.error).map((r) => `${r.fileName}: ${r.error}`);

    if (successful.length < 2) {
      return Response.json({
        error: "Could not extract line items from enough quotations (need at least 2).",
        details: errors,
        quotations: results,
      }, { status: 400 });
    }

    // Semantic matching across vendors — groups the same real-world product
    // together even when brand spelling differs between scanned quotations.
    // Falls back to null (frontend uses plain description matching) if the
    // AI call fails or its grouping can't be trusted. Skipped entirely in
    // local mode, since the point of local mode is avoiding API calls.
    const matchGroups = useAI ? await groupLineItems(successful) : null;

    return Response.json({
      success: true,
      category,
      quotations: results,
      matchGroups,
      errors,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: `Server error: ${msg}` }, { status: 500 });
  }
}
