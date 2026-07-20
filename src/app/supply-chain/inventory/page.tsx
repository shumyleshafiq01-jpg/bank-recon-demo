"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useMemo } from "react";
import {
  ChevronLeft, Warehouse, RefreshCw, Search, ChevronDown,
  AlertTriangle, X, Loader2, Plus, Minus, History, Check,
} from "lucide-react";

type InvItem = {
  id: string; item_type: "material" | "product"; item_name: string;
  unit: string; qty_on_hand: number; reorder_level: number;
};
type Txn = { id: string; txn_type: string; qty: number; ref_type: string; notes: string; created_at: string };

export default function InventoryPage() {
  const router = useRouter();
  const [items, setItems] = useState<InvItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"ALL" | "material" | "product">("ALL");
  const [lowStockOnly, setLowStockOnly] = useState(false);

  // Adjust modal
  const [adjustItem, setAdjustItem] = useState<InvItem | null>(null);
  const [adjustQty, setAdjustQty] = useState("");
  const [adjustDirection, setAdjustDirection] = useState<"in" | "out">("in");
  const [adjustNotes, setAdjustNotes] = useState("");
  const [adjusting, setAdjusting] = useState(false);

  // History modal
  const [historyItem, setHistoryItem] = useState<InvItem | null>(null);
  const [historyTxns, setHistoryTxns] = useState<Txn[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  async function load() {
    const r = await fetch("/api/supply-chain/inventory");
    const d = await r.json();
    setItems(d.items ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function sync() {
    setSyncing(true);
    await fetch("/api/supply-chain/inventory", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "sync" }),
    });
    setSyncing(false);
    load();
  }

  const filtered = useMemo(() => {
    let list = items;
    if (typeFilter !== "ALL") list = list.filter(i => i.item_type === typeFilter);
    if (lowStockOnly) list = list.filter(i => i.reorder_level > 0 && i.qty_on_hand < i.reorder_level);
    if (search) list = list.filter(i => i.item_name.toLowerCase().includes(search.toLowerCase()));
    return list;
  }, [items, typeFilter, lowStockOnly, search]);

  const lowStockCount = useMemo(() => items.filter(i => i.reorder_level > 0 && i.qty_on_hand < i.reorder_level).length, [items]);

  function openAdjust(item: InvItem) {
    setAdjustItem(item); setAdjustQty(""); setAdjustDirection("in"); setAdjustNotes("");
  }

  async function submitAdjust() {
    if (!adjustItem) return;
    const qty = Number(adjustQty);
    if (!qty || qty <= 0) return;
    setAdjusting(true);
    await fetch("/api/supply-chain/inventory", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "adjust", inventoryId: adjustItem.id, qty: adjustDirection === "in" ? qty : -qty, notes: adjustNotes }),
    });
    setAdjusting(false);
    setAdjustItem(null);
    load();
  }

  async function openHistory(item: InvItem) {
    setHistoryItem(item);
    setHistoryLoading(true);
    const r = await fetch(`/api/supply-chain/inventory?id=${item.id}`);
    const d = await r.json();
    setHistoryTxns(d.transactions ?? []);
    setHistoryLoading(false);
  }

  async function saveReorderLevel(item: InvItem, val: string) {
    const level = Number(val) || 0;
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, reorder_level: level } : i));
    await fetch("/api/supply-chain/inventory", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set-reorder", inventoryId: item.id, reorderLevel: level }),
    });
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center" style={{ background: "#e8ecf1" }}><div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="min-h-screen" style={{ background: "#e8ecf1" }}>
      <div className="max-w-6xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push("/supply-chain")} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors cursor-pointer">
              <ChevronLeft className="w-4 h-4" /> Supply Chain
            </button>
            <div className="w-px h-5 bg-gray-300" />
            <div className="flex items-center gap-2">
              <Warehouse className="w-5 h-5 text-amber-600" />
              <h1 className="text-lg font-bold text-gray-900">Inventory</h1>
              <span className="text-xs text-gray-400">{items.length} items · single warehouse</span>
            </div>
          </div>
          <button onClick={sync} disabled={syncing} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 transition-colors cursor-pointer disabled:opacity-40">
            {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Sync Catalog
          </button>
        </div>

        <p className="text-xs text-gray-500 mb-4">
          Tracks stock for both raw materials and finished goods. BOM &quot;Qty In Stock&quot; suggests from here, and approved GRNs add receipts automatically.
          {items.length === 0 && <span className="text-amber-600"> Click &quot;Sync Catalog&quot; to pull in every material &amp; product for the first time.</span>}
        </p>

        {lowStockCount > 0 && (
          <button onClick={() => setLowStockOnly(v => !v)} className={`mb-4 flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs w-full text-left transition-colors cursor-pointer ${lowStockOnly ? "bg-red-500/10 border border-red-500/30" : "bg-amber-500/[0.06] border border-amber-500/20 hover:bg-amber-500/10"}`}>
            <AlertTriangle className={`w-4 h-4 ${lowStockOnly ? "text-red-600" : "text-amber-600"}`} />
            <span className={lowStockOnly ? "text-red-700" : "text-amber-700"}>{lowStockCount} item{lowStockCount !== 1 ? "s" : ""} below reorder level{lowStockOnly ? " — showing only these" : " — click to filter"}</span>
          </button>
        )}

        <div className="flex gap-2 mb-4">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search inventory..."
              className="w-full bg-white border border-gray-200/80 rounded-lg pl-9 pr-3 py-2 text-sm text-gray-900 placeholder-gray-600 focus:outline-none focus:border-amber-500/50" />
          </div>
          <div className="relative">
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as typeof typeFilter)}
              className="bg-white border border-gray-200/80 rounded-lg px-3 py-2 text-sm text-gray-900 appearance-none pr-8 focus:outline-none cursor-pointer">
              <option value="ALL">All Types</option>
              <option value="material">Raw Materials</option>
              <option value="product">Finished Goods</option>
            </select>
            <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
          </div>
        </div>

        <div className="rounded-xl bg-white/70 border border-gray-200/80 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200/70">
                  <th className="text-left px-4 py-3 text-gray-500 font-medium w-8">#</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">Item</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium w-32">Type</th>
                  <th className="text-center px-4 py-3 text-gray-500 font-medium w-20">Unit</th>
                  <th className="text-center px-4 py-3 text-gray-500 font-medium w-28">Qty On Hand</th>
                  <th className="text-center px-4 py-3 text-gray-500 font-medium w-28">Reorder Level</th>
                  <th className="text-center px-4 py-3 text-gray-500 font-medium w-40">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item, idx) => {
                  const low = item.reorder_level > 0 && item.qty_on_hand < item.reorder_level;
                  return (
                    <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50/80">
                      <td className="px-4 py-2.5 text-gray-400 text-xs">{idx + 1}</td>
                      <td className="px-4 py-2.5 text-gray-900 text-xs font-medium">
                        {item.item_name}
                        {low && <span className="ml-2 inline-flex items-center gap-0.5 text-[10px] text-red-600"><AlertTriangle className="w-3 h-3" /> low stock</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${item.item_type === "material" ? "bg-teal-500/10 text-teal-700" : "bg-violet-500/10 text-violet-700"}`}>
                          {item.item_type === "material" ? "Raw Material" : "Finished Good"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-center text-gray-500 text-xs">{item.unit}</td>
                      <td className={`px-4 py-2.5 text-center text-sm font-semibold ${low ? "text-red-600" : "text-gray-900"}`}>{item.qty_on_hand}</td>
                      <td className="px-4 py-2.5">
                        <input type="number" min="0" defaultValue={item.reorder_level || ""} placeholder="—"
                          onBlur={e => saveReorderLevel(item, e.target.value)}
                          className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-center text-gray-700 text-xs focus:outline-none focus:border-amber-500/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => openAdjust(item)} className="flex items-center gap-1 px-2 py-1 rounded text-[11px] bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 cursor-pointer">
                            <Plus className="w-3 h-3" /> Adjust
                          </button>
                          <button onClick={() => openHistory(item)} className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 cursor-pointer" title="Transaction history">
                            <History className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400 text-sm">
                    {items.length === 0 ? 'No inventory yet — click "Sync Catalog" above.' : "No items match your filters."}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Adjust Modal */}
      {adjustItem && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6" onClick={() => setAdjustItem(null)}>
          <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-gray-900 font-semibold text-sm">Adjust Stock</h3>
              <button onClick={() => setAdjustItem(null)} className="p-1 rounded hover:bg-gray-100 text-gray-500 cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-xs text-gray-500 mb-4">{adjustItem.item_name} — currently {adjustItem.qty_on_hand} {adjustItem.unit}</p>
            <div className="flex gap-1 mb-3 bg-gray-100 rounded-lg p-1">
              <button onClick={() => setAdjustDirection("in")} className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-colors ${adjustDirection === "in" ? "bg-white text-emerald-700 shadow-sm" : "text-gray-500"}`}>
                <Plus className="w-3.5 h-3.5" /> Stock In
              </button>
              <button onClick={() => setAdjustDirection("out")} className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-colors ${adjustDirection === "out" ? "bg-white text-red-600 shadow-sm" : "text-gray-500"}`}>
                <Minus className="w-3.5 h-3.5" /> Stock Out
              </button>
            </div>
            <label className="text-xs text-gray-500 mb-1 block">Quantity</label>
            <input type="number" min="0" value={adjustQty} onChange={e => setAdjustQty(e.target.value)} autoFocus
              className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 mb-3 focus:outline-none focus:border-amber-500/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
            <label className="text-xs text-gray-500 mb-1 block">Reason / Notes</label>
            <input value={adjustNotes} onChange={e => setAdjustNotes(e.target.value)} placeholder="e.g. opening balance, physical count, wastage"
              className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 mb-4 focus:outline-none focus:border-amber-500/50" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setAdjustItem(null)} className="px-4 py-1.5 rounded-lg text-sm text-gray-500 hover:text-gray-900 cursor-pointer">Cancel</button>
              <button onClick={submitAdjust} disabled={adjusting || !adjustQty} className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm bg-amber-600 hover:bg-amber-500 text-white font-medium transition-colors disabled:opacity-40 cursor-pointer">
                {adjusting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History Modal */}
      {historyItem && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6" onClick={() => setHistoryItem(null)}>
          <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-lg max-h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200/70">
              <div>
                <h3 className="text-gray-900 font-semibold text-sm">Transaction History</h3>
                <p className="text-xs text-gray-500 mt-0.5">{historyItem.item_name}</p>
              </div>
              <button onClick={() => setHistoryItem(null)} className="p-1 rounded hover:bg-gray-100 text-gray-500 cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {historyLoading && <div className="px-5 py-8 text-center"><Loader2 className="w-5 h-5 animate-spin text-amber-600 mx-auto" /></div>}
              {!historyLoading && historyTxns.length === 0 && <div className="px-5 py-10 text-center text-gray-400 text-sm">No transactions yet</div>}
              {historyTxns.map(t => (
                <div key={t.id} className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
                  <div>
                    <div className="text-xs text-gray-900 font-medium capitalize">{t.txn_type}{t.ref_type ? ` — ${t.ref_type}` : ""}</div>
                    <div className="text-[11px] text-gray-500">{new Date(t.created_at).toLocaleString()}{t.notes ? ` · ${t.notes}` : ""}</div>
                  </div>
                  <span className={`text-sm font-semibold ${Number(t.qty) >= 0 ? "text-emerald-600" : "text-red-600"}`}>{Number(t.qty) >= 0 ? "+" : ""}{t.qty}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
