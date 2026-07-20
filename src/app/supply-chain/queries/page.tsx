"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ChevronLeft, ClipboardList, Plus, Trash2, X, Loader2, Check,
  Package, ChevronDown, Calculator, Search,
} from "lucide-react";

type QueryItem = {
  id: string; product_id: string | null; product_name: string;
  requested_qty: number; unit: string; remarks: string;
};
type QueryRow = {
  id: string; query_number: string; buyer_name: string; buyer_contact: string;
  received_date: string; status: string; notes: string; plan_id: string | null;
  items: QueryItem[];
};
type Product = { id: string; product_name: string; brand: string; packing_desc: string };

const STATUS_META: Record<string, { label: string; color: string }> = {
  new: { label: "New", color: "bg-blue-500/10 text-blue-600" },
  in_progress: { label: "In Progress", color: "bg-amber-500/10 text-amber-600" },
  quoted: { label: "Quoted", color: "bg-violet-500/10 text-violet-600" },
  converted: { label: "Converted", color: "bg-emerald-500/10 text-emerald-600" },
  closed: { label: "Closed", color: "bg-gray-200/70 text-gray-500" },
};

type DraftItem = { productId: string | null; productName: string; requestedQty: number; unit: string; remarks: string };

export default function QueriesPage() {
  const router = useRouter();
  const [queries, setQueries] = useState<QueryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [buyerName, setBuyerName] = useState("");
  const [buyerContact, setBuyerContact] = useState("");
  const [receivedDate, setReceivedDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);
  const [saving, setSaving] = useState(false);

  // Product picker within create modal
  const [showPicker, setShowPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");

  const [startingPlanFor, setStartingPlanFor] = useState<string | null>(null);

  async function load() {
    const r = await fetch("/api/supply-chain/queries");
    const d = await r.json();
    setQueries(d.queries ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    fetch("/api/supply-chain/products").then(r => r.json()).then(d => setProducts(d.products ?? [])).catch(() => {});
  }, []);

  function openCreate() {
    setBuyerName(""); setBuyerContact(""); setReceivedDate(new Date().toISOString().slice(0, 10));
    setNotes(""); setDraftItems([]);
    setShowCreate(true);
  }

  function addFreeTextItem() {
    setDraftItems(prev => [...prev, { productId: null, productName: "", requestedQty: 0, unit: "CARTON", remarks: "" }]);
  }

  function addProductItem(p: Product) {
    setDraftItems(prev => [...prev, { productId: p.id, productName: p.product_name, requestedQty: 0, unit: "CARTON", remarks: "" }]);
    setShowPicker(false);
    setPickerSearch("");
  }

  function updateDraftItem(idx: number, field: keyof DraftItem, val: string | number) {
    setDraftItems(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: val };
      return next;
    });
  }

  function removeDraftItem(idx: number) {
    setDraftItems(prev => prev.filter((_, i) => i !== idx));
  }

  async function saveQuery() {
    if (!buyerName.trim()) return;
    setSaving(true);
    await fetch("/api/supply-chain/queries", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create", buyerName, buyerContact, receivedDate, notes,
        items: draftItems.filter(it => it.productName.trim()).map(it => ({
          productId: it.productId, productName: it.productName, requestedQty: it.requestedQty, unit: it.unit, remarks: it.remarks,
        })),
      }),
    });
    setSaving(false);
    setShowCreate(false);
    load();
  }

  async function setStatus(id: string, status: string) {
    await fetch("/api/supply-chain/queries", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update", id, status }),
    });
    setQueries(prev => prev.map(q => q.id === id ? { ...q, status } : q));
  }

  async function deleteQuery(id: string) {
    await fetch("/api/supply-chain/queries", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });
    setQueries(prev => prev.filter(q => q.id !== id));
  }

  async function startCbmPlan(queryId: string) {
    setStartingPlanFor(queryId);
    const r = await fetch("/api/supply-chain/queries", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start-cbm-plan", queryId }),
    });
    const d = await r.json();
    setStartingPlanFor(null);
    if (d.ok) {
      router.push("/supply-chain/cbm");
    }
  }

  const filteredProducts = products.filter(p => !pickerSearch || p.product_name.toLowerCase().includes(pickerSearch.toLowerCase()));

  if (loading) return <div className="min-h-screen flex items-center justify-center" style={{ background: "#e8ecf1" }}><div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="min-h-screen" style={{ background: "#e8ecf1" }}>
      <div className="max-w-6xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push("/supply-chain")} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors cursor-pointer">
              <ChevronLeft className="w-4 h-4" /> Supply Chain
            </button>
            <div className="w-px h-5 bg-gray-300" />
            <div className="flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-blue-600" />
              <h1 className="text-lg font-bold text-gray-900">Query Management</h1>
              <span className="text-xs text-gray-400">{queries.length}</span>
            </div>
          </div>
          <button onClick={openCreate} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 transition-colors cursor-pointer">
            <Plus className="w-4 h-4" /> New Query
          </button>
        </div>

        {queries.length === 0 ? (
          <div className="rounded-xl bg-white/70 border border-gray-200/80 px-6 py-16 text-center">
            <ClipboardList className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm mb-1">No queries yet</p>
            <p className="text-gray-400 text-xs mb-4">Log a buyer inquiry here — it's the starting point for a CBM plan.</p>
            <button onClick={openCreate} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 transition-colors cursor-pointer">
              <Plus className="w-4 h-4" /> New Query
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {queries.map(q => {
              const meta = STATUS_META[q.status] || STATUS_META.new;
              return (
                <div key={q.id} className="rounded-xl bg-white/70 border border-gray-200/80 overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-900 font-semibold text-sm">{q.query_number}</span>
                        <span className="text-gray-500 text-sm">— {q.buyer_name}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] ${meta.color}`}>{meta.label}</span>
                      </div>
                      <div className="text-xs text-gray-500">
                        {q.received_date}{q.buyer_contact && ` · ${q.buyer_contact}`} · {q.items.length} item{q.items.length !== 1 ? "s" : ""}
                        {q.notes && ` · ${q.notes}`}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {!q.plan_id && q.items.some(it => it.product_id) && (
                        <button onClick={() => startCbmPlan(q.id)} disabled={startingPlanFor === q.id}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 transition-colors cursor-pointer disabled:opacity-40">
                          {startingPlanFor === q.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Calculator className="w-3.5 h-3.5" />}
                          Start CBM Plan
                        </button>
                      )}
                      {q.plan_id && <span className="text-xs text-emerald-600 px-2 py-1">CBM plan started</span>}
                      <div className="relative">
                        <select value={q.status} onChange={e => setStatus(q.id, e.target.value)}
                          className="bg-white border border-gray-200 rounded-lg pl-2 pr-6 py-1 text-xs text-gray-900 appearance-none focus:outline-none cursor-pointer">
                          {Object.entries(STATUS_META).map(([k, m]) => <option key={k} value={k} className="bg-white">{m.label}</option>)}
                        </select>
                        <ChevronDown className="w-3 h-3 absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                      </div>
                      <button onClick={() => deleteQuery(q.id)} className="p-1.5 rounded hover:bg-red-500/10 text-gray-400 hover:text-red-600 transition-colors cursor-pointer">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  {q.items.length > 0 && (
                    <table className="w-full text-sm border-t border-gray-100">
                      <tbody>
                        {q.items.map((it, i) => (
                          <tr key={it.id} className="border-b border-gray-50 last:border-0">
                            <td className="px-4 py-1.5 text-gray-400 text-xs w-8">{i + 1}</td>
                            <td className="px-4 py-1.5 text-gray-900 text-xs font-medium">{it.product_name}{!it.product_id && <span className="ml-1.5 text-[10px] text-amber-600">(not in Product Master)</span>}</td>
                            <td className="px-4 py-1.5 text-right text-blue-600 text-xs font-medium w-28">{it.requested_qty} {it.unit.toLowerCase()}</td>
                            <td className="px-4 py-1.5 text-gray-500 text-xs">{it.remarks}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Query Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6" onClick={() => setShowCreate(false)}>
          <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200/70">
              <h3 className="text-gray-900 font-semibold">New Query</h3>
              <button onClick={() => setShowCreate(false)} className="p-1 rounded hover:bg-gray-100 text-gray-500 cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Buyer Name *</label>
                  <input value={buyerName} onChange={e => setBuyerName(e.target.value)} placeholder="e.g. Hamid Sons UG"
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-blue-500/50" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Buyer Contact</label>
                  <input value={buyerContact} onChange={e => setBuyerContact(e.target.value)} placeholder="phone / email"
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-blue-500/50" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Received Date</label>
                  <input type="date" value={receivedDate} onChange={e => setReceivedDate(e.target.value)}
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-blue-500/50" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Notes</label>
                  <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="..."
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-blue-500/50" />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs text-gray-500">Items Requested</label>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setShowPicker(true)} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 cursor-pointer">
                      <Package className="w-3.5 h-3.5" /> Add from Product Master
                    </button>
                    <button onClick={addFreeTextItem} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 cursor-pointer">
                      <Plus className="w-3.5 h-3.5" /> Add free-text item
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  {draftItems.map((it, idx) => (
                    <div key={idx} className="flex items-center gap-2 p-2 rounded-lg border border-gray-200 bg-gray-50/50">
                      {it.productId ? (
                        <span className="flex-1 text-sm text-gray-900">{it.productName}</span>
                      ) : (
                        <input value={it.productName} onChange={e => updateDraftItem(idx, "productName", e.target.value)} placeholder="Product name (not yet in master)"
                          className="flex-1 bg-white border border-amber-500/30 rounded px-2 py-1 text-sm text-gray-900 focus:outline-none" />
                      )}
                      <input type="number" min="0" value={it.requestedQty || ""} onChange={e => updateDraftItem(idx, "requestedQty", Number(e.target.value))} placeholder="Qty"
                        className="w-20 bg-white border border-gray-200 rounded px-2 py-1 text-sm text-center text-gray-900 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                      <select value={it.unit} onChange={e => updateDraftItem(idx, "unit", e.target.value)}
                        className="bg-white border border-gray-200 rounded px-1.5 py-1 text-xs text-gray-700 focus:outline-none cursor-pointer">
                        <option value="CARTON">carton</option>
                        <option value="BAG">bag</option>
                        <option value="PCS">pcs</option>
                      </select>
                      <button onClick={() => removeDraftItem(idx)} className="p-1 rounded hover:bg-red-500/10 text-gray-400 hover:text-red-600 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                  {draftItems.length === 0 && <p className="text-xs text-gray-400 text-center py-3">No items added yet</p>}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-200/70">
              <button onClick={() => setShowCreate(false)} className="px-4 py-1.5 rounded-lg text-sm text-gray-500 hover:text-gray-900 cursor-pointer">Cancel</button>
              <button onClick={saveQuery} disabled={saving || !buyerName.trim()} className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors disabled:opacity-40 cursor-pointer">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Save Query
              </button>
            </div>
          </div>

          {/* Product picker sub-modal */}
          {showPicker && (
            <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-6" onClick={() => setShowPicker(false)}>
              <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-md max-h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200/70">
                  <h4 className="text-gray-900 font-semibold text-sm">Pick a Product</h4>
                  <button onClick={() => setShowPicker(false)} className="p-1 rounded hover:bg-gray-100 text-gray-500 cursor-pointer"><X className="w-4 h-4" /></button>
                </div>
                <div className="px-4 py-2 border-b border-gray-200/70 relative">
                  <Search className="w-4 h-4 absolute left-6 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input value={pickerSearch} onChange={e => setPickerSearch(e.target.value)} placeholder="Search..." autoFocus
                    className="w-full bg-white border border-gray-200 rounded-lg pl-8 pr-3 py-1.5 text-sm text-gray-900 focus:outline-none" />
                </div>
                <div className="flex-1 overflow-y-auto">
                  {filteredProducts.map(p => (
                    <button key={p.id} onClick={() => addProductItem(p)} className="w-full flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 text-left hover:bg-gray-50 cursor-pointer">
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600">{p.brand}</span>
                      <span className="text-sm text-gray-900">{p.product_name}</span>
                    </button>
                  ))}
                  {filteredProducts.length === 0 && <div className="px-4 py-8 text-center text-gray-400 text-sm">No products found</div>}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
