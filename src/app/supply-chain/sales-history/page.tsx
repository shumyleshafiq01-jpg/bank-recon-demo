"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ChevronLeft, Scale, Plus, Trash2, X, Loader2, Check, FileText, Package, Wand2,
} from "lucide-react";

type Sheet = {
  id: string; order_number: string | null; buyer_name: string | null;
  country: string | null; port: string | null; container_type: string; order_date: string | null;
};

type Item = { id: string; product_id: string | null; product_name: string; cartons: number; unit_price: number | null };

type Product = { id: string; product_name: string; packing_desc: string };

type Suggestion = { productId: string; productName: string; cartons: number; fillPct: number };

export default function SalesHistoryPage() {
  const router = useRouter();
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<Sheet | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ orderNumber: "", buyerName: "", country: "", port: "", containerType: "20ft", orderDate: "" });
  const [creating, setCreating] = useState(false);

  const [showBuild, setShowBuild] = useState(false);
  const [buildFilters, setBuildFilters] = useState({ country: "", port: "", containerType: "20ft", targetFillPct: 95 });
  const [building, setBuilding] = useState(false);
  const [buildResult, setBuildResult] = useState<{ suggestions: Suggestion[]; matchedOrders: number; projectedFillPct?: number; note?: string } | null>(null);

  async function loadSheets() {
    const r = await fetch("/api/supply-chain/sales-history");
    const d = await r.json();
    setSheets(d.sheets ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadSheets();
    fetch("/api/supply-chain/products").then(r => r.json()).then(d => setProducts(d.products ?? [])).catch(() => {});
  }, []);

  async function openSheet(id: string) {
    const r = await fetch(`/api/supply-chain/sales-history?id=${id}`);
    const d = await r.json();
    setActive(d.sheet);
    setItems(d.items ?? []);
  }

  async function createSheet() {
    setCreating(true);
    const r = await fetch("/api/supply-chain/sales-history", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create-sheet", ...form }),
    });
    const d = await r.json();
    setCreating(false);
    setShowCreate(false);
    setForm({ orderNumber: "", buyerName: "", country: "", port: "", containerType: "20ft", orderDate: "" });
    if (d.id) { await loadSheets(); openSheet(d.id); }
  }

  async function deleteSheet(id: string) {
    await fetch("/api/supply-chain/sales-history", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete-sheet", id }),
    });
    setSheets(prev => prev.filter(s => s.id !== id));
    if (active?.id === id) { setActive(null); setItems([]); }
  }

  async function addItem() {
    if (!active) return;
    const r = await fetch("/api/supply-chain/sales-history", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add-item", sheetId: active.id }),
    });
    const d = await r.json();
    if (d.id) openSheet(active.id);
  }

  function updateItemLocal(id: string, patch: Partial<Item>) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i));
  }

  async function saveItem(id: string, patch: Partial<Item>) {
    await fetch("/api/supply-chain/sales-history", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update-item", id, ...patch }),
    });
  }

  function pickProduct(itemId: string, productId: string) {
    const p = products.find(x => x.id === productId);
    if (!p) return;
    const patch = { product_id: productId, product_name: p.product_name };
    updateItemLocal(itemId, patch);
    saveItem(itemId, patch);
  }

  async function deleteItem(id: string) {
    await fetch("/api/supply-chain/sales-history", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete-item", id }),
    });
    setItems(prev => prev.filter(i => i.id !== id));
  }

  async function buildPackage() {
    setBuilding(true);
    setBuildResult(null);
    const r = await fetch("/api/supply-chain/sales-history", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "suggest-package", ...buildFilters }),
    });
    const d = await r.json();
    setBuilding(false);
    setBuildResult(d);
  }

  async function startCbmFromPackage() {
    if (!buildResult) return;
    const r = await fetch("/api/supply-chain/packing-plans", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", planName: "Sales History Package", buyerName: "", containerType: buildFilters.containerType }),
    });
    const d = await r.json();
    if (!d.id) return;
    const planProducts = products;
    const planItems = buildResult.suggestions.map(s => {
      const p = planProducts.find(x => x.id === s.productId);
      return { productId: s.productId, cartons: s.cartons, fillPct: s.fillPct, netWeightTotal: 0, unitPriceFob: 0, totalValue: 0, remarks: p ? "" : "" };
    });
    await fetch("/api/supply-chain/packing-plans", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save-items", planId: d.id, items: planItems }),
    });
    router.push("/supply-chain/cbm");
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center" style={{ background: "#e8ecf1" }}><div className="w-8 h-8 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" /></div>;

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
              <Scale className="w-5 h-5 text-purple-600" />
              <h1 className="text-lg font-bold text-gray-900">Sales + Quotation Comparison</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {sheets.length > 0 && (
              <button onClick={() => setActive(null)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors cursor-pointer">
                <FileText className="w-4 h-4" /> All Records
              </button>
            )}
            <button onClick={() => setShowBuild(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 transition-colors cursor-pointer">
              <Wand2 className="w-4 h-4" /> Build New Package
            </button>
            <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-purple-500/10 text-purple-700 hover:bg-purple-500/20 transition-colors cursor-pointer">
              <Plus className="w-4 h-4" /> Log Past Sales Order
            </button>
          </div>
        </div>

        {!active ? (
          sheets.length === 0 ? (
            <div className="rounded-xl bg-white/70 border border-gray-200/80 px-6 py-16 text-center">
              <Scale className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm mb-1">No past sales orders logged yet</p>
              <p className="text-gray-400 text-xs mb-4">Log Kafi's own historical sales orders/invoices here — they power the package suggestions.</p>
              <button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm bg-purple-500/10 text-purple-700 hover:bg-purple-500/20 transition-colors cursor-pointer">
                <Plus className="w-4 h-4" /> Log Past Sales Order
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {sheets.map(s => (
                <div key={s.id} className="flex items-center justify-between px-4 py-3 rounded-xl bg-white/70 border border-gray-200/80">
                  <button onClick={() => openSheet(s.id)} className="flex-1 text-left cursor-pointer">
                    <div className="text-gray-900 font-medium text-sm">{s.order_number || "Untitled Order"}{s.buyer_name && ` — ${s.buyer_name}`}</div>
                    <div className="text-xs text-gray-500">{[s.country, s.port].filter(Boolean).join(", ")} &middot; {s.container_type.toUpperCase()}{s.order_date && ` · ${s.order_date}`}</div>
                  </button>
                  <button onClick={() => deleteSheet(s.id)} className="p-1.5 rounded hover:bg-red-500/10 text-gray-400 hover:text-red-600 transition-colors cursor-pointer">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4 p-4 rounded-xl bg-white/70 border border-gray-200/80">
              <div>
                <h2 className="text-gray-900 font-semibold">{active.order_number || "Untitled Order"}{active.buyer_name && ` — ${active.buyer_name}`}</h2>
                <p className="text-xs text-gray-500">{[active.country, active.port].filter(Boolean).join(", ")} &middot; {active.container_type.toUpperCase()}</p>
              </div>
            </div>
            <div className="rounded-xl bg-white/70 border border-gray-200/80 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200/70">
                      <th className="text-left px-4 py-2.5 text-gray-500 font-medium">Product</th>
                      <th className="text-center px-4 py-2.5 text-gray-500 font-medium w-28">Cartons</th>
                      <th className="text-center px-4 py-2.5 text-gray-500 font-medium w-28">Unit Price</th>
                      <th className="w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(it => (
                      <tr key={it.id} className="border-b border-gray-100 hover:bg-gray-50/80">
                        <td className="px-4 py-2">
                          <select value={it.product_id || ""} onChange={e => pickProduct(it.id, e.target.value)}
                            className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-xs text-gray-900 focus:outline-none focus:border-purple-500/50 cursor-pointer">
                            <option value="">— select product —</option>
                            {products.map(p => <option key={p.id} value={p.id}>{p.product_name}</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-2">
                          <input type="number" value={it.cartons || ""} onChange={e => updateItemLocal(it.id, { cartons: Number(e.target.value) || 0 })} onBlur={() => saveItem(it.id, { cartons: it.cartons })}
                            className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-center text-xs text-gray-900 focus:outline-none focus:border-purple-500/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                        </td>
                        <td className="px-4 py-2">
                          <input type="number" step="0.01" value={it.unit_price || ""} onChange={e => updateItemLocal(it.id, { unit_price: Number(e.target.value) || 0 })} onBlur={() => saveItem(it.id, { unit_price: it.unit_price })}
                            className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-center text-xs text-gray-900 focus:outline-none focus:border-purple-500/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                        </td>
                        <td className="px-2 py-2">
                          <button onClick={() => deleteItem(it.id)} className="p-1 rounded hover:bg-red-500/10 text-gray-300 hover:text-red-600 cursor-pointer"><Trash2 className="w-3 h-3" /></button>
                        </td>
                      </tr>
                    ))}
                    {items.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400 text-xs">No items yet.</td></tr>}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-end px-4 py-3 border-t border-gray-200/70">
                <button onClick={addItem} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-purple-600 hover:bg-purple-500 text-white font-medium transition-colors cursor-pointer">
                  <Plus className="w-3.5 h-3.5" /> Add Item
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6" onClick={() => setShowCreate(false)}>
          <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-gray-900 font-semibold">Log Past Sales Order</h3>
              <button onClick={() => setShowCreate(false)} className="p-1 rounded hover:bg-gray-100 text-gray-500 cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3">
              <input value={form.orderNumber} onChange={e => setForm(f => ({ ...f, orderNumber: e.target.value }))} placeholder="Order/Invoice # (optional)"
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-purple-500/50" />
              <input value={form.buyerName} onChange={e => setForm(f => ({ ...f, buyerName: e.target.value }))} placeholder="Buyer name"
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-purple-500/50" />
              <div className="grid grid-cols-2 gap-2">
                <input value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value }))} placeholder="Country"
                  className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-purple-500/50" />
                <input value={form.port} onChange={e => setForm(f => ({ ...f, port: e.target.value }))} placeholder="Port"
                  className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-purple-500/50" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select value={form.containerType} onChange={e => setForm(f => ({ ...f, containerType: e.target.value }))}
                  className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none cursor-pointer">
                  <option value="20ft">20FT</option><option value="40ft">40FT</option><option value="40hc">40HC</option>
                </select>
                <input type="date" value={form.orderDate} onChange={e => setForm(f => ({ ...f, orderDate: e.target.value }))}
                  className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-purple-500/50" />
              </div>
            </div>
            <button onClick={createSheet} disabled={creating}
              className="w-full mt-4 flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm bg-purple-600 hover:bg-purple-500 text-white font-medium disabled:opacity-40 cursor-pointer">
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Create
            </button>
          </div>
        </div>
      )}

      {showBuild && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6" onClick={() => { setShowBuild(false); setBuildResult(null); }}>
          <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200/70">
              <div>
                <h3 className="text-gray-900 font-semibold flex items-center gap-1.5"><Wand2 className="w-4 h-4 text-emerald-600" /> Build New Package</h3>
                <p className="text-xs text-gray-500 mt-0.5">Blends items from matching past sales orders to hit your target fill %</p>
              </div>
              <button onClick={() => { setShowBuild(false); setBuildResult(null); }} className="p-1 rounded hover:bg-gray-100 text-gray-500 cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <div className="grid grid-cols-2 gap-2 mb-3">
                <input value={buildFilters.country} onChange={e => setBuildFilters(f => ({ ...f, country: e.target.value }))} placeholder="Country (optional)"
                  className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-emerald-500/50" />
                <input value={buildFilters.port} onChange={e => setBuildFilters(f => ({ ...f, port: e.target.value }))} placeholder="Port (optional)"
                  className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-emerald-500/50" />
              </div>
              <div className="grid grid-cols-2 gap-2 mb-4">
                <select value={buildFilters.containerType} onChange={e => setBuildFilters(f => ({ ...f, containerType: e.target.value }))}
                  className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none cursor-pointer">
                  <option value="20ft">20FT</option><option value="40ft">40FT</option><option value="40hc">40HC</option>
                </select>
                <input type="number" value={buildFilters.targetFillPct} onChange={e => setBuildFilters(f => ({ ...f, targetFillPct: Number(e.target.value) || 95 }))}
                  className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-emerald-500/50" placeholder="Target fill %" />
              </div>
              <button onClick={buildPackage} disabled={building}
                className="w-full flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm bg-emerald-600 hover:bg-emerald-500 text-white font-medium disabled:opacity-40 cursor-pointer mb-4">
                {building ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />} Suggest Package
              </button>

              {buildResult && (
                <div>
                  {buildResult.note && <p className="text-xs text-amber-600 mb-2">{buildResult.note}</p>}
                  <p className="text-xs text-gray-500 mb-2">Based on {buildResult.matchedOrders} matching past order(s){buildResult.projectedFillPct !== undefined && ` — projected fill ${buildResult.projectedFillPct}%`}</p>
                  {buildResult.suggestions.length > 0 && (
                    <div className="rounded-lg border border-gray-200 overflow-hidden mb-3">
                      {buildResult.suggestions.map(s => (
                        <div key={s.productId} className="flex items-center justify-between px-3 py-2 border-b border-gray-100 last:border-0 text-sm">
                          <span className="text-gray-900">{s.productName}</span>
                          <span className="text-gray-500">{s.cartons} ctn <span className="text-emerald-600 font-medium">({s.fillPct}%)</span></span>
                        </div>
                      ))}
                    </div>
                  )}
                  {buildResult.suggestions.length > 0 && (
                    <button onClick={startCbmFromPackage} className="w-full flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm bg-emerald-600 hover:bg-emerald-500 text-white font-medium cursor-pointer">
                      <Package className="w-4 h-4" /> Start CBM Plan from This Package
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
