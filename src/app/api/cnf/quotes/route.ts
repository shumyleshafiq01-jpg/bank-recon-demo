import { ensureSheet, readSheet, updateRow, writeRows, deleteRow } from "@/lib/google-sheets";

const SHEET = "CNF_Quotes";
const HEADERS = [
  "id", "quoteNo", "clientName", "clientContact", "destination", "country",
  "generatedAt", "validTill", "status", "createdBy", "brandKafi", "brandEssence",
  "notes", "productsSnapshot",
  "quoteType", "discountType", "discountScope", "discountValue", "discountAmount", "discountProductIds",
  "shipmentPort", "shippingMode", "leadTime",
];

async function init() { await ensureSheet(SHEET, HEADERS); }

function parseRow(r: string[]) {
  let products = [];
  try { products = JSON.parse(r[13] ?? "[]"); } catch { products = []; }
  let discountProductIds: string[] = [];
  try { discountProductIds = JSON.parse(r[19] ?? "[]"); } catch { discountProductIds = []; }
  return {
    id: r[0] ?? "", quoteNo: r[1] ?? "", clientName: r[2] ?? "",
    clientContact: r[3] ?? "", destination: r[4] ?? "", country: r[5] ?? "",
    generatedAt: r[6] ?? "", validTill: r[7] ?? "", status: r[8] ?? "active",
    createdBy: r[9] ?? "", brandKafi: r[10] !== "false", brandEssence: r[11] === "true",
    notes: r[12] ?? "", productsSnapshot: products,
    quoteType: (r[14] || "CNF") as "CNF" | "FOB",
    discountType: (r[15] || "none") as "none" | "percent" | "amount",
    discountScope: (r[16] || "all") as "all" | "specific",
    discountValue: parseFloat(r[17]) || 0,
    discountAmount: parseFloat(r[18]) || 0,
    discountProductIds,
    shipmentPort: r[20] || "Karachi Port",
    shippingMode: r[21] || "By Sea",
    leadTime: r[22] || "30 to 35 Working Days",
  };
}

async function nextQuoteNo(rows: string[][]): Promise<string> {
  const year = new Date().getFullYear();
  const existing = rows.slice(1)
    .map(r => r[1] ?? "")
    .filter(n => n.startsWith(`CNF-${year}-`))
    .map(n => parseInt(n.split("-")[2] ?? "0", 10))
    .filter(n => !isNaN(n));
  const next = existing.length > 0 ? Math.max(...existing) + 1 : 1;
  return `CNF-${year}-${String(next).padStart(3, "0")}`;
}

export async function GET() {
  try {
    await init();
    const rows = await readSheet(SHEET);
    return Response.json({ quotes: rows.slice(1).filter(r => r[0]).map(parseRow) });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await init();
    const body = await request.json() as {
      action: "create" | "archive" | "unarchive" | "delete";
      quote?: Record<string, unknown>;
      id?: string;
    };

    if (body.action === "create" && body.quote) {
      const rows = await readSheet(SHEET);
      const q = body.quote;
      const id = crypto.randomUUID();
      const quoteNo = await nextQuoteNo(rows);
      const now = new Date().toISOString();
      const row = [
        id, quoteNo, String(q.clientName ?? ""), String(q.clientContact ?? ""),
        String(q.destination ?? ""), String(q.country ?? ""),
        now, String(q.validTill ?? ""), "active", String(q.createdBy ?? ""),
        String(q.brandKafi !== false), String(q.brandEssence === true),
        String(q.notes ?? ""), JSON.stringify(q.productsSnapshot ?? []),
        String(q.quoteType ?? "CNF"), String(q.discountType ?? "none"), String(q.discountScope ?? "all"),
        String(q.discountValue ?? 0), String(q.discountAmount ?? 0), JSON.stringify(q.discountProductIds ?? []),
        String(q.shipmentPort ?? "Karachi Port"), String(q.shippingMode ?? "By Sea"), String(q.leadTime ?? "30 to 35 Working Days"),
      ];
      await writeRows(SHEET, [row]);
      return Response.json({ saved: true, id, quoteNo });
    }

    if ((body.action === "archive" || body.action === "unarchive") && body.id) {
      const rows = await readSheet(SHEET);
      const idx = rows.findIndex((r, i) => i > 0 && r[0] === body.id);
      if (idx > 0) {
        rows[idx][8] = body.action === "archive" ? "archived" : "active";
        await updateRow(SHEET, idx + 1, rows[idx]);
      }
      return Response.json({ saved: true });
    }

    if (body.action === "delete" && body.id) {
      const rows = await readSheet(SHEET);
      const idx = rows.findIndex((r, i) => i > 0 && r[0] === body.id);
      if (idx > 0) await deleteRow(SHEET, idx + 1);
      return Response.json({ deleted: true });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
