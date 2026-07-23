"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  DocMaster, DocLine, fmtDate, fmtNum, Letterhead, LineDescription, PrintToolbar, PRINT_PAGE_STYLE,
} from "@/components/export-docs/DocShared";

export default function PackingListPage() {
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

  return (
    <div className="doc-sheet-wrap">
      <style>{PRINT_PAGE_STYLE}</style>
      <PrintToolbar />
      <div className="doc-page">
        <Letterhead title="PACKING LIST" />

        <table style={{ width: "100%" }}>
          <tbody>
            <tr>
              <td style={{ fontWeight: 700, padding: "2px 4px" }}>INVOICE NO: {master.commercial_invoice_no || master.pi_number}</td>
              <td style={{ textAlign: "right", width: "35%", padding: "2px 4px" }}><b>DATED:&nbsp;&nbsp;</b>{fmtDate(master.commercial_invoice_date)}</td>
            </tr>
          </tbody>
        </table>

        <table style={{ width: "100%", borderTop: "1px solid #000", borderBottom: "1px solid #000" }}>
          <tbody>
            <tr>
              <td style={{ width: "55%", verticalAlign: "top", padding: 4 }}>
                <div><b>BUYER : {master.consignee_actual}</b></div>
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

        <table style={{ width: "100%", borderBottom: "1px solid #000" }}>
          <tbody>
            <tr><td style={{ width: 150, padding: "1px 4px" }}><b>CONTRACT #:</b></td><td style={{ padding: "1px 4px" }}>{master.pi_number} <span style={{ float: "right" }}>{fmtDate(master.pi_date)}</span></td></tr>
            <tr><td style={{ padding: "1px 4px" }}><b>TERMS OF PAYMENT:</b></td><td style={{ padding: "1px 4px" }}>{master.terms}</td></tr>
            <tr><td style={{ padding: "1px 4px" }}><b>FORM &lsquo;E&rsquo; NO:</b></td><td style={{ padding: "1px 4px" }}>{master.form_e_no}</td></tr>
            <tr><td style={{ padding: "1px 4px" }}><b>VESSEL NAME:</b></td><td style={{ padding: "1px 4px" }}>{master.vessel}</td></tr>
            <tr><td style={{ padding: "1px 4px" }}><b>B/L NO:</b></td><td style={{ padding: "1px 4px" }}>{master.bl_no} <span style={{ marginLeft: 24 }}>{fmtDate(master.bl_date)}</span></td></tr>
            <tr>
              <td style={{ padding: "1px 4px" }}><b>ON BOARD/DISPATCH :</b></td>
              <td style={{ padding: "1px 4px" }}><b>{master.on_board}</b><span style={{ float: "right", background: "#000", color: "#fff", padding: "0 6px", fontStyle: "italic" }}>DESTINATION: {master.destination}</span></td>
            </tr>
          </tbody>
        </table>

        <table className="doc-table" style={{ borderTop: "none" }}>
          <thead><tr><th style={{ width: "16%" }}></th><th>DESCRIPTION OF GOODS AND / OR SERVICES</th><th style={{ width: "22%" }}></th></tr></thead>
          <tbody>
            <tr>
              <td style={{ textAlign: "center", fontWeight: 700 }}>CONTAINER<br />{master.no_of_containers}<div style={{ marginTop: 16 }}>{master.container_no}</div></td>
              <td>
                <div style={{ fontWeight: 700, textDecoration: "underline", marginBottom: 6 }}>{master.description}</div>
                {products.map((l, i) => (
                  <table key={l.id} style={{ width: "100%" }}><tbody><tr>
                    <td style={{ border: "none", width: 16, verticalAlign: "top", fontWeight: 700 }}>{l.line_no ?? i + 1}</td>
                    <td style={{ border: "none", padding: 0 }}><LineDescription line={l} /></td>
                  </tr></tbody></table>
                ))}
                <div style={{ marginTop: 8 }}>
                  <div><b>TOTAL NO. OF CARTONS: {master.no_of_packages}</b></div>
                  <div><b>TOTAL NO. OF CONTAINERS: {master.no_of_containers}</b></div>
                  <div><b>TERMS OF SALE: {master.terms_of_sale}</b></div>
                </div>
              </td>
              <td></td>
            </tr>
          </tbody>
        </table>

        {/* Container / cartons / weights summary */}
        <table className="doc-table" style={{ borderTop: "none" }}>
          <thead><tr>
            <th>CONTAINER NO.</th><th>TOTAL CARTONS</th><th>TOTAL NET WEIGHT</th><th>TOTAL GROSS WEIGHT</th>
          </tr></thead>
          <tbody><tr>
            <td style={{ textAlign: "center" }}>{master.container_no}</td>
            <td style={{ textAlign: "center", fontWeight: 700 }}>{master.no_of_packages}</td>
            <td style={{ textAlign: "center", fontWeight: 700 }}>{fmtNum(master.net_weight_kgs)} KGS</td>
            <td style={{ textAlign: "center", fontWeight: 700 }}>{fmtNum(master.gross_weight_kgs)} KGS</td>
          </tr></tbody>
        </table>

        <table className="doc-table" style={{ borderTop: "none" }}>
          <tbody>
            <tr><td style={{ fontWeight: 700 }}>WE CERTIFY THAT THE ABOVE GOODS ARE OF PAKISTAN ORIGIN.</td></tr>
            <tr><td style={{ textAlign: "center", fontStyle: "italic", height: 60, verticalAlign: "bottom" }}>M/S.KAFI COMMODITIES (PVT) LTD &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; FOR KAFI COMMODITIES (PVT) LTD</td></tr>
            <tr><td style={{ textAlign: "center", fontWeight: 700, fontSize: 9 }}>F-50/1, BLOCK-8, CLIFTON, KDA SCHEME # 5, KARACHI-PAKISTAN TEL: ( 92-21 ) 3586 4834</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
