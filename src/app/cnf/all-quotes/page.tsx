import { supabase } from "@/lib/supabase";
import Link from "next/link";

type QuoteRow = {
  id: string; quoteNo: string; clientName: string; destination: string; country: string;
  generatedAt: string; validTill: string; status: string; productCount: number; total: number;
  quoteType: "CNF" | "FOB";
};

async function getQuotes(): Promise<QuoteRow[]> {
  try {
    const { data, error } = await supabase
      .from("cnf_quotes")
      .select("*")
      .eq("status", "active");
    if (error) return [];
    return (data ?? []).map((r) => {
      const products: { qty: number; cnfPerCarton: number }[] = (r.products_snapshot as { qty: number; cnfPerCarton: number }[]) ?? [];
      const subtotal = products.reduce((s, p) => s + (p.cnfPerCarton ?? 0) * (p.qty ?? 0), 0);
      const discountAmount = Number(r.discount_amount) || 0;
      return {
        id: r.id,
        quoteNo: r.quote_no ?? "",
        clientName: r.client_name ?? "",
        destination: r.destination ?? "",
        country: r.country ?? "",
        generatedAt: r.generated_at ?? "",
        validTill: r.valid_till ?? "",
        status: r.status ?? "active",
        productCount: products.length,
        total: subtotal - discountAmount,
        quoteType: (r.quote_type || "CNF") as "CNF" | "FOB",
      };
    });
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
    <div style={{ background: "#f5f7fa", minHeight: "100vh", padding: "40px 24px", fontFamily: "'Segoe UI', Arial, sans-serif" }}>
      <div style={{ maxWidth: 1500, margin: "0 auto" }}>
        <div style={{ background: "linear-gradient(135deg, #1e3a5f 0%, #0f2540 100%)", borderRadius: 16, padding: "36px 44px", color: "#fff", marginBottom: 24 }}>
          <div style={{ fontSize: 28, fontWeight: 800 }}>Kafi Commodities</div>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,0.6)", marginTop: 6, textTransform: "uppercase", letterSpacing: 1.2 }}>CNF Export Quotations</div>
        </div>

        <div style={{ background: "#fff", borderRadius: 16, overflow: "hidden", boxShadow: "0 4px 24px rgba(0,0,0,0.06)" }}>
          {quotes.length === 0 ? (
            <div style={{ padding: 48, textAlign: "center", color: "#999", fontSize: 14 }}>No active quotations available.</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f8f9fb" }}>
                  {["Quote #", "Type", "Client", "Destination", "Products", "Total", "Issued", "Valid Until", ""].map(h => (
                    <th key={h} style={{ padding: "18px 26px", textAlign: "left", fontSize: 13, textTransform: "uppercase", letterSpacing: 1, color: "#888", fontWeight: 700, borderBottom: "2px solid #e8eaed" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {quotes.map(q => {
                  const expired = q.validTill && new Date(q.validTill + "T23:59:59") < new Date();
                  return (
                    <tr key={q.id} style={{ borderBottom: "1px solid #f0f2f5" }}>
                      <td style={{ padding: "20px 26px", fontFamily: "monospace", fontSize: 15, fontWeight: 700, color: "#1e40af", whiteSpace: "nowrap" }}>{q.quoteNo}</td>
                      <td style={{ padding: "20px 26px" }}>
                        <span style={{ fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 5, background: q.quoteType === "FOB" ? "#f5f3ff" : "#eff6ff", color: q.quoteType === "FOB" ? "#7c3aed" : "#1e40af" }}>{q.quoteType}</span>
                      </td>
                      <td style={{ padding: "20px 26px", fontSize: 16, fontWeight: 600, color: "#1a1a2e" }}>{q.clientName}</td>
                      <td style={{ padding: "20px 26px", fontSize: 15, color: "#555" }}>{q.destination}{q.country ? `, ${q.country}` : ""}</td>
                      <td style={{ padding: "20px 26px", fontSize: 15, color: "#555", whiteSpace: "nowrap" }}>{q.productCount} item{q.productCount !== 1 ? "s" : ""}</td>
                      <td style={{ padding: "20px 26px", fontSize: 16, fontWeight: 700, color: "#1e40af", whiteSpace: "nowrap" }}>{fmtUSD(q.total)}</td>
                      <td style={{ padding: "20px 26px", fontSize: 14, color: "#888", whiteSpace: "nowrap" }}>{fmtDate(q.generatedAt)}</td>
                      <td style={{ padding: "20px 26px", fontSize: 14, color: expired ? "#dc2626" : "#888", fontWeight: expired ? 700 : 400, whiteSpace: "nowrap" }}>
                        {expired ? "EXPIRED" : fmtDate(q.validTill + "T00:00:00")}
                      </td>
                      <td style={{ padding: "20px 26px", textAlign: "right" }}>
                        <Link href={`/cnf/share/${q.id}`} prefetch={false} style={{ fontSize: 15, fontWeight: 600, color: "#1e40af", textDecoration: "none", whiteSpace: "nowrap" }}>View →</Link>
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
