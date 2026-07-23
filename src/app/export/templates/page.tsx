"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronLeft, Settings, Plus, X, Trash2, Loader2, Check } from "lucide-react";

type Template = {
  id: string; label: string; country: string | null; buyer_name: string | null;
  sop_method: string; document_types: string[];
};

const DEFAULT_DOC_TYPES = [
  "Proforma Invoice", "Commercial Invoice", "Packing List", "Certificate of Origin",
  "Phytosanitary Certificate", "Aflatoxin Certificate", "Draft Bill of Lading",
  "Final Bill of Lading", "Insurance Certificate", "Shipping Instructions",
  "Export Declaration", "Goods Declaration (GD)", "Inspection Certificate", "CRO",
];

export default function ExportTemplatesPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({ label: "", country: "", buyerName: "", sopMethod: "courier", docTypes: [] as string[] });
  const [customDoc, setCustomDoc] = useState("");

  async function load() {
    setLoading(true);
    const r = await fetch("/api/export/templates");
    const d = await r.json();
    setTemplates(d.templates ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function toggleDoc(doc: string) {
    setForm(f => ({ ...f, docTypes: f.docTypes.includes(doc) ? f.docTypes.filter(d => d !== doc) : [...f.docTypes, doc] }));
  }

  function addCustomDoc() {
    if (!customDoc.trim() || form.docTypes.includes(customDoc.trim())) return;
    setForm(f => ({ ...f, docTypes: [...f.docTypes, customDoc.trim()] }));
    setCustomDoc("");
  }

  async function saveTemplate() {
    if (!form.label.trim()) return;
    setSaving(true);
    try {
      await fetch("/api/export/templates", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create", label: form.label, country: form.country, buyerName: form.buyerName,
          sopMethod: form.sopMethod, documentTypes: form.docTypes,
        }),
      });
      setShowCreate(false);
      setForm({ label: "", country: "", buyerName: "", sopMethod: "courier", docTypes: [] });
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function deleteTemplate(id: string) {
    if (!confirm("Delete this template?")) return;
    await fetch("/api/export/templates", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });
    setTemplates(prev => prev.filter(t => t.id !== id));
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center" style={{ background: "#e8ecf1" }}><div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="min-h-screen" style={{ background: "#e8ecf1" }}>
      <div className="max-w-3xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push("/export")} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors cursor-pointer">
              <ChevronLeft className="w-4 h-4" /> Export Department
            </button>
            <div className="w-px h-5 bg-gray-300" />
            <div className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-cyan-600" />
              <h1 className="text-lg font-bold text-gray-900">Document Templates</h1>
            </div>
          </div>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-cyan-500/10 text-cyan-700 hover:bg-cyan-500/20 transition-colors cursor-pointer">
            <Plus className="w-4 h-4" /> New Template
          </button>
        </div>

        {templates.length === 0 ? (
          <div className="rounded-xl bg-white/70 border border-gray-200/80 px-6 py-16 text-center">
            <p className="text-gray-500 text-sm mb-1">No templates yet</p>
            <p className="text-xs text-gray-400">Templates define which documents are needed per country/buyer SOP — new shipments auto-load the right checklist.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {templates.map(t => (
              <div key={t.id} className="px-4 py-3 rounded-xl bg-white/70 border border-gray-200/80">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-gray-900 font-medium text-sm">{t.label}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {t.country || "Any country"}{t.buyer_name ? ` · ${t.buyer_name}` : ""} · {t.sop_method === "courier" ? "Courier SOP" : "Email SOP"} · {t.document_types.length} docs
                    </div>
                  </div>
                  <button onClick={() => deleteTemplate(t.id)} className="p-1.5 rounded hover:bg-red-500/10 text-gray-300 hover:text-red-600 cursor-pointer">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {t.document_types.map(dt => (
                    <span key={dt} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{dt}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6" onClick={() => setShowCreate(false)}>
          <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-4xl p-8 max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-gray-900 font-bold text-2xl">New Document Template</h3>
              <button onClick={() => setShowCreate(false)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 cursor-pointer"><X className="w-6 h-6" /></button>
            </div>

            <div className="space-y-5">
              <div>
                <label className="text-sm text-gray-600 mb-1.5 block font-medium">Label *</label>
                <input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder="e.g. Saudi Arabia — Courier SOP"
                  className="w-full bg-white border border-gray-200 rounded-lg px-4 py-3 text-base text-gray-900 focus:outline-none focus:border-cyan-500/50" />
              </div>
              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className="text-sm text-gray-600 mb-1.5 block font-medium">Country</label>
                  <input value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value }))}
                    className="w-full bg-white border border-gray-200 rounded-lg px-4 py-3 text-base text-gray-900 focus:outline-none focus:border-cyan-500/50" />
                </div>
                <div>
                  <label className="text-sm text-gray-600 mb-1.5 block font-medium">Buyer (optional override)</label>
                  <input value={form.buyerName} onChange={e => setForm(f => ({ ...f, buyerName: e.target.value }))}
                    className="w-full bg-white border border-gray-200 rounded-lg px-4 py-3 text-base text-gray-900 focus:outline-none focus:border-cyan-500/50" />
                </div>
              </div>
              <div>
                <label className="text-sm text-gray-600 mb-1.5 block font-medium">Document Dispatch Method</label>
                <div className="flex gap-2">
                  {["courier", "email"].map(m => (
                    <button key={m} onClick={() => setForm(f => ({ ...f, sopMethod: m }))}
                      className={`px-4 py-2.5 rounded-lg text-sm font-medium cursor-pointer transition-colors ${form.sopMethod === m ? "bg-cyan-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                      {m === "courier" ? "Physical Courier" : "Email / Soft Copy"}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm text-gray-600 mb-2 block font-medium">Required Documents</label>
                <div className="flex flex-wrap gap-2 mb-3">
                  {DEFAULT_DOC_TYPES.map(doc => (
                    <button key={doc} onClick={() => toggleDoc(doc)}
                      className={`text-sm px-3 py-1.5 rounded-full cursor-pointer transition-colors ${form.docTypes.includes(doc) ? "bg-cyan-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                      {doc}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input value={customDoc} onChange={e => setCustomDoc(e.target.value)} onKeyDown={e => e.key === "Enter" && addCustomDoc()} placeholder="Add a custom document type..."
                    className="flex-1 bg-white border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-cyan-500/50" />
                  <button onClick={addCustomDoc} className="p-2.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 cursor-pointer"><Plus className="w-5 h-5" /></button>
                </div>
                {form.docTypes.filter(d => !DEFAULT_DOC_TYPES.includes(d)).length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {form.docTypes.filter(d => !DEFAULT_DOC_TYPES.includes(d)).map(doc => (
                      <button key={doc} onClick={() => toggleDoc(doc)} className="text-sm px-3 py-1.5 rounded-full bg-cyan-600 text-white cursor-pointer">{doc} ✕</button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <button onClick={saveTemplate} disabled={saving || !form.label.trim()}
              className="w-full mt-6 flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-base bg-cyan-600 hover:bg-cyan-500 text-white font-semibold disabled:opacity-40 cursor-pointer">
              {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />} Save Template
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
