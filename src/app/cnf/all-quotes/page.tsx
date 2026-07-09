import { readSheet, ensureSheet } from "@/lib/google-sheets";
import Link from "next/link";

const SHEET = "CNF_Quotes";
const HEADERS = [
  "id","quoteNo","clientName","clientContact","destination","country","generatedAt","validTill","status","createdBy","brandKafi","brandEssence","notes","productsSnapshot",
  "quoteType","discountType","discountScope","discountValue","discountAmount","discountProductIds",
  "shipmentPort","shippingMode","leadTime",
];

type QuoteRow = {
  id: string; quoteNo: string; clientName: string; destination: string; country: string;
  generatedAt: string; validTill: string; status: string; productCount: number; total: number;
  quoteType: "CNF" | "FOB";
};

async function getQuotes(): Promise<QuoteRow[]> {
  try {
    await ensureSheet(SHEET, HEADERS);
    const rows = await readSheet(SHEET);
    return rows.slice(1).filter(r => r[0]).map(r => {
      let products: { qty: number; cnfPerCarton: number }[] = [];
      try { products = JSON.parse(r[13] ?? "[]"); } catch { products = []; }
      const subtotal = products.reduce((s, p) => s + (p.cnfPerCarton ?? 0) * (p.qty ?? 0), 0);
      const discountAmount = parseFloat(r[18]) || 0;
      return {
        id: r[0], quoteNo: r[1] ?? "", clientName: r[2] ?? "", destination: r[4] ?? "",
        country: r[5] ?? "", generatedAt: r[6] ?? "", validTill: r[7] ?? "", status: r[8] ?? "active",
        productCount: products.length, total: subtotal - discountAmount,
        quoteType: (r[14] || "CNF") as "CNF" | "FOB",
      };
    }).filter(q => q.status === "active");
  } catch {
    return [];
  }
}

function fmtDate(iso: string) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return iso; }
}

function fmtUSD(n: number) { return "$" + n.toFixed(2); }

export const metadata = { title: "CNF Quotations — Kafi Commodities" };

export default async function AllQuotesPage() {
  const quotes = (await getQuotes()).sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));

  return (
    <div style={{ background: "#f5f7fa", minHeight: "100vh", padding: "40px 20px", fontFamily: "'Segoe UI', Arial, sans-serif" }}>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        <div style={{ background: "linear-gradient(135deg, #1e3a5f 0%, #0f2540 100%)", borderRadius: 16, padding: "32px 36px", color: "#fff", marginBottom: 24 }}>
          <div style={{ fontSize: 20, fontWeight: 800 }}>Kafi Commodities</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginTop: 4, textTransform: "uppercase", letterSpacing: 1.2 }}>CNF Export Quotations</div>
        </div>

        <div style={{ background: "#fff", borderRadius: 16, overflow: "hidden", boxShadow: "0 4px 24px rgba(0,0,0,0.06)" }}>
          {quotes.length === 0 ? (
            <div style={{ padding: 48, textAlign: "center", color: "#999", fontSize: 14 }}>No active quotations available.</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f8f9fb" }}>
                  {["Quote #", "Type", "Client", "Destination", "Products", "Total", "Issued", "Valid Until", ""].map(h => (
                    <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: "#888", fontWeight: 700, borderBottom: "2px solid #e8eaed" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {quotes.map(q => {
                  const expired = q.validTill && new Date(q.validTill + "T23:59:59") < new Date();
                  return (
                    <tr key={q.id} style={{ borderBottom: "1px solid #f0f2f5" }}>
                      <td style={{ padding: "14px 16px", fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: "#1e40af" }}>{q.quoteNo}</td>
                      <td style={{ padding: "14px 16px" }}>
                        <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: q.quoteType === "FOB" ? "#f5f3ff" : "#eff6ff", color: q.quoteType === "FOB" ? "#7c3aed" : "#1e40af" }}>{q.quoteType}</span>
                      </td>
                      <td style={{ padding: "14px 16px", fontSize: 13, fontWeight: 600, color: "#1a1a2e" }}>{q.clientName}</td>
                      <td style={{ padding: "14px 16px", fontSize: 13, color: "#555" }}>{q.destination}{q.country ? `, ${q.country}` : ""}</td>
                      <td style={{ padding: "14px 16px", fontSize: 13, color: "#555" }}>{q.productCount} item{q.productCount !== 1 ? "s" : ""}</td>
                      <td style={{ padding: "14px 16px", fontSize: 13, fontWeight: 700, color: "#1e40af" }}>{fmtUSD(q.total)}</td>
                      <td style={{ padding: "14px 16px", fontSize: 12, color: "#888" }}>{fmtDate(q.generatedAt)}</td>
                      <td style={{ padding: "14px 16px", fontSize: 12, color: expired ? "#dc2626" : "#888", fontWeight: expired ? 700 : 400 }}>
                        {expired ? "EXPIRED" : fmtDate(q.validTill + "T00:00:00")}
                      </td>
                      <td style={{ padding: "14px 16px", textAlign: "right" }}>
                        {/* prefetch=false: with many active quotes, Next.js prefetching every visible
                            Link would fire dozens of simultaneous Google Sheets reads on page load —
                            enough to trip Sheets' rate limit and cause failures elsewhere in the app. */}
                        <Link href={`/cnf/share/${q.id}`} prefetch={false} style={{ fontSize: 12, fontWeight: 600, color: "#1e40af", textDecoration: "none" }}>View →</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <p style={{ textAlign: "center", fontSize: 11, color: "#aaa", marginTop: 20 }}>Kafi Commodities · CNF Export Pricing</p>
      </div>
    </div>
  );
}
