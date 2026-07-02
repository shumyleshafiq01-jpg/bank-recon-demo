import { readSheet, ensureSheet } from "@/lib/google-sheets";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import PrintButton from "../PrintButton";

const SHEET = "CNF_Quotes";
const HEADERS = ["id","quoteNo","clientName","clientContact","destination","country","generatedAt","validTill","status","createdBy","brandKafi","brandEssence","notes","productsSnapshot"];

type QuoteProduct = {
  productName: string; sku: string; specs: string; packagingDesc: string;
  qty: number; fobPerCarton: number; freightPerCarton: number; cnfPerCarton: number;
};

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
    };
  } catch {
    return null;
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

function fmtUSD(n: number) { return "$" + n.toFixed(2); }

export default async function CNFSharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const quote = await getQuote(id);
  if (!quote) notFound();

  const totalCNF = quote.products.reduce((s, p) => s + p.cnfPerCarton * p.qty, 0);
  const isExpired = quote.validTill && new Date(quote.validTill + "T23:59:59") < new Date();

  const brandName = quote.brandKafi && quote.brandEssence
    ? "Kafi Commodities / Essence"
    : quote.brandEssence ? "Essence" : "Kafi Commodities";

  return (
    <>
      <style>{`
        @media print {
          body { background: #fff !important; }
          .no-print { display: none !important; }
          .share-page { box-shadow: none !important; margin: 0 !important; border-radius: 0 !important; }
        }
      `}</style>

      <div style={{ background: "#f5f7fa", minHeight: "100vh", padding: "32px 16px", WebkitPrintColorAdjust: "exact" }}>
        <div className="share-page" style={{ maxWidth: 860, margin: "0 auto", background: "#fff", borderRadius: 16, overflow: "hidden", boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }}>

          {/* Header */}
          <div style={{ background: "linear-gradient(135deg, #1e3a5f 0%, #0f2540 100%)", padding: "36px 40px 28px", color: "#fff" }}>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.5, color: "#fff" }}>{brandName}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 2, textTransform: "uppercase", letterSpacing: 1.5 }}>International Trade</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: 1.5, marginTop: 20 }}>Price Quotation</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: "#fff", marginTop: 4, fontFamily: "monospace" }}>{quote.quoteNo}</div>
          </div>

          {/* Meta */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, padding: "24px 40px", borderBottom: "1px solid #f0f0f0", background: "#fafbfc" }}>
            {[
              { label: "Prepared For", value: quote.clientName, sub: quote.clientContact },
              { label: "Destination", value: quote.destination, sub: quote.country },
              { label: "Issue Date", value: fmtDate(quote.generatedAt), sub: null },
            ].map((m, i) => (
              <div key={i}>
                <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: "#888", marginBottom: 3 }}>{m.label}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a2e" }}>{m.value}</div>
                {m.sub && <div style={{ fontSize: 11, color: "#888" }}>{m.sub}</div>}
                {i === 2 && (
                  <>
                    <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: "#888", marginTop: 10, marginBottom: 3 }}>Valid Until</div>
                    {isExpired ? (
                      <span style={{ display: "inline-flex", alignItems: "center", background: "#fee2e2", color: "#dc2626", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, border: "1px solid #fca5a5" }}>EXPIRED</span>
                    ) : (
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a2e" }}>{fmtDate(quote.validTill + "T00:00:00")}</div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Products table */}
          <div style={{ padding: "28px 40px" }}>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1.5, color: "#888", fontWeight: 700, marginBottom: 14 }}>Products &amp; Pricing</div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f8f9fb" }}>
                  {["#", "Product", "Qty (Cartons)", "FOB/Carton", "Freight/Carton", "CNF/Carton", "Total CNF"].map((h, i) => (
                    <th key={h} style={{ padding: "10px 12px", textAlign: i >= 2 ? "right" : "left", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: "#888", fontWeight: 700, borderBottom: "2px solid #e8eaed" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {quote.products.map((p, i) => (
                  <tr key={i} style={{ borderBottom: i < quote.products.length - 1 ? "1px solid #f0f2f5" : "none" }}>
                    <td style={{ padding: "12px 12px", color: "#aaa", fontSize: 12 }}>{i + 1}</td>
                    <td style={{ padding: "12px 12px", verticalAlign: "top" }}>
                      <div style={{ fontWeight: 600, color: "#1a1a2e", fontSize: 13 }}>{p.productName}</div>
                      {(p.specs || p.packagingDesc || p.sku) && (
                        <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
                          {[p.sku, p.specs, p.packagingDesc].filter(Boolean).join(" · ")}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "12px 12px", textAlign: "right", fontSize: 13 }}>{p.qty}</td>
                    <td style={{ padding: "12px 12px", textAlign: "right", fontSize: 13, color: "#555" }}>{fmtUSD(p.fobPerCarton)}</td>
                    <td style={{ padding: "12px 12px", textAlign: "right", fontSize: 13, color: "#555" }}>{fmtUSD(p.freightPerCarton)}</td>
                    <td style={{ padding: "12px 12px", textAlign: "right", fontSize: 13, fontWeight: 700, color: "#1e40af" }}>{fmtUSD(p.cnfPerCarton)}</td>
                    <td style={{ padding: "12px 12px", textAlign: "right", fontSize: 13, fontWeight: 700, color: "#1e40af" }}>{fmtUSD(p.cnfPerCarton * p.qty)}</td>
                  </tr>
                ))}
                <tr style={{ background: "#eff6ff" }}>
                  <td colSpan={6} style={{ padding: "14px 12px", textAlign: "right", fontSize: 12, fontWeight: 700, color: "#1e40af", borderTop: "2px solid #bfdbfe" }}>Grand Total CNF</td>
                  <td style={{ padding: "14px 12px", textAlign: "right", fontSize: 14, fontWeight: 700, color: "#1e40af", borderTop: "2px solid #bfdbfe" }}>{fmtUSD(totalCNF)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Notes */}
          {quote.notes && (
            <div style={{ margin: "0 40px 24px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: "12px 16px", fontSize: 12, color: "#92400e" }}>
              <strong>Note:</strong> {quote.notes}
            </div>
          )}

          {/* Footer */}
          <div style={{ padding: "20px 40px", background: "#f8f9fb", borderTop: "1px solid #f0f0f0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#1e3a5f" }}>{brandName}</div>
              <div style={{ fontSize: 11, color: "#aaa" }}>All prices in USD · Prices valid as stated above</div>
            </div>
            <div style={{ textAlign: "right", fontSize: 11, color: "#aaa" }}>
              <div>Quote: {quote.quoteNo}</div>
              <div>By: {quote.createdBy}</div>
            </div>
          </div>

          <div style={{ fontSize: 10, color: "#bbb", textAlign: "center", padding: 12 }}>Generated by Kafi Commodities AI Agent</div>
        </div>

        <PrintButton />
      </div>
    </>
  );
}
