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

async function parseQuotation(file: File, category: string): Promise<ParsedQuotation> {
  const fileName = file.name;
  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = fileName.toLowerCase().split(".").pop() ?? "";

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
      description: String(item.description ?? "").substring(0, 120),
      quantity: Number(item.quantity) || 1,
      unit: item.unit ? String(item.unit) : null,
      unitPrice: Number(item.unitPrice) || 0,
      totalPrice: Number(item.totalPrice) || 0,
      isLabor: Boolean(item.isLabor),
    }));

    return {
      fileName,
      vendor: String(parsed.vendor ?? "Unknown Vendor").substring(0, 80),
      quoteNumber: parsed.quoteNumber ? String(parsed.quoteNumber) : null,
      quoteDate: parsed.quoteDate ? String(parsed.quoteDate) : null,
      currency: String(parsed.currency ?? "PKR").toUpperCase(),
      validUntil: parsed.validUntil ? String(parsed.validUntil) : null,
      lineItems,
      subtotal: typeof parsed.subtotal === "number" ? parsed.subtotal : null,
      tax: Number(parsed.tax) || 0,
      grandTotal: typeof parsed.grandTotal === "number" ? parsed.grandTotal : null,
      notes: parsed.notes ? String(parsed.notes).substring(0, 200) : null,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { fileName, vendor: "", quoteNumber: null, quoteDate: null, currency: "PKR", validUntil: null, lineItems: [], subtotal: null, tax: 0, grandTotal: null, notes: null, error: `AI extraction failed: ${msg}` };
  }
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const files = formData.getAll("files") as File[];
    const category = (formData.get("category") as string) || "";

    if (files.length < 2) {
      return Response.json({ error: "Upload at least 2 quotations to compare." }, { status: 400 });
    }

    if (files.length > 10) {
      return Response.json({ error: "Maximum 10 quotations at a time." }, { status: 400 });
    }

    const results = await Promise.all(
      files.map((file) => parseQuotation(file, category))
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

    return Response.json({
      success: true,
      category,
      quotations: results,
      errors,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: `Server error: ${msg}` }, { status: 500 });
  }
}
