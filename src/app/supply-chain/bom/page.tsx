"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useMemo } from "react";
import {
  ChevronLeft, FileSpreadsheet, Plus, Trash2, Save, X,
  Loader2, Check, FileText, Package, ChevronDown, Boxes,
} from "lucide-react";

type PackingPlan = {
  id: string; plan_name: string; buyer_name: string; container_type: string;
  total_cartons: number; total_fill_pct: number; status: string;
};

type Bom = {
  id: string; bom_name: string; plan_id: string | null; buyer_name: string;
  container_type: string; status: string; notes: string;
};

type BomItem = {
  id: string; product_name: string; packing_desc: string;
  cartons_required: number; pcs_per_carton: number; pcs_required: number;
  net_weight_total: number; value_total: number;
  in_stock: number; to_order: number; item_status: string; remarks: string;
};

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending", color: "bg-gray-500/10 text-gray-400" },
  { value: "in_stock", label: "In Stock", color: "bg-emerald-500/10 text-emerald-400" },
  { value: "ordered", label: "Ordered", color: "bg-blue-500/10 text-blue-400" },
  { value: "production", label: "In Production", color: "bg-amber-500/10 text-amber-400" },
];

export default function BomPage() {
  const router = useRouter();
  const [boms, setBoms] = useState<Bom[]>([]);
  const [loading, setLoading] = useState(true);

  // Active BOM
  const [bom, setBom] = useState<Bom | null>(null);
  const [items, setItems] = useState<BomItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Generate modal
  const [showGenerate, setShowGenerate] = useState(false);
  const [plans, setPlans] = useState<PackingPlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);

  // Saved BOMs list
  const [showList, setShowList] = useState(false);

  async function loadBoms() {
    const r = await fetch("/api/supply-chain/boms");
    const d = await r.json();
    setBoms(d.boms ?? []);
    setLoading(false);
  }

  useEffect(() => { loadBoms(); }, []);

  async function openGenerate() {
    setShowGenerate(true);
    setPlansLoading(true);
    const r = await fetch("/api/supply-chain/packing-plans");
    const d = await r.json();
    setPlans(d.plans ?? []);
    setPlansLoading(false);
  }

  async function generateFromPlan(plan: PackingPlan) {
    setGeneratingId(plan.id);
    const r = await fetch("/api/supply-chain/boms", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "generate-from-plan", planId: plan.id }),
    });
    const d = await r.json();
    setGeneratingId(null);
    setShowGenerate(false);
    if (d.id) {
      await loadBoms();
      loadBom(d.id);
    }
  }

  async function loadBom(id: string) {
    const r = await fetch(`/api/supply-chain/boms?id=${id}`);
    const d = await r.json();
    setBom(d.bom ?? null);
    setItems(d.items ?? []);
    setShowList(false);
    setSaved(true);
  }

  function updateItem(idx: number, field: "in_stock" | "item_status" | "remarks", val: string | number) {
    setItems(prev => {
      const next = [...prev];
      const item = { ...next[idx] };
      if (field === "in_stock") {
        item.in_stock = Number(val) || 0;
        item.to_order = Math.max(item.cartons_required - item.in_stock, 0);
      } else if (field === "item_status") {
        item.item_status = String(val);
      } else if (field === "remarks") {
        item.remarks = String(val);
      }
      next[idx] = item;
      return next;
    });
    setSaved(false);
  }

  async function saveItems() {
    if (!bom) return;
    setSaving(true);
    await fetch("/api/supply-chain/boms", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save-items", bomId: bom.id,
        items: items.map(it => ({ id: it.id, cartonsRequired: it.cartons_required, inStock: it.in_stock, itemStatus: it.item_status, remarks: it.remarks })),
      }),
    });
    setSaving(false);
    setSaved(true);
  }

  async function deleteBom(id: string) {
    await fetch("/api/supply-chain/boms", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });
    setBoms(prev => prev.filter(b => b.id !== id));
    if (bom?.id === id) { setBom(null); setItems([]); }
  }

  const totals = useMemo(() => ({
    cartons: items.reduce((s, it) => s + it.cartons_required, 0),
    toOrder: items.reduce((s, it) => s + it.to_order, 0),
    weight: items.reduce((s, it) => s + it.net_weight_total, 0),
    value: items.reduce((s, it) => s + it.value_total, 0),
  }), [items]);

  if (loading) return <div className="min-h-screen flex items-center justify-center" style={{ background: "#0c1220" }}><div className="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="min-h-screen" style={{ background: "#0c1220" }}>
      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push("/supply-chain")} className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-200 transition-colors cursor-pointer">
              <ChevronLeft className="w-4 h-4" /> Supply Chain
            </button>
            <div className="w-px h-5 bg-gray-700" />
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-violet-400" />
              <h1 className="text-lg font-bold text-white">Bill of Materials</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowList(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer">
              <FileText className="w-4 h-4" /> Saved BOMs
            </button>
            <button onClick={openGenerate} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 transition-colors cursor-pointer">
              <Plus className="w-4 h-4" /> Generate from CBM Plan
            </button>
          </div>
        </div>

        {!bom ? (
          <div className="rounded-xl bg-white/[0.03] border border-white/[0.08] px-6 py-16 text-center">
            <Boxes className="w-12 h-12 text-gray-700 mx-auto mb-3" />
            <p className="text-gray-400 text-sm mb-1">No BOM open</p>
            <p className="text-gray-600 text-xs mb-4">Generate a Bill of Materials from a saved CBM packing plan, or open a saved BOM.</p>
            <button onClick={openGenerate} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 transition-colors cursor-pointer">
              <Plus className="w-4 h-4" /> Generate from CBM Plan
            </button>
          </div>
        ) : (
          <>
            {/* BOM header info */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4 p-4 rounded-xl bg-white/[0.03] border border-white/[0.08]">
              <div>
                <h2 className="text-white font-semibold">{bom.bom_name}</h2>
                <p className="text-xs text-gray-500">
                  {bom.buyer_name && `${bom.buyer_name} · `}{bom.container_type.toUpperCase()}
                  <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] ${bom.status === "confirmed" ? "bg-emerald-500/10 text-emerald-400" : bom.status === "ordered" ? "bg-blue-500/10 text-blue-400" : "bg-gray-500/10 text-gray-500"}`}>{bom.status}</span>
                </p>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-gray-500">Cartons: <span className="text-white font-medium">{totals.cartons}</span></span>
                <span className="text-gray-500">To Order: <span className="text-amber-400 font-medium">{totals.toOrder}</span></span>
                <span className="text-gray-500">Weight: <span className="text-white font-medium">{totals.weight.toFixed(1)} kg</span></span>
                <span className="text-gray-500">Value: <span className="text-white font-medium">${totals.value.toFixed(2)}</span></span>
              </div>
            </div>

            {/* BOM items table */}
            <div className="rounded-xl bg-white/[0.03] border border-white/[0.08] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.06]">
                      <th className="text-left px-4 py-3 text-gray-500 font-medium w-8">#</th>
                      <th className="text-left px-4 py-3 text-gray-500 font-medium">Product</th>
                      <th className="text-left px-4 py-3 text-gray-500 font-medium">Packing</th>
                      <th className="text-center px-4 py-3 text-gray-500 font-medium w-24">Cartons Req.</th>
                      <th className="text-center px-4 py-3 text-gray-500 font-medium w-20">Pcs</th>
                      <th className="text-center px-4 py-3 text-gray-500 font-medium w-24">In Stock</th>
                      <th className="text-center px-4 py-3 text-gray-500 font-medium w-24">To Order</th>
                      <th className="text-center px-4 py-3 text-gray-500 font-medium w-32">Status</th>
                      <th className="text-left px-4 py-3 text-gray-500 font-medium w-32">Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => (
                      <tr key={item.id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                        <td className="px-4 py-2.5 text-gray-600 text-xs">{idx + 1}</td>
                        <td className="px-4 py-2.5 text-white text-xs font-medium">{item.product_name}</td>
                        <td className="px-4 py-2.5 text-gray-500 text-xs">{item.packing_desc}</td>
                        <td className="px-4 py-2.5 text-center text-white text-xs font-medium">{item.cartons_required}</td>
                        <td className="px-4 py-2.5 text-center text-gray-400 text-xs">{item.pcs_required || "—"}</td>
                        <td className="px-4 py-2.5">
                          <input type="number" min="0" value={item.in_stock || ""} onChange={e => updateItem(idx, "in_stock", e.target.value)}
                            className="w-full bg-white/[0.06] border border-white/[0.1] rounded px-2 py-1 text-center text-white text-sm focus:outline-none focus:border-violet-500/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                        </td>
                        <td className={`px-4 py-2.5 text-center text-xs font-medium ${item.to_order > 0 ? "text-amber-400" : "text-emerald-400"}`}>{item.to_order}</td>
                        <td className="px-4 py-2.5">
                          <div className="relative">
                            <select value={item.item_status} onChange={e => updateItem(idx, "item_status", e.target.value)}
                              className="w-full bg-white/[0.06] border border-white/[0.1] rounded px-2 py-1 text-white text-xs appearance-none pr-6 focus:outline-none focus:border-violet-500/50 cursor-pointer">
                              {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value} className="bg-[#141c2e]">{s.label}</option>)}
                            </select>
                            <ChevronDown className="w-3 h-3 absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <input type="text" value={item.remarks} onChange={e => updateItem(idx, "remarks", e.target.value)} placeholder="..."
                            className="w-full bg-white/[0.06] border border-white/[0.1] rounded px-2 py-1 text-gray-300 text-xs focus:outline-none focus:border-violet-500/50" />
                        </td>
                      </tr>
                    ))}
                    {items.length === 0 && <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-600">This BOM has no items.</td></tr>}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-white/[0.06]">
                {saved && <span className="flex items-center gap-1 text-xs text-emerald-400"><Check className="w-3.5 h-3.5" /> Saved</span>}
                <button onClick={saveItems} disabled={saving} className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm bg-violet-600 hover:bg-violet-500 text-white font-medium transition-colors disabled:opacity-40 cursor-pointer">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save BOM
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Generate Modal */}
      {showGenerate && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6" onClick={() => setShowGenerate(false)}>
          <div className="bg-[#141c2e] border border-white/[0.1] rounded-2xl w-full max-w-lg max-h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
              <div>
                <h3 className="text-white font-semibold">Generate BOM from CBM Plan</h3>
                <p className="text-xs text-gray-500 mt-0.5">Pick a saved packing plan to build its Bill of Materials</p>
              </div>
              <button onClick={() => setShowGenerate(false)} className="p-1 rounded hover:bg-white/5 text-gray-500 cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {plansLoading && <div className="px-5 py-8 text-center"><Loader2 className="w-5 h-5 animate-spin text-violet-400 mx-auto" /></div>}
              {!plansLoading && plans.length === 0 && <div className="px-5 py-10 text-center text-gray-600 text-sm">No saved CBM plans yet. Create one in the CBM Calculator first.</div>}
              {plans.map(plan => {
                const gen = generatingId === plan.id;
                return (
                  <button key={plan.id} onClick={() => generateFromPlan(plan)} disabled={gen}
                    className="w-full flex items-center gap-3 px-5 py-3 border-b border-white/[0.04] text-left hover:bg-white/[0.04] transition-colors cursor-pointer">
                    <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0">
                      <Package className="w-4 h-4 text-violet-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-white text-sm font-medium truncate">{plan.plan_name}</div>
                      <div className="text-xs text-gray-500 truncate">{plan.buyer_name && `${plan.buyer_name} · `}{plan.container_type.toUpperCase()} · {plan.total_cartons} cartons · {plan.total_fill_pct}%</div>
                    </div>
                    {gen && <Loader2 className="w-4 h-4 animate-spin text-violet-400 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Saved BOMs Modal */}
      {showList && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6" onClick={() => setShowList(false)}>
          <div className="bg-[#141c2e] border border-white/[0.1] rounded-2xl w-full max-w-lg max-h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
              <h3 className="text-white font-semibold">Saved BOMs</h3>
              <button onClick={() => setShowList(false)} className="p-1 rounded hover:bg-white/5 text-gray-500 cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {boms.length === 0 && <div className="px-5 py-10 text-center text-gray-600 text-sm">No BOMs yet</div>}
              {boms.map(b => (
                <div key={b.id} className="flex items-center gap-3 px-5 py-3 border-b border-white/[0.04] hover:bg-white/[0.03]">
                  <button onClick={() => loadBom(b.id)} className="flex-1 text-left cursor-pointer">
                    <div className="text-white text-sm font-medium">{b.bom_name}</div>
                    <div className="text-xs text-gray-500">
                      {b.buyer_name && `${b.buyer_name} · `}{b.container_type.toUpperCase()}
                      <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] ${b.status === "confirmed" ? "bg-emerald-500/10 text-emerald-400" : b.status === "ordered" ? "bg-blue-500/10 text-blue-400" : "bg-gray-500/10 text-gray-500"}`}>{b.status}</span>
                    </div>
                  </button>
                  <button onClick={() => deleteBom(b.id)} className="p-1.5 rounded hover:bg-red-500/10 text-gray-600 hover:text-red-400 transition-colors cursor-pointer">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
