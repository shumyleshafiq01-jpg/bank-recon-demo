import { readSheet, ensureSheet } from "@/lib/google-sheets";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import PrintButton from "../PrintButton";

const SHEET = "CNF_Quotes";
const HEADERS = [
  "id","quoteNo","clientName","clientContact","destination","country","generatedAt","validTill","status","createdBy","brandKafi","brandEssence","notes","productsSnapshot",
  "quoteType","discountType","discountScope","discountValue","discountAmount","discountProductIds",
  "shipmentPort","shippingMode","leadTime",
];

const BRANDS_SHEET = "PL_Brands";
const BRANDS_HEADERS = ["id", "name", "address", "city", "country", "logoUrl", "createdAt", "contactPerson", "website", "email"];

type QuoteProduct = {
  productName: string; sku: string; specs: string; packagingDesc: string;
  qty: number; fobPerCarton: number; freightPerCarton: number; cnfPerCarton: number;
  category?: string; imageUrl?: string;
};

type Brand = { id: string; name: string; contactPerson: string; website: string; email: string };

async function getQuote(id: string) {
  try {
    await ensureSheet(SHEET, HEADERS);
    const rows = await readSheet(SHEET);
    const row = rows.slice(1).find(r => r[0] === id);
    if (!row) return null;
    let products: QuoteProduct[] = [];
    try { products = JSON.parse(row[13] ?? "[]"); } catch { products = []; }
    return {
      id: row[0], quoteNo: row[1], clientName: row[2], clientContact: row[3],
      destination: row[4], country: row[5], generatedAt: row[6], validTill: row[7],
      status: row[8], createdBy: row[9], brandKafi: row[10] !== "false", brandEssence: row[11] === "true",
      notes: row[12], products,
      quoteType: (row[14] || "CNF") as "CNF" | "FOB",
      discountAmount: parseFloat(row[18]) || 0,
      shipmentPort: row[20] || "Karachi Port",
      shippingMode: row[21] || "By Sea",
      leadTime: row[22] || "30 to 35 Working Days",
    };
  } catch {
    return null;
  }
}

async function getBrands(): Promise<Brand[]> {
  try {
    await ensureSheet(BRANDS_SHEET, BRANDS_HEADERS);
    const rows = await readSheet(BRANDS_SHEET);
    return rows.slice(1).filter(r => r[0]).map(r => ({
      id: r[0] ?? "", name: r[1] ?? "", contactPerson: r[7] ?? "", website: r[8] ?? "", email: r[9] ?? "",
    }));
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const quote = await getQuote(id);
  return { title: quote ? `${quote.quoteNo} — CNF Price Quotation` : "CNF Quote" };
}

function fmtDate(iso: string) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }); }
  catch { return iso; }
}

function fmtUSD(n: number) { return n.toFixed(2); }

export default async function CNFSharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [quote, brands] = await Promise.all([getQuote(id), getBrands()]);
  if (!quote) notFound();

  const isFob = quote.quoteType === "FOB";
  const subtotal = quote.products.reduce((s, p) => s + p.cnfPerCarton * p.qty, 0);
  const grandTotal = subtotal - (quote.discountAmount || 0);
  const isExpired = quote.validTill && new Date(quote.validTill + "T23:59:59") < new Date();

  // Contact info is per-brand — Kafi takes priority since it's always the primary exporter on a quote today.
  const kafiBrand = brands.find(b => b.name.toLowerCase().includes("kafi"));
  const essenceBrand = brands.find(b => b.name.toLowerCase().includes("essence"));
  const contactBrand = quote.brandKafi ? kafiBrand : (quote.brandEssence ? essenceBrand : kafiBrand);

  // Group products by category (e.g. RICE, SALT) — each gets its own header bar, like the reference quotation format.
  const categories = Array.from(new Set(quote.products.map(p => p.category || "PRODUCTS")));
  const priceHeader = `${isFob ? "FOB" : "CNF"} - ${(quote.destination || "").toUpperCase()}`;

  return (
    <>
      <style>{`
        @media print {
          body { background: #fff !important; }
          .no-print { display: none !important; }
          .share-page { box-shadow: none !important; margin: 0 !important; }
        }
      `}</style>

      <div style={{ background: "#f5f7fa", minHeight: "100vh", padding: "32px 16px", WebkitPrintColorAdjust: "exact" }}>
        <div className="share-page" style={{ maxWidth: 1000, margin: "0 auto", background: "#fff", boxShadow: "0 4px 24px rgba(0,0,0,0.08)", border: "1px solid #1a1a2e" }}>

          {/* Reference strip */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 24px", background: "#f8f9fb", borderBottom: "1px solid #e8eaed", fontSize: 11, color: "#888" }}>
            <span>Quote <strong style={{ color: "#1a1a2e", fontFamily: "monospace" }}>{quote.quoteNo}</strong> · Prepared for <strong style={{ color: "#1a1a2e" }}>{quote.clientName}</strong></span>
            <span>
              Issued {fmtDate(quote.generatedAt)} · Valid Until{" "}
              {isExpired
                ? <strong style={{ color: "#dc2626" }}>EXPIRED</strong>
                : <strong style={{ color: "#1a1a2e" }}>{fmtDate(quote.validTill + "T00:00:00")}</strong>}
            </span>
          </div>

          {/* Logo header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 32px", borderBottom: "2px solid #1a1a2e" }}>
            <div style={{ height: 64, display: "flex", alignItems: "center" }}>
              {quote.brandEssence && <img src="/brands/essence-logo.jpeg" alt="Essence" style={{ height: 64, objectFit: "contain" }} />}
            </div>
            <div style={{ height: 64, display: "flex", alignItems: "center" }}>
              {quote.brandKafi && <img src="/brands/kafi-logo.jpeg" alt="Kafi Commodities" style={{ height: 64, objectFit: "contain" }} />}
            </div>
          </div>

          {/* Terms & Contact bar */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", background: "#dfe6f2", borderBottom: "1px solid #c7d2e6" }}>
            <div style={{ padding: "14px 24px", borderRight: "1px solid #c7d2e6", fontSize: 13, color: "#1a1a2e" }}>
              <div style={{ fontWeight: 700, textDecoration: "underline", marginBottom: 6, textAlign: "center" }}>Terms &amp; Condition</div>
              <div style={{ textAlign: "center" }}>Shipment Port: {quote.shipmentPort}</div>
              <div style={{ textAlign: "center" }}>Shipping: {quote.shippingMode}</div>
              <div style={{ textAlign: "center" }}>Lead Time: {quote.leadTime}</div>
            </div>
            <div style={{ padding: "14px 24px", fontSize: 13, color: "#1a1a2e" }}>
              {contactBrand?.contactPerson && <div><strong>Contact Person:</strong> {contactBrand.contactPerson}</div>}
              {contactBrand?.website && <div>Website: {contactBrand.website}</div>}
              {contactBrand?.email && <div>Email ID: {contactBrand.email}</div>}
              {!contactBrand?.contactPerson && !contactBrand?.website && !contactBrand?.email && (
                <div style={{ color: "#888" }}>Add contact details for this brand in Product List → Brands.</div>
              )}
            </div>
          </div>

          {/* Category sections */}
          {categories.map(cat => {
            const items = quote.products.filter(p => (p.category || "PRODUCTS") === cat);
            return (
              <div key={cat}>
                <div style={{ background: "#1e3a5f", color: "#fff", textAlign: "center", padding: "10px 12px", fontSize: 16, fontWeight: 700, textDecoration: "underline" }}>
                  {cat.toUpperCase()}
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      {["S.No", "Product", "Packaging", priceHeader, "Images"].map((h, i) => (
                        <th key={i} style={{ padding: "12px 10px", textAlign: "center", fontSize: 13, fontWeight: 700, color: "#1a1a2e", border: "1px solid #1a1a2e", background: "#fff" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((p, i) => (
                      <tr key={i} style={{ background: "#fff" }}>
                        <td style={{ padding: "16px 10px", textAlign: "center", fontSize: 14, fontWeight: 700, border: "1px solid #1a1a2e", background: "#dfe6f2" }}>{i + 1}</td>
                        <td style={{ padding: "16px 10px", textAlign: "center", fontSize: 14, fontWeight: 700, color: "#1a1a2e", border: "1px solid #1a1a2e" }}>{p.productName}</td>
                        <td style={{ padding: "16px 10px", textAlign: "center", fontSize: 13, fontWeight: 600, color: "#1a1a2e", border: "1px solid #1a1a2e", whiteSpace: "pre-line", background: "#dfe6f2" }}>{p.specs || p.packagingDesc || "—"}</td>
                        <td style={{ padding: "16px 10px", fontSize: 15, fontWeight: 700, color: "#1a1a2e", border: "1px solid #1a1a2e" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", padding: "0 8px" }}>
                            <span>$</span><span>{fmtUSD(p.cnfPerCarton * p.qty)}</span>
                          </div>
                        </td>
                        <td style={{ padding: "10px", textAlign: "center", border: "1px solid #1a1a2e" }}>
                          {p.imageUrl ? (
                            <img src={p.imageUrl} alt={p.productName} style={{ width: 90, height: 110, objectFit: "cover", margin: "0 auto" }} />
                          ) : (
                            <div style={{ width: 90, height: 110, background: "#f0f2f5", margin: "0 auto" }} />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}

          {/* Totals */}
          <div style={{ padding: "18px 32px", borderTop: "2px solid #1a1a2e" }}>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 40 }}>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 12, color: "#888" }}>Subtotal</div>
                {(quote.discountAmount || 0) > 0 && <div style={{ fontSize: 12, color: "#dc2626", marginTop: 4 }}>Discount</div>}
                <div style={{ fontSize: 14, fontWeight: 700, color: "#1e3a5f", marginTop: 4 }}>Grand Total</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 13, color: "#1a1a2e" }}>${fmtUSD(subtotal)}</div>
                {(quote.discountAmount || 0) > 0 && <div style={{ fontSize: 13, color: "#dc2626", marginTop: 4 }}>−${fmtUSD(quote.discountAmount)}</div>}
                <div style={{ fontSize: 15, fontWeight: 700, color: "#1e3a5f", marginTop: 4 }}>${fmtUSD(grandTotal)}</div>
              </div>
            </div>
          </div>

          {/* Notes */}
          {quote.notes && (
            <div style={{ margin: "0 32px 20px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: "12px 16px", fontSize: 12, color: "#92400e" }}>
              <strong>Note:</strong> {quote.notes}
            </div>
          )}

          <div style={{ fontSize: 10, color: "#bbb", textAlign: "center", padding: 12, borderTop: "1px solid #f0f0f0" }}>Generated by Kafi Commodities AI Agent · By {quote.createdBy}</div>
        </div>

        <PrintButton />
      </div>
    </>
  );
}
