"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  DocMaster, DocLine, fmtDate, fmtNum, Letterhead, LineDescription, PrintToolbar, PRINT_PAGE_STYLE,
} from "@/components/export-docs/DocShared";

export default function CommercialInvoicePage() {
  const { id } = useParams();
  const [master, setMaster] = useState<DocMaster | null>(null);
  const [lines, setLines] = useState<DocLine[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/export/documents?shipmentId=${id}`).then(r => r.json()).then(d => {
      setMaster(d.master); setLines(d.lines ?? []); setLoading(false);
    });
  }, [id]);

  if (loading || !master) return <div style={{ padding: 40, fontFamily: "sans-serif" }}>Loading…</div>;

  const products = lines.filter(l => l.line_type === "product");
  const focLines = lines.filter(l => l.line_type === "foc");
  const totalAmount = products.reduce((s, l) => s + (l.amount ?? 0), 0)
    + (master.freight_amount ?? 0) + (master.listing_fee_amount ?? 0);

  return (
    <div className="doc-sheet-wrap">
      <style>{PRINT_PAGE_STYLE}</style>
      <PrintToolbar />
      <div className="doc-page">
        <Letterhead title="COMMERCIAL INVOICE" />

        {/* Invoice no + date */}
        <table className="doc-table" style={{ marginTop: 0, borderTop: "none" }}>
          <tbody>
            <tr>
              <td style={{ border: "none", fontWeight: 700 }}>INVOICE NO: {master.commercial_invoice_no || master.pi_number}</td>
              <td style={{ border: "none", textAlign: "right", width: "35%" }}>
                <span style={{ fontWeight: 700 }}>DATED:&nbsp;&nbsp;</span>{fmtDate(master.commercial_invoice_date)}
              </td>
            </tr>
          </tbody>
        </table>

        {/* Buyer / Seller */}
        <table style={{ width: "100%", borderTop: "1px solid #000", borderBottom: "1px solid #000" }}>
          <tbody>
            <tr>
              <td style={{ width: "55%", verticalAlign: "top", padding: 4 }}>
                <div><b>BUYER:</b> {master.consignee_actual}</div>
                {master.buyer_address && <div style={{ whiteSpace: "pre-wrap", paddingLeft: 8 }}>{master.buyer_address}</div>}
              </td>
              <td style={{ verticalAlign: "top", padding: 4 }}>
                <div><b>SELLER : KAFI COMMODITIES (PVT) LTD</b></div>
                <div>F-50/1, BLOCK-8, CLIFTON, KDA SCHEME # 5, KARACHI-PAKISTAN.</div>
                <div style={{ marginTop: 4 }}>TEL: ( 92-21 ) 3586 4834</div>
              </td>
            </tr>
          </tbody>
        </table>

        {/* Contract block */}
        <table style={{ width: "100%", borderBottom: "1px solid #000" }}>
          <tbody>
            <tr><td style={{ width: 150, padding: "1px 4px" }}><b>CONTRACT #:</b></td><td style={{ padding: "1px 4px" }}>{master.pi_number} <span style={{ float: "right" }}>{fmtDate(master.pi_date)}</span></td></tr>
            <tr><td style={{ padding: "1px 4px" }}><b>TERMS OF PAYMENT:</b></td><td style={{ padding: "1px 4px" }}>{master.terms}</td></tr>
            <tr><td style={{ padding: "1px 4px" }}><b>FORM &lsquo;E&rsquo; NO:</b></td><td style={{ padding: "1px 4px" }}>{master.form_e_no}</td></tr>
            <tr><td style={{ padding: "1px 4px" }}><b>VESSEL NAME:</b></td><td style={{ padding: "1px 4px" }}>{master.vessel}</td></tr>
            <tr><td style={{ padding: "1px 4px" }}><b>B/L NO:</b></td><td style={{ padding: "1px 4px" }}>{master.bl_no} <span style={{ marginLeft: 24 }}>{fmtDate(master.bl_date)}</span></td></tr>
            <tr>
              <td style={{ padding: "1px 4px" }}><b>ON BOARD/DISPATCH :</b></td>
              <td style={{ padding: "1px 4px" }}>
                <b>{master.on_board}</b>
                <span style={{ float: "right", background: "#000", color: "#fff", padding: "0 6px", fontStyle: "italic" }}>DESTINATION: {master.destination}</span>
              </td>
            </tr>
          </tbody>
        </table>

        {/* Main goods table */}
        <table className="doc-table" style={{ marginTop: 0, borderTop: "none" }}>
          <thead>
            <tr>
              <th style={{ width: "16%" }}></th>
              <th>DESCRIPTION OF GOODS AND / OR SERVICES</th>
              <th style={{ width: "16%" }}>Unit Prices</th>
              <th style={{ width: "18%" }}>Total Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ textAlign: "center", fontWeight: 700 }}>
                CONTAINER<br />{master.no_of_containers}
                <div style={{ marginTop: 16 }}>{master.container_no}</div>
              </td>
              <td>
                <div style={{ fontWeight: 700, textDecoration: "underline", marginBottom: 6 }}>{master.description}</div>
                {products.map((l, i) => (
                  <table key={l.id} style={{ width: "100%" }}><tbody><tr>
                    <td style={{ border: "none", width: 16, verticalAlign: "top", fontWeight: 700 }}>{l.line_no ?? i + 1}</td>
                    <td style={{ border: "none", padding: 0 }}><LineDescription line={l} /></td>
                  </tr></tbody></table>
                ))}
                {focLines.length > 0 && (
                  <div style={{ marginTop: 4 }}>
                    <div style={{ fontWeight: 700, textDecoration: "underline" }}>FOC (Free of Cost) = {focLines.reduce((s, l) => s + (l.total_cartons ?? 0), 0)} CARTONS</div>
                    {focLines.map(l => <div key={l.id}>{l.note_text || l.product_name}</div>)}
                  </div>
                )}
                <div style={{ marginTop: 8 }}>
                  <div><b>TOTAL NO. OF CARTONS: {master.no_of_packages}</b></div>
                  <div><b>TOTAL NO. OF CONTAINERS: {master.no_of_containers}</b></div>
                  <div><b>TERMS OF SALE: {master.terms_of_sale}</b></div>
                </div>
              </td>
              <td style={{ verticalAlign: "top" }}>
                {products.map(l => (
                  <div key={l.id} style={{ textAlign: "center", marginBottom: 8, minHeight: 44 }}>
                    <div>AT</div><div><b>USD {fmtNum(l.unit_price)}</b></div><div>{l.unit_basis}</div>
                  </div>
                ))}
              </td>
              <td style={{ verticalAlign: "top" }}>
                {products.map(l => (
                  <div key={l.id} style={{ textAlign: "right", marginBottom: 8, minHeight: 44 }}>$&nbsp;&nbsp;&nbsp;{fmtNum(l.amount)}</div>
                ))}
                {master.freight_amount !== null && <div style={{ textAlign: "right", marginTop: 8 }}>$&nbsp;&nbsp;&nbsp;{fmtNum(master.freight_amount)}</div>}
                {master.listing_fee_amount !== null && <div style={{ textAlign: "right" }}>$&nbsp;&nbsp;&nbsp;{fmtNum(master.listing_fee_amount)}</div>}
              </td>
            </tr>
            {/* Freight / listing labels row inside description already handled; weights */}
            <tr>
              <td style={{ border: "none" }}></td>
              <td colSpan={2} style={{ fontWeight: 700 }}>NET WEIGHT&nbsp;&nbsp;&nbsp;{fmtNum(master.net_weight_kgs)} KGS</td>
              <td style={{ fontWeight: 700, textAlign: "right" }}>{fmtNum(master.net_weight_mt)} M.TONS</td>
            </tr>
            <tr>
              <td style={{ border: "none" }}></td>
              <td colSpan={2} style={{ fontWeight: 700 }}>GROSS WEIGHT&nbsp;&nbsp;&nbsp;{fmtNum(master.gross_weight_kgs)} KGS</td>
              <td style={{ fontWeight: 700, textAlign: "right" }}>{fmtNum(master.gross_weight_mt)} M.TONS</td>
            </tr>
          </tbody>
        </table>

        {/* Totals + certify */}
        <table className="doc-table" style={{ borderTop: "none" }}>
          <tbody>
            <tr>
              <td colSpan={2} style={{ fontWeight: 700 }}>WE CERTIFY THAT THE ABOVE GOODS ARE OF PAKISTAN ORIGIN.</td>
              <td style={{ fontWeight: 700 }}>TOTALS</td>
              <td style={{ textAlign: "right", fontWeight: 700 }}>$&nbsp;&nbsp;&nbsp;{fmtNum(totalAmount)}</td>
            </tr>
            <tr>
              <td colSpan={2} style={{ textAlign: "center", fontStyle: "italic" }}>M/S.KAFI COMMODITIES (PVT) LTD</td>
              <td colSpan={2} style={{ textAlign: "center" }}>FOR KAFI COMMODITIES (PVT) LTD</td>
            </tr>
          </tbody>
        </table>

        {/* Payment instructions */}
        <div style={{ marginTop: 6 }}>
          <div style={{ fontWeight: 700, fontSize: 9 }}>F-50/1, BLOCK-8, CLIFTON, KDA SCHEME # 5, KARACHI-PAKISTAN TEL: ( 92-21 ) 3586 4834</div>
          <div style={{ fontWeight: 700, marginTop: 4 }}>PAYMENT INSTRUCTIONS:</div>
          <div>BANK NAME: {master.bank_name}</div>
          <div>ACCOUNT NAME: {master.bank_account_name}</div>
          <div>ACCOUNT NO: {master.bank_account_no}</div>
          <div>IBAN NO: {master.bank_iban}</div>
          <div>SWIFT CODE: {master.bank_swift}</div>
        </div>
      </div>
    </div>
  );
}
