"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, FileText, Plus, Trash2, ExternalLink, Save, Check } from "lucide-react";
import type { DocMaster, DocLine } from "@/components/export-docs/DocShared";

const DOCS = [
  { key: "commercial-invoice", label: "Commercial Invoice", ready: true },
  { key: "packing-list", label: "Packing List", ready: true },
  { key: "custom-invoice", label: "Custom Invoice", ready: false },
  { key: "certificate-of-origin", label: "Certificate of Origin", ready: false },
  { key: "phyto", label: "Phyto Invoice", ready: false },
  { key: "bl-draft", label: "BL Draft", ready: false },
  { key: "covering-letter-bank", label: "Covering Letter (Bank)", ready: false },
  { key: "covering-letter-customer", label: "Covering Letter (Customer)", ready: false },
];

export default function DocumentsMasterPage() {
  const { id } = useParams();
  const router = useRouter();
  const [master, setMaster] = useState<DocMaster | null>(null);
  const [lines, setLines] = useState<DocLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/export/documents?shipmentId=${id}`);
    const d = await r.json();
    setMaster(d.master); setLines(d.lines ?? []); setLoading(false);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  function setField(field: keyof DocMaster, value: string) {
    setMaster(m => m && ({ ...m, [field]: value }));
  }

  async function saveMaster() {
    if (!master) return;
    await fetch("/api/export/documents", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update-master", ...master }),
    });
    setSavedAt(new Date().toLocaleTimeString());
  }

  async function addLine(lineType: string) {
    if (!master) return;
    const r = await fetch("/api/export/documents", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add-line", masterId: master.id, lineType }),
    });
    const d = await r.json();
    if (d.line) setLines(prev => [...prev, d.line]);
  }

  function setLineField(lineId: string, field: keyof DocLine, value: string | number) {
    setLines(prev => prev.map(l => l.id === lineId ? { ...l, [field]: value } : l));
  }

  async function saveLine(line: DocLine) {
    await fetch("/api/export/documents", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update-line", ...line }),
    });
  }

  async function deleteLine(lineId: string) {
    await fetch("/api/export/documents", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete-line", id: lineId }),
    });
    setLines(prev => prev.filter(l => l.id !== lineId));
  }

  if (loading || !master) return <div className="min-h-screen flex items-center justify-center" style={{ background: "#e8ecf1" }}><div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" /></div>;

  const F = (label: string, field: keyof DocMaster, opts: { type?: string; wide?: boolean; area?: boolean } = {}) => (
    <div className={opts.wide ? "col-span-2" : ""}>
      <label className="text-xs text-gray-500 mb-1 block">{label}</label>
      {opts.area ? (
        <textarea value={(master[field] as string) ?? ""} onChange={e => setField(field, e.target.value)} onBlur={saveMaster} rows={2}
          className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-cyan-500/50" />
      ) : (
        <input type={opts.type || "text"} value={(master[field] as string | number) ?? ""} onChange={e => setField(field, e.target.value)} onBlur={saveMaster}
          className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-cyan-500/50" />
      )}
    </div>
  );

  const section = (title: string) => <h3 className="text-sm font-bold text-gray-800 mt-6 mb-2 border-b border-gray-200 pb-1">{title}</h3>;

  return (
    <div className="min-h-screen" style={{ background: "#e8ecf1" }}>
      <div className="max-w-5xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push(`/export/shipments/${id}`)} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 cursor-pointer">
              <ChevronLeft className="w-4 h-4" /> Shipment
            </button>
            <div className="w-px h-5 bg-gray-300" />
            <div className="flex items-center gap-2"><FileText className="w-5 h-5 text-cyan-600" /><h1 className="text-lg font-bold text-gray-900">Document Master</h1></div>
          </div>
          <button onClick={saveMaster} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-cyan-600 hover:bg-cyan-500 text-white cursor-pointer">
            {savedAt ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />} {savedAt ? `Saved ${savedAt}` : "Save"}
          </button>
        </div>

        {/* Generate documents */}
        <div className="rounded-xl bg-white/70 border border-gray-200/80 p-4 mb-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Generate Documents</h3>
          <p className="text-xs text-gray-500 mb-3">Fill the master data below, then open any document to print or save as PDF. All documents pull from this one master.</p>
          <div className="flex flex-wrap gap-2">
            {DOCS.map(d => d.ready ? (
              <a key={d.key} href={`/export/shipments/${id}/documents/${d.key}`} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-cyan-500/10 text-cyan-700 hover:bg-cyan-500/20 cursor-pointer">
                <ExternalLink className="w-3.5 h-3.5" /> {d.label}
              </a>
            ) : (
              <span key={d.key} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-gray-100 text-gray-400 cursor-not-allowed" title="Coming next">
                {d.label} <span className="text-[10px]">soon</span>
              </span>
            ))}
          </div>
        </div>

        {/* Master data form */}
        <div className="rounded-xl bg-white/70 border border-gray-200/80 p-5">
          {section("Invoice Identifiers")}
          <div className="grid grid-cols-2 gap-3">
            {F("Proforma Invoice #", "pi_number")}
            {F("Proforma Invoice Date", "pi_date", { type: "date" })}
            {F("Commercial Invoice #", "commercial_invoice_no")}
            {F("Commercial Invoice Date", "commercial_invoice_date", { type: "date" })}
            {F("Custom Invoice #", "custom_invoice_no")}
            {F("Custom Invoice Date", "custom_invoice_date", { type: "date" })}
          </div>

          {section("Parties")}
          <div className="grid grid-cols-2 gap-3">
            {F("Consignee (Custom)", "consignee_custom", { wide: true })}
            {F("Consignee (Actual)", "consignee_actual", { wide: true })}
            {F("Buyer Address Block", "buyer_address", { wide: true, area: true })}
            {F("Notify Party", "notify_party", { wide: true, area: true })}
          </div>

          {section("Shipment & Transport")}
          <div className="grid grid-cols-2 gap-3">
            {F("Container #", "container_no")}
            {F("Form ‘E’ # & Date", "form_e_no")}
            {F("Terms", "terms", { wide: true })}
            {F("BL #", "bl_no")}
            {F("BL Date", "bl_date", { type: "date" })}
            {F("Vessel", "vessel")}
            {F("On Board", "on_board")}
            {F("Destination", "destination")}
            {F("No. of Containers", "no_of_containers")}
            {F("No. of Packages", "no_of_packages")}
            {F("Description", "description", { wide: true })}
          </div>

          {section("Weights")}
          <div className="grid grid-cols-2 gap-3">
            {F("Net Weight (M.TONS)", "net_weight_mt", { type: "number" })}
            {F("Gross Weight (M.TONS)", "gross_weight_mt", { type: "number" })}
            {F("Net Weight (KGS)", "net_weight_kgs", { type: "number" })}
            {F("Gross Weight (KGS)", "gross_weight_kgs", { type: "number" })}
          </div>

          {section("Charges & Terms of Sale")}
          <div className="grid grid-cols-2 gap-3">
            {F("Freight Label", "freight_label")}
            {F("Freight Amount", "freight_amount", { type: "number" })}
            {F("Listing Fee Label", "listing_fee_label")}
            {F("Listing Fee Amount (negative)", "listing_fee_amount", { type: "number" })}
            {F("Terms of Sale", "terms_of_sale", { wide: true })}
          </div>

          {section("Bank / Payment Instructions")}
          <div className="grid grid-cols-2 gap-3">
            {F("Bank Name", "bank_name")}
            {F("Account Name", "bank_account_name")}
            {F("Account No", "bank_account_no")}
            {F("IBAN", "bank_iban")}
            {F("SWIFT", "bank_swift")}
          </div>

          {section("Certificate of Origin")}
          <div className="grid grid-cols-2 gap-3">
            {F("COO Exporter Block", "coo_exporter", { wide: true, area: true })}
            {F("Membership No", "coo_membership_no")}
            {F("Reference No", "coo_reference_no")}
          </div>
        </div>

        {/* Line items */}
        <div className="rounded-xl bg-white/70 border border-gray-200/80 p-5 mt-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-gray-800">Line Items</h3>
            <div className="flex gap-2">
              <button onClick={() => addLine("product")} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-cyan-500/10 text-cyan-700 hover:bg-cyan-500/20 cursor-pointer"><Plus className="w-3.5 h-3.5" /> Product</button>
              <button onClick={() => addLine("foc")} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-gray-100 text-gray-600 hover:bg-gray-200 cursor-pointer"><Plus className="w-3.5 h-3.5" /> FOC</button>
            </div>
          </div>
          <div className="space-y-3">
            {lines.map(l => (
              <div key={l.id} className="border border-gray-200 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-gray-500">#{l.line_no} · {l.line_type}</span>
                  <button onClick={() => deleteLine(l.id)} className="p-1 rounded hover:bg-red-500/10 text-gray-300 hover:text-red-600 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
                {l.line_type === "product" ? (
                  <div className="grid grid-cols-4 gap-2">
                    <input placeholder="Product name (bold)" value={l.product_name ?? ""} onChange={e => setLineField(l.id, "product_name", e.target.value)} onBlur={() => saveLine(l)} className="col-span-4 bg-white border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-cyan-500/50" />
                    <input placeholder="Packing spec (500 GMS X 20...)" value={l.packing_spec ?? ""} onChange={e => setLineField(l.id, "packing_spec", e.target.value)} onBlur={() => saveLine(l)} className="col-span-4 bg-white border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-cyan-500/50" />
                    <input placeholder="Per ctn wt (kg)" type="number" value={l.per_ctn_weight_kg ?? ""} onChange={e => setLineField(l.id, "per_ctn_weight_kg", Number(e.target.value))} onBlur={() => saveLine(l)} className="bg-white border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-cyan-500/50" />
                    <input placeholder="Total cartons" type="number" value={l.total_cartons ?? ""} onChange={e => setLineField(l.id, "total_cartons", Number(e.target.value))} onBlur={() => saveLine(l)} className="bg-white border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-cyan-500/50" />
                    <input placeholder="Total net (kg)" type="number" value={l.total_net_kg ?? ""} onChange={e => setLineField(l.id, "total_net_kg", Number(e.target.value))} onBlur={() => saveLine(l)} className="bg-white border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-cyan-500/50" />
                    <input placeholder="HS code" value={l.hs_code ?? ""} onChange={e => setLineField(l.id, "hs_code", e.target.value)} onBlur={() => saveLine(l)} className="bg-white border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-cyan-500/50" />
                    <input placeholder="Unit price (USD)" type="number" value={l.unit_price ?? ""} onChange={e => setLineField(l.id, "unit_price", Number(e.target.value))} onBlur={() => saveLine(l)} className="bg-white border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-cyan-500/50" />
                    <input placeholder="Unit basis" value={l.unit_basis ?? ""} onChange={e => setLineField(l.id, "unit_basis", e.target.value)} onBlur={() => saveLine(l)} className="bg-white border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-cyan-500/50" />
                    <input placeholder="Amount (USD)" type="number" value={l.amount ?? ""} onChange={e => setLineField(l.id, "amount", Number(e.target.value))} onBlur={() => saveLine(l)} className="bg-white border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-cyan-500/50" />
                  </div>
                ) : (
                  <input placeholder="FOC / note text" value={l.note_text ?? ""} onChange={e => setLineField(l.id, "note_text", e.target.value)} onBlur={() => saveLine(l)} className="w-full bg-white border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-cyan-500/50" />
                )}
              </div>
            ))}
            {lines.length === 0 && <p className="text-xs text-gray-400 text-center py-6">No line items yet — add products above.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
