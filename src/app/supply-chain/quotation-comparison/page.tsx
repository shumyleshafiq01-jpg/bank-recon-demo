"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ChevronLeft, Scale, Plus, Trash2, Check, Loader2, X, Trophy,
} from "lucide-react";

type Vendor = { id: string; vendorName: string; commodity: string; phone: string };

type Quotation = {
  id: string; vendor_id: string | null; vendor_name: string;
  rate: number; note: string; is_winner: boolean; created_at: string;
};

type MaterialRow = {
  id: string; bom_id: string; material_name: string; unit: string;
  qty_to_order: number; rate: number; vendor_name: string | null;
  quotations: Quotation[];
  sc_boms?: { bom_name: string; buyer_name: string } | null;
};

const EMPTY_FORM = { vendorId: "", vendorName: "", rate: "", note: "" };

export default function QuotationComparisonPage() {
  const router = useRouter();
  const [materials, setMaterials] = useState<MaterialRow[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [formFor, setFormFor] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  async function load() {
    const r = await fetch("/api/supply-chain/quotation-comparison");
    const d = await r.json();
    setMaterials(d.materials ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    fetch("/api/vendors").then(r => r.json()).then(d => setVendors(d.vendors ?? [])).catch(() => {});
  }, []);

  function openForm(materialId: string) {
    setFormFor(materialId);
    setForm(EMPTY_FORM);
  }

  async function addQuote(materialId: string) {
    if (!form.vendorName.trim() || !form.rate) return;
    setSaving(true);
    await fetch("/api/supply-chain/quotation-comparison", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add", bomMaterialId: materialId, vendorId: form.vendorId || null, vendorName: form.vendorName, rate: form.rate, note: form.note }),
    });
    setSaving(false);
    setFormFor(null);
    load();
  }

  async function selectWinner(materialId: string, quoteId: string) {
    await fetch("/api/supply-chain/quotation-comparison", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "select-winner", id: quoteId, bomMaterialId: materialId }),
    });
    load();
  }

  async function deleteQuote(id: string) {
    await fetch("/api/supply-chain/quotation-comparison", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });
    load();
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center" style={{ background: "#e8ecf1" }}><div className="w-8 h-8 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="min-h-screen" style={{ background: "#e8ecf1" }}>
      <div className="max-w-5xl mx-auto px-6 py-6">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => router.push("/supply-chain")} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors cursor-pointer">
            <ChevronLeft className="w-4 h-4" /> Supply Chain
          </button>
          <div className="w-px h-5 bg-gray-300" />
          <div className="flex items-center gap-2">
            <Scale className="w-5 h-5 text-orange-600" />
            <h1 className="text-lg font-bold text-gray-900">Quotation Comparison</h1>
            <span className="text-xs text-gray-400">{materials.length} pending</span>
          </div>
        </div>

        {materials.length === 0 ? (
          <div className="rounded-xl bg-white/70 border border-gray-200/80 px-6 py-16 text-center">
            <Scale className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm mb-1">No materials awaiting quotes</p>
            <p className="text-gray-400 text-xs">Materials appear here once marked "Ask for Quotes" in a BOM.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {materials.map(m => {
              const cheapest = m.quotations.length > 0 ? Math.min(...m.quotations.map(q => q.rate)) : null;
              return (
                <div key={m.id} className="rounded-xl bg-white/70 border border-gray-200/80 overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-gray-100">
                    <div>
                      <div className="text-gray-900 font-semibold text-sm">{m.material_name}</div>
                      <div className="text-xs text-gray-500">
                        {m.sc_boms?.bom_name}{m.sc_boms?.buyer_name && ` · ${m.sc_boms.buyer_name}`} &middot; needs {m.qty_to_order} {m.unit}
                      </div>
                    </div>
                    <button onClick={() => openForm(m.id)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-orange-500/10 text-orange-700 hover:bg-orange-500/20 transition-colors cursor-pointer">
                      <Plus className="w-3.5 h-3.5" /> Log Vendor Quote
                    </button>
                  </div>

                  {formFor === m.id && (
                    <div className="px-4 py-3 bg-orange-500/[0.03] border-b border-orange-500/20 flex flex-wrap items-end gap-2">
                      <div className="flex-1 min-w-[160px]">
                        <label className="text-[11px] text-gray-500 mb-1 block">Vendor</label>
                        <input list={`vendors-${m.id}`} value={form.vendorName} onChange={e => {
                          const match = vendors.find(v => v.vendorName === e.target.value);
                          setForm(f => ({ ...f, vendorName: e.target.value, vendorId: match?.id || "" }));
                        }} placeholder="Vendor name" className="w-full bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-orange-500/50" />
                        <datalist id={`vendors-${m.id}`}>
                          {vendors.map(v => <option key={v.id} value={v.vendorName} />)}
                        </datalist>
                      </div>
                      <div className="w-28">
                        <label className="text-[11px] text-gray-500 mb-1 block">Rate</label>
                        <input type="number" step="0.01" value={form.rate} onChange={e => setForm(f => ({ ...f, rate: e.target.value }))}
                          className="w-full bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-orange-500/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                      </div>
                      <div className="flex-1 min-w-[160px]">
                        <label className="text-[11px] text-gray-500 mb-1 block">Note</label>
                        <input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="e.g. via phone call, 15-day lead time"
                          className="w-full bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-orange-500/50" />
                      </div>
                      <button onClick={() => addQuote(m.id)} disabled={saving || !form.vendorName.trim() || !form.rate}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-orange-600 hover:bg-orange-500 text-white font-medium disabled:opacity-40 cursor-pointer">
                        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Save
                      </button>
                      <button onClick={() => setFormFor(null)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 cursor-pointer"><X className="w-3.5 h-3.5" /></button>
                    </div>
                  )}

                  {m.quotations.length > 0 && (
                    <div className="px-4 py-2">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-[11px] text-gray-400">
                            <th className="text-left font-medium py-1.5">Vendor</th>
                            <th className="text-center font-medium py-1.5 w-24">Rate</th>
                            <th className="text-left font-medium py-1.5">Note</th>
                            <th className="text-center font-medium py-1.5 w-28">Winner</th>
                            <th className="w-8"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {m.quotations.map(q => (
                            <tr key={q.id} className={`border-t border-gray-100 ${q.is_winner ? "bg-emerald-500/[0.05]" : ""}`}>
                              <td className="py-2 text-gray-900 text-xs font-medium">{q.vendor_name}</td>
                              <td className={`py-2 text-center text-xs font-semibold ${q.rate === cheapest ? "text-emerald-600" : "text-gray-700"}`}>${q.rate.toFixed(2)}</td>
                              <td className="py-2 text-gray-500 text-xs">{q.note}</td>
                              <td className="py-2 text-center">
                                {q.is_winner ? (
                                  <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-medium"><Trophy className="w-3.5 h-3.5" /> Selected</span>
                                ) : (
                                  <button onClick={() => selectWinner(m.id, q.id)} className="text-[11px] px-2 py-1 rounded-md bg-gray-100 hover:bg-emerald-500/10 hover:text-emerald-700 text-gray-500 transition-colors cursor-pointer">
                                    Select Winner
                                  </button>
                                )}
                              </td>
                              <td className="py-2 text-center">
                                <button onClick={() => deleteQuote(q.id)} className="p-1 rounded hover:bg-red-500/10 text-gray-300 hover:text-red-600 cursor-pointer"><Trash2 className="w-3 h-3" /></button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {m.vendor_name && (
                    <div className="px-4 py-2 text-xs text-emerald-700 bg-emerald-500/[0.04] flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5" /> Rate/vendor set on BOM — ${m.rate.toFixed(2)} from {m.vendor_name}. Ready to Send PO from the BOM page.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
