import { supabase } from "@/lib/supabase";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import PrintButton from "../PrintButton";

type QuoteProduct = {
  productId?: string; productName: string; sku: string; specs: string; packagingDesc: string;
  qty: number; fobPerCarton: number; freightPerCarton: number; cnfPerCarton: number;
  category?: string; imageUrl?: string; brandName?: string;
};

type Brand = { id: string; name: string; contactPerson: string; website: string; email: string };

type Quote = {
  id: string; quoteNo: string; clientName: string; clientContact: string;
  destination: string; country: string; generatedAt: string; validTill: string;
  status: string; createdBy: string; brandKafi: boolean; brandEssence: boolean;
  notes: string; products: QuoteProduct[];
  quoteType: "CNF" | "FOB";
  discountType: "none" | "percent" | "amount";
  discountScope: "all" | "specific";
  discountValue: number; discountAmount: number; discountProductIds: string[];
  shipmentPort: string; shippingMode: string; leadTime: string;
};

type GetQuoteResult =
  | { status: "ok"; quote: Quote }
  | { status: "not_found" }
  | { status: "error" };

function rowToQuote(row: Record<string, unknown>): Quote {
  return {
    id: String(row.id ?? ""),
    quoteNo: String(row.quote_no ?? ""),
    clientName: String(row.client_name ?? ""),
    clientContact: String(row.client_contact ?? ""),
    destination: String(row.destination ?? ""),
    country: String(row.country ?? ""),
    generatedAt: String(row.generated_at ?? ""),
    validTill: String(row.valid_till ?? ""),
    status: String(row.status ?? "active"),
    createdBy: String(row.created_by ?? ""),
    brandKafi: row.brand_kafi !== false,
    brandEssence: row.brand_essence === true,
    notes: String(row.notes ?? ""),
    products: (row.products_snapshot as QuoteProduct[]) ?? [],
    quoteType: (row.quote_type || "CNF") as "CNF" | "FOB",
    discountType: (row.discount_type || "none") as "none" | "percent" | "amount",
    discountScope: (row.discount_scope || "all") as "all" | "specific",
    discountValue: Number(row.discount_value) || 0,
    discountAmount: Number(row.discount_amount) || 0,
    discountProductIds: (row.discount_product_ids as string[]) ?? [],
    shipmentPort: String(row.shipment_port || "Karachi Port"),
    shippingMode: String(row.shipping_mode || "By Sea"),
    leadTime: String(row.lead_time || "30 to 35 Working Days"),
  };
}

async function getQuote(id: string): Promise<GetQuoteResult> {
  try {
    const { data, error } = await supabase
      .from("cnf_quotes")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) return { status: "error" };
    if (!data) return { status: "not_found" };
    return { status: "ok", quote: rowToQuote(data) };
  } catch {
    return { status: "error" };
  }
}

async function getBrands(): Promise<Brand[]> {
  try {
    const { data, error } = await supabase.from("pl_brands").select("*");
    if (error) return [];
    return (data ?? []).map((r) => ({
      id: String(r.id ?? ""),
      name: String(r.name ?? ""),
      contactPerson: String(r.contact_person ?? ""),
      website: String(r.website ?? ""),
      email: String(r.email ?? ""),
    }));
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const result = await getQuote(id);
  return { title: result.status === "ok" ? `${result.quote.quoteNo} — CNF Price Quotation` : "CNF Quote" };
}

function fmtDate(iso: string) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }); }
  catch { return iso; }
}

function fmtUSD(n: number) { return n.toFixed(2); }

// Per-product breakdown of the quote-level discount, so each row can show its
// own "before → after" price instead of one lump total at the bottom.
function itemDiscount(
  item: QuoteProduct, allItems: QuoteProduct[],
  discountType: "none" | "percent" | "amount", discountScope: "all" | "specific",
  discountValue: number, discountProductIds: string[],
): { original: number; discounted: number; hasDiscount: boolean } {
  const original = item.cnfPerCarton * item.qty;
  if (discountType === "none" || discountValue <= 0) return { original, discounted: original, hasDiscount: false };

  const scoped = discountScope === "all" ? allItems : allItems.filter(p => p.productId && discountProductIds.includes(p.productId));
  const inScope = discountScope === "all" || (item.productId ? discountProductIds.includes(item.productId) : false);
  if (!inScope) return { original, discounted: original, hasDiscount: false };

  let cut: number;
  if (discountType === "percent") {
    cut = original * (discountValue / 100);
  } else {
    const scopedSubtotal = scoped.reduce((s, p) => s + p.cnfPerCarton * p.qty, 0);
    cut = scopedSubtotal > 0 ? (original / scopedSubtotal) * discountValue : 0;
  }
  cut = Math.min(cut, original);
  return { original, discounted: Math.round((original - cut) * 100) / 100, hasDiscount: cut > 0 };
}

export default async function CNFSharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [result, brands] = await Promise.all([getQuote(id), getBrands()]);

  if (result.status === "not_found") notFound();

  if (result.status === "error") {
    return (
      <div style={{ background: "#f5f7fa", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ background: "#fff", borderRadius: 16, padding: "40px 32px", maxWidth: 420, textAlign: "center", boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }}>
          <p style={{ fontSize: 15, fontWeight: 700, color: "#dc2626", marginBottom: 8 }}>Couldn&apos;t load this quotation</p>
          <p style={{ fontSize: 13, color: "#888", marginBottom: 20 }}>This is just a connection hiccup — the quote is still there, nothing was deleted. Please try again.</p>
          <a href={`/cnf/share/${id}`} style={{ display: "inline-block", padding: "10px 24px", background: "#1e40af", color: "#fff", borderRadius: 10, fontSize: 13, fontWeight: 700, textDecoration: "none" }}>Retry</a>
        </div>
      </div>
    );
  }

  const quote = result.quote;
  const isFob = quote.quoteType === "FOB";
  const isExpired = quote.validTill && new Date(quote.validTill + "T23:59:59") < new Date();

  // Both logos are always fixed on every quote — contact info is always Kafi's,
  // regardless of which brand a given product row belongs to.
  const kafiBrand = brands.find(b => b.name.toLowerCase().includes("kafi"));
  const contactBrand = kafiBrand;

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
        <div className="share-page" style={{ maxWidth: 1300, margin: "0 auto", background: "#fff", boxShadow: "0 4px 24px rgba(0,0,0,0.08)", border: "1px solid #1a1a2e" }}>

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
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "24px 32px", borderBottom: "2px solid #1a1a2e" }}>
            <div style={{ height: 100, display: "flex", alignItems: "center" }}>
              <img src="/brands/essence-logo.jpeg" alt="Essence" style={{ height: 100, objectFit: "contain" }} />
            </div>
            <div style={{ height: 100, display: "flex", alignItems: "center" }}>
              <img src="/brands/kafi-logo.jpeg" alt="Kafi Commodities" style={{ height: 100, objectFit: "contain" }} />
            </div>
          </div>

          {/* Terms & Contact bar */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", background: "#dfe6f2", borderBottom: "1px solid #c7d2e6" }}>
            <div style={{ padding: "14px 24px", borderRight: "1px solid #c7d2e6", fontSize: 15, color: "#1a1a2e" }}>
              <div style={{ fontWeight: 700, textDecoration: "underline", marginBottom: 6, textAlign: "center" }}>Terms &amp; Condition</div>
              <div style={{ textAlign: "center" }}>Shipment Port: {quote.shipmentPort}</div>
              <div style={{ textAlign: "center" }}>Shipping: {quote.shippingMode}</div>
              <div style={{ textAlign: "center" }}>Lead Time: {quote.leadTime}</div>
            </div>
            <div style={{ padding: "14px 24px", fontSize: 15, color: "#1a1a2e", textAlign: "center" }}>
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
                <div style={{ background: "#1e3a5f", color: "#fff", textAlign: "center", padding: "12px 12px", fontSize: 22, fontWeight: 700, textDecoration: "underline" }}>
                  {cat.toUpperCase()}
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
                  <colgroup>
                    <col style={{ width: "6%" }} />
                    <col style={{ width: "22%" }} />
                    <col style={{ width: "30%" }} />
                    <col style={{ width: "20%" }} />
                    <col style={{ width: "22%" }} />
                  </colgroup>
                  <thead>
                    <tr>
                      {["S.No", "Product", "Packaging", priceHeader, "Images"].map((h, i) => (
                        <th key={i} style={{ padding: "14px 10px", textAlign: "center", fontSize: 19, fontWeight: 700, color: "#1a1a2e", border: "1px solid #1a1a2e", background: "#fff", wordWrap: "break-word", overflowWrap: "break-word" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((p, i) => (
                      <tr key={i} style={{ background: "#fff" }}>
                        <td style={{ padding: "18px 10px", textAlign: "center", fontSize: 20, fontWeight: 700, border: "1px solid #1a1a2e", background: "#dfe6f2" }}>{i + 1}</td>
                        <td style={{ padding: "18px 10px", textAlign: "center", fontSize: 22, fontWeight: 700, color: "#1a1a2e", border: "1px solid #1a1a2e", wordWrap: "break-word", overflowWrap: "break-word" }}>{p.productName}{p.brandName ? ` - ${p.brandName}` : ""}</td>
                        <td style={{ padding: "18px 10px", textAlign: "center", fontSize: 18, fontWeight: 600, color: "#1a1a2e", border: "1px solid #1a1a2e", whiteSpace: "pre-line", wordWrap: "break-word", overflowWrap: "break-word", background: "#dfe6f2" }}>{p.specs || p.packagingDesc || "—"}</td>
                        <td style={{ padding: "18px 10px", fontSize: 24, fontWeight: 700, color: "#1a1a2e", border: "1px solid #1a1a2e", wordWrap: "break-word", overflowWrap: "break-word" }}>
                          {(() => {
                            const { original, discounted, hasDiscount } = itemDiscount(
                              p, quote.products, quote.discountType, quote.discountScope, quote.discountValue, quote.discountProductIds,
                            );
                            if (!hasDiscount) return (
                              <div style={{ display: "flex", justifyContent: "space-between", padding: "0 8px" }}>
                                <span>$</span><span>{fmtUSD(original)}</span>
                              </div>
                            );
                            const pct = original > 0 ? Math.round(((original - discounted) / original) * 100) : 0;
                            return (
                              <div style={{ padding: "0 8px" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 17, fontWeight: 500, color: "#dc2626", textDecoration: "line-through" }}>
                                  <span>$</span><span>{fmtUSD(original)}</span>
                                </div>
                                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
                                  <span>$</span><span>{fmtUSD(discounted)}</span>
                                </div>
                                <div style={{ textAlign: "center", fontSize: 16, fontWeight: 700, color: "#dc2626", marginTop: 3 }}>
                                  Discount {pct}% applied
                                </div>
                              </div>
                            );
                          })()}
                        </td>
                        <td style={{ padding: "10px", textAlign: "center", border: "1px solid #1a1a2e" }}>
                          {p.imageUrl ? (
                            <img src={p.imageUrl} alt={p.productName} style={{ width: 130, height: 160, objectFit: "contain", margin: "0 auto" }} />
                          ) : (
                            <div style={{ width: 130, height: 160, background: "#f0f2f5", margin: "0 auto" }} />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}

          {/* Notes */}
          {quote.notes && (
            <div style={{ margin: "20px 32px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: "14px 18px", fontSize: 15, color: "#92400e" }}>
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
