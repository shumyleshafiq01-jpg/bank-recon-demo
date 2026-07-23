"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ChevronLeft, Ship, Plus, X, Loader2, Check, Settings, ExternalLink, Trash2,
} from "lucide-react";

type Shipment = {
  id: string; sales_order_ref: string | null; buyer_name: string; country: string | null;
  pi_number: string | null; stage: string; sop_method: string; drive_folder_link: string | null;
  created_at: string;
};

type Template = { id: string; label: string; country: string | null; buyer_name: string | null; sop_method: string; document_types: string[] };

const STAGES = [
  { key: "pi", label: "PI" }, { key: "freight", label: "Freight" }, { key: "fi_cpd", label: "FI/CPD" },
  { key: "aflatoxin", label: "Aflatoxin" }, { key: "cro_docs", label: "CRO/Docs" },
  { key: "checklist", label: "Checklist" }, { key: "courier", label: "Courier" }, { key: "done", label: "Done" },
];
const stageLabel = (k: string) => STAGES.find(s => s.key === k)?.label ?? k;
const stageColor = (k: string) => k === "done" ? "bg-emerald-100 text-emerald-700" : "bg-cyan-100 text-cyan-700";

export default function ExportHubPage() {
  const router = useRouter();
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);

  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    salesOrderRef: "", buyerName: "", country: "", piNumber: "",
    advancePaymentPct: "", accountantEmail: "", templateId: "",
  });

  async function load() {
    setLoading(true);
    const [sRes, tRes] = await Promise.all([
      fetch("/api/export/shipments").then(r => r.json()),
      fetch("/api/export/templates").then(r => r.json()),
    ]);
    setShipments(sRes.shipments ?? []);
    setTemplates(tRes.templates ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function createShipment() {
    if (!form.buyerName.trim()) return;
    setCreating(true);
    try {
      const r = await fetch("/api/export/shipments", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create-shipment",
          salesOrderRef: form.salesOrderRef, buyerName: form.buyerName, country: form.country,
          piNumber: form.piNumber, advancePaymentPct: form.advancePaymentPct ? Number(form.advancePaymentPct) : null,
          accountantEmail: form.accountantEmail, templateId: form.templateId || null,
        }),
      });
      const d = await r.json();
      if (d.id) {
        setShowCreate(false);
        setForm({ salesOrderRef: "", buyerName: "", country: "", piNumber: "", advancePaymentPct: "", accountantEmail: "", templateId: "" });
        router.push(`/export/shipments/${d.id}`);
      }
    } finally {
      setCreating(false);
    }
  }

  async function deleteShipment(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Delete this shipment file?")) return;
    await fetch("/api/export/shipments", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete-shipment", id }),
    });
    setShipments(prev => prev.filter(s => s.id !== id));
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center" style={{ background: "#e8ecf1" }}><div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="min-h-screen" style={{ background: "#e8ecf1" }}>
      <div className="max-w-6xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push("/")} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors cursor-pointer">
              <ChevronLeft className="w-4 h-4" /> AI Agent
            </button>
            <div className="w-px h-5 bg-gray-300" />
            <div className="flex items-center gap-2">
              <Ship className="w-5 h-5 text-cyan-600" />
              <h1 className="text-lg font-bold text-gray-900">Export Department</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => router.push("/export/templates")} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors cursor-pointer">
              <Settings className="w-4 h-4" /> Document Templates
            </button>
            <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-cyan-500/10 text-cyan-700 hover:bg-cyan-500/20 transition-colors cursor-pointer">
              <Plus className="w-4 h-4" /> New Shipment
            </button>
          </div>
        </div>

        {shipments.length === 0 ? (
          <div className="rounded-xl bg-white/70 border border-gray-200/80 px-6 py-16 text-center">
            <Ship className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm mb-1">No shipment files yet</p>
            <button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm bg-cyan-500/10 text-cyan-700 hover:bg-cyan-500/20 transition-colors cursor-pointer">
              <Plus className="w-4 h-4" /> New Shipment
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {shipments.map(s => (
              <div key={s.id} onClick={() => router.push(`/export/shipments/${s.id}`)}
                className="flex items-center justify-between px-4 py-3 rounded-xl bg-white/70 border border-gray-200/80 hover:bg-white cursor-pointer transition-colors">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-900 font-medium text-sm">{s.buyer_name}</span>
                    {s.sales_order_ref && <span className="text-xs text-gray-400">SO {s.sales_order_ref}</span>}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">{s.country || "—"} {s.pi_number ? `· PI ${s.pi_number}` : ""}</div>
                </div>
                <div className="flex items-center gap-2">
                  {s.drive_folder_link && (
                    <a href={s.drive_folder_link} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                      className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700" title="Open Drive folder">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${stageColor(s.stage)}`}>{stageLabel(s.stage)}</span>
                  <button onClick={e => deleteShipment(s.id, e)} className="p-1.5 rounded hover:bg-red-500/10 text-gray-300 hover:text-red-600 cursor-pointer">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6" onClick={() => setShowCreate(false)}>
          <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-lg p-5 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-gray-900 font-semibold">New Shipment File</h3>
              <button onClick={() => setShowCreate(false)} className="p-1 rounded hover:bg-gray-100 text-gray-500 cursor-pointer"><X className="w-4 h-4" /></button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Buyer Name *</label>
                <input value={form.buyerName} onChange={e => setForm(f => ({ ...f, buyerName: e.target.value }))}
                  className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-cyan-500/50" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Country</label>
                  <input value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value }))}
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-cyan-500/50" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Sales Order Ref</label>
                  <input value={form.salesOrderRef} onChange={e => setForm(f => ({ ...f, salesOrderRef: e.target.value }))}
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-cyan-500/50" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">PI Number</label>
                  <input value={form.piNumber} onChange={e => setForm(f => ({ ...f, piNumber: e.target.value }))}
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-cyan-500/50" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Advance Payment %</label>
                  <input type="number" value={form.advancePaymentPct} onChange={e => setForm(f => ({ ...f, advancePaymentPct: e.target.value }))} placeholder="e.g. 30 or 100"
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-cyan-500/50" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Document Template</label>
                <select value={form.templateId} onChange={e => setForm(f => ({ ...f, templateId: e.target.value }))}
                  className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-cyan-500/50">
                  <option value="">— None (add documents manually later) —</option>
                  {templates.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
                {templates.length === 0 && (
                  <p className="text-[11px] text-gray-400 mt-1">
                    No templates yet — <button onClick={() => router.push("/export/templates")} className="text-cyan-600 hover:underline cursor-pointer">create one</button> to auto-fill the checklist per country/buyer.
                  </p>
                )}
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Accountant&apos;s Google Email (Drive folder access)</label>
                <input value={form.accountantEmail} onChange={e => setForm(f => ({ ...f, accountantEmail: e.target.value }))} placeholder="accountant@gmail.com"
                  className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-cyan-500/50" />
                <p className="text-[11px] text-gray-400 mt-1">A Drive folder is created automatically and shared with this address so documents can be uploaded there.</p>
              </div>
            </div>

            <button onClick={createShipment} disabled={creating || !form.buyerName.trim()}
              className="w-full mt-4 flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm bg-cyan-600 hover:bg-cyan-500 text-white font-medium disabled:opacity-40 cursor-pointer">
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Create Shipment File
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
