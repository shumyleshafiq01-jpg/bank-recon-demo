"use client";

// Shared building blocks for the pixel-matched export documents.
// The Commercial Invoice and Packing List share the KAFI letterhead and the
// multi-line product table; only the price columns differ.

export type DocMaster = {
  id: string;
  pi_number: string | null; pi_date: string | null;
  custom_invoice_no: string | null; custom_invoice_date: string | null;
  commercial_invoice_no: string | null; commercial_invoice_date: string | null;
  consignee_custom: string | null; consignee_actual: string | null;
  buyer_address: string | null; notify_party: string | null;
  container_no: string | null; form_e_no: string | null; terms: string | null;
  bl_no: string | null; bl_date: string | null; vessel: string | null;
  on_board: string | null; destination: string | null;
  no_of_containers: string | null; no_of_packages: string | null; description: string | null;
  net_weight_mt: number | null; gross_weight_mt: number | null;
  net_weight_kgs: number | null; gross_weight_kgs: number | null;
  freight_label: string | null; freight_amount: number | null;
  listing_fee_label: string | null; listing_fee_amount: number | null;
  terms_of_sale: string | null;
  bank_name: string | null; bank_account_name: string | null; bank_account_no: string | null;
  bank_iban: string | null; bank_swift: string | null;
  coo_exporter: string | null; coo_membership_no: string | null; coo_reference_no: string | null;
};

export type DocLine = {
  id: string; line_no: number | null; line_type: string;
  product_name: string | null; packing_spec: string | null;
  per_ctn_weight_kg: number | null; total_cartons: number | null; total_net_kg: number | null;
  hs_code: string | null; unit_price: number | null; unit_basis: string | null;
  amount: number | null; note_text: string | null; sort_order: number;
};

export function fmtDate(d: string | null): string {
  if (!d) return "";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  const day = String(dt.getDate()).padStart(2, "0");
  const mon = dt.toLocaleString("en-US", { month: "short" });
  const yr = String(dt.getFullYear()).slice(2);
  return `${day}-${mon}-${yr}`;
}

export function fmtNum(n: number | null | undefined, dp = 2): string {
  if (n === null || n === undefined || isNaN(n)) return "";
  return n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

export function Letterhead({ title }: { title: string }) {
  return (
    <div style={{ textAlign: "center", borderBottom: "2px solid #000", paddingBottom: 4 }}>
      <div style={{ fontFamily: "Arial Black, Arial, sans-serif", fontStyle: "italic", fontWeight: 900, fontSize: 30, letterSpacing: 1 }}>
        KAFI COMMODITIES (PVT) LTD
      </div>
      <div style={{ fontSize: 9, fontWeight: 700 }}>PLOT: F-50/1, BLOCK-8, CLIFTON, K.D.A. SCHEME # 5, KARACHI-PAKISTAN</div>
      <div style={{ fontSize: 9, fontWeight: 700 }}>TEL: ( 92-21 ) 3586 4834</div>
      <div style={{ fontSize: 17, fontWeight: 700, textDecoration: "underline", marginTop: 2 }}>{title}</div>
    </div>
  );
}

/** The product line block as it appears in the invoice/packing list body. */
export function LineDescription({ line }: { line: DocLine }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontWeight: 700 }}>{line.product_name}</div>
      {line.packing_spec && <div>{line.packing_spec}</div>}
      {line.per_ctn_weight_kg !== null && <div>PER CTN NET WEIGHT: {line.per_ctn_weight_kg} KG</div>}
      {line.total_cartons !== null && (
        <div style={{ fontWeight: 700 }}>
          TOTAL CTN: {line.total_cartons} CTNS{line.total_net_kg !== null ? ` (${fmtNum(line.total_net_kg, 2)} KGS)` : ""}
        </div>
      )}
    </div>
  );
}

export function PrintToolbar() {
  return (
    <div className="no-print" style={{ position: "sticky", top: 0, background: "#1f2937", color: "#fff", padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 10 }}>
      <span style={{ fontSize: 13 }}>Print preview — use your browser&apos;s Print (or Save as PDF) at A4, margins minimal.</span>
      <button onClick={() => window.print()} style={{ background: "#06b6d4", color: "#fff", border: "none", padding: "6px 16px", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
        Print / Save PDF
      </button>
    </div>
  );
}

export const PRINT_PAGE_STYLE = `
  @media print { .no-print { display: none !important; } @page { size: A4; margin: 8mm; } }
  .doc-page { width: 190mm; margin: 0 auto; background: #fff; color: #000; font-family: 'Times New Roman', Georgia, serif; font-size: 11px; padding: 4mm; }
  .doc-sheet-wrap { background: #e5e7eb; padding: 16px 0; min-height: 100vh; }
  .doc-table { width: 100%; border-collapse: collapse; }
  .doc-table td, .doc-table th { border: 1px solid #000; padding: 2px 4px; vertical-align: top; }
`;
