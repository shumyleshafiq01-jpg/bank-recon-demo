"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useMemo } from "react";
import {
  ChevronLeft, FileSpreadsheet, Plus, Trash2, Save, X,
  Loader2, Check, FileText, Package, ChevronDown, Boxes, Beaker,
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
  has_recipe: boolean;
};

type BomMaterial = {
  id: string; material_name: string; unit: string; category: string;
  qty_needed: number; est_cost: number; unit_type: string; remarks: string;
  calc_breakdown: string; qty_in_stock: number; extra_qty: number; qty_to_order: number;
};

// These categories are logistics/service line items, not physical materials
// to procure from a vendor — hidden from the Raw Materials view.
const HIDDEN_MATERIAL_CATEGORIES = ["Export Charges", "Labor"];

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending", color: "bg-gray-200/70 text-gray-500" },
  { value: "in_stock", label: "In Stock", color: "bg-emerald-500/10 text-emerald-600" },
  { value: "ordered", label: "Ordered", color: "bg-blue-500/10 text-blue-600" },
  { value: "production", label: "In Production", color: "bg-amber-500/10 text-amber-600" },
];

export default function BomPage() {
  const router = useRouter();
  const [boms, setBoms] = useState<Bom[]>([]);
  const [loading, setLoading] = useState(true);

  // Active BOM
  const [bom, setBom] = useState<Bom | null>(null);
  const [items, setItems] = useState<BomItem[]>([]);
  const [materials, setMaterials] = useState<BomMaterial[]>([]);
  const [planFillPct, setPlanFillPct] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savingMaterials, setSavingMaterials] = useState(false);
  const [materialsSaved, setMaterialsSaved] = useState(false);

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
    setMaterials(d.materials ?? []);
    setPlanFillPct(d.planFillPct ?? null);
    setShowList(false);
    setSaved(true);
    setMaterialsSaved(true);
  }

  function updateItem(id: string, field: "in_stock" | "item_status" | "remarks", val: string | number) {
    setItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      const next = { ...item };
      if (field === "in_stock") {
        next.in_stock = Number(val) || 0;
        next.to_order = Math.max(next.cartons_required - next.in_stock, 0);
      } else if (field === "item_status") {
        next.item_status = String(val);
      } else if (field === "remarks") {
        next.remarks = String(val);
      }
      return next;
    }));
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

  function updateMaterial(id: string, field: "qty_in_stock" | "extra_qty" | "remarks", val: string | number) {
    setMaterials(prev => prev.map(m => {
      if (m.id !== id) return m;
      const next = { ...m };
      if (field === "qty_in_stock") {
        next.qty_in_stock = Number(val) || 0;
        next.qty_to_order = Math.max(next.qty_needed - next.qty_in_stock, 0) + next.extra_qty;
      } else if (field === "extra_qty") {
        next.extra_qty = Number(val) || 0;
        next.qty_to_order = Math.max(next.qty_needed - next.qty_in_stock, 0) + next.extra_qty;
      } else if (field === "remarks") {
        next.remarks = String(val);
      }
      return next;
    }));
    setMaterialsSaved(false);
  }

  async function saveMaterials() {
    if (materials.length === 0) return;
    setSavingMaterials(true);
    await fetch("/api/supply-chain/boms", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save-materials",
        items: materials.map(m => ({ id: m.id, qtyNeeded: m.qty_needed, qtyInStock: m.qty_in_stock, extraQty: m.extra_qty, remarks: m.remarks })),
      }),
    });
    setSavingMaterials(false);
    setMaterialsSaved(true);
  }

  async function deleteBom(id: string) {
    await fetch("/api/supply-chain/boms", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });
    setBoms(prev => prev.filter(b => b.id !== id));
    if (bom?.id === id) { setBom(null); setItems([]); }
  }

  const finishedGoods = useMemo(() => items.filter(it => !it.has_recipe), [items]);
  const manufacturedGoods = useMemo(() => items.filter(it => it.has_recipe), [items]);
  const visibleMaterials = useMemo(() => materials.filter(m => !HIDDEN_MATERIAL_CATEGORIES.includes(m.category)), [materials]);

  const totals = useMemo(() => ({
    cartons: items.reduce((s, it) => s + it.cartons_required, 0),
    toOrder: finishedGoods.reduce((s, it) => s + it.to_order, 0),
    weight: items.reduce((s, it) => s + it.net_weight_total, 0),
    value: items.reduce((s, it) => s + it.value_total, 0),
    materialsCost: visibleMaterials.reduce((s, m) => s + m.est_cost, 0),
  }), [items, finishedGoods, visibleMaterials]);

  if (loading) return <div className="min-h-screen flex items-center justify-center" style={{ background: "#e8ecf1" }}><div className="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="min-h-screen" style={{ background: "#e8ecf1" }}>
      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push("/supply-chain")} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors cursor-pointer">
              <ChevronLeft className="w-4 h-4" /> Supply Chain
            </button>
            <div className="w-px h-5 bg-gray-300" />
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-violet-600" />
              <h1 className="text-lg font-bold text-gray-900">Bill of Materials</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowList(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors cursor-pointer">
              <FileText className="w-4 h-4" /> Saved BOMs
            </button>
            <button onClick={openGenerate} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-violet-500/10 text-violet-600 hover:bg-violet-500/20 transition-colors cursor-pointer">
              <Plus className="w-4 h-4" /> Generate from CBM Plan
            </button>
          </div>
        </div>

        {!bom ? (
          <div className="rounded-xl bg-white/70 border border-gray-200/80 px-6 py-16 text-center">
            <Boxes className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm mb-1">No BOM open</p>
            <p className="text-gray-400 text-xs mb-4">Generate a Bill of Materials from a saved CBM packing plan, or open a saved BOM.</p>
            <button onClick={openGenerate} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm bg-violet-500/10 text-violet-600 hover:bg-violet-500/20 transition-colors cursor-pointer">
              <Plus className="w-4 h-4" /> Generate from CBM Plan
            </button>
          </div>
        ) : (
          <>
            {/* BOM header info */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4 p-4 rounded-xl bg-white/70 border border-gray-200/80">
              <div>
                <h2 className="text-gray-900 font-semibold">{bom.bom_name}</h2>
                <p className="text-xs text-gray-500">
                  {bom.buyer_name && `${bom.buyer_name} · `}{bom.container_type.toUpperCase()}
                  <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] ${bom.status === "confirmed" ? "bg-emerald-500/10 text-emerald-600" : bom.status === "ordered" ? "bg-blue-500/10 text-blue-600" : "bg-gray-500/10 text-gray-500"}`}>{bom.status}</span>
                </p>
              </div>
              <div className="flex items-center gap-4 text-sm">
                {planFillPct !== null && (
                  <span className="text-gray-500">CBM: <span className={`font-medium ${planFillPct > 100 ? "text-red-600" : planFillPct > 95 ? "text-amber-600" : "text-emerald-600"}`}>{planFillPct}%</span></span>
                )}
                <span className="text-gray-500">Cartons: <span className="text-gray-900 font-medium">{totals.cartons}</span></span>
                <span className="text-gray-500">To Order: <span className="text-amber-600 font-medium">{totals.toOrder}</span></span>
                <span className="text-gray-500">Weight: <span className="text-gray-900 font-medium">{totals.weight.toFixed(1)} kg</span></span>
                <span className="text-gray-500">Value: <span className="text-gray-900 font-medium">${totals.value.toFixed(2)}</span></span>
              </div>
            </div>

            {/* Finished Goods to Purchase — products with no recipe on file (e.g. Laziza, Rafan, Lipton) are bought ready-made */}
            <div className="flex items-center gap-2 mb-2 mt-6">
              <Boxes className="w-4 h-4 text-violet-600" />
              <h3 className="text-sm font-semibold text-gray-900">Finished Goods to Purchase</h3>
              <span className="text-xs text-gray-400">— products bought ready-made (no recipe on file)</span>
            </div>
            <div className="rounded-xl bg-white/70 border border-gray-200/80 overflow-hidden mb-6">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200/70">
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
                    {finishedGoods.map((item, idx) => (
                      <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50/80">
                        <td className="px-4 py-2.5 text-gray-400 text-xs">{idx + 1}</td>
                        <td className="px-4 py-2.5 text-gray-900 text-xs font-medium">{item.product_name}</td>
                        <td className="px-4 py-2.5 text-gray-500 text-xs">{item.packing_desc}</td>
                        <td className="px-4 py-2.5 text-center text-gray-900 text-xs font-medium">{item.cartons_required}</td>
                        <td className="px-4 py-2.5 text-center text-gray-500 text-xs">{item.pcs_required || "—"}</td>
                        <td className="px-4 py-2.5">
                          <input type="number" min="0" value={item.in_stock || ""} onChange={e => updateItem(item.id, "in_stock", e.target.value)}
                            className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-center text-gray-900 text-sm focus:outline-none focus:border-violet-500/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                        </td>
                        <td className={`px-4 py-2.5 text-center text-xs font-medium ${item.to_order > 0 ? "text-amber-600" : "text-emerald-600"}`}>{item.to_order}</td>
                        <td className="px-4 py-2.5">
                          <div className="relative">
                            <select value={item.item_status} onChange={e => updateItem(item.id, "item_status", e.target.value)}
                              className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-gray-900 text-xs appearance-none pr-6 focus:outline-none focus:border-violet-500/50 cursor-pointer">
                              {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value} className="bg-white">{s.label}</option>)}
                            </select>
                            <ChevronDown className="w-3 h-3 absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <input type="text" value={item.remarks} onChange={e => updateItem(item.id, "remarks", e.target.value)} placeholder="..."
                            className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-gray-700 text-xs focus:outline-none focus:border-violet-500/50" />
                        </td>
                      </tr>
                    ))}
                    {finishedGoods.length === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400 text-xs">{manufacturedGoods.length > 0 ? "Every product in this BOM has a recipe — see Raw Materials below." : "This BOM has no items."}</td></tr>}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-200/70">
                {saved && <span className="flex items-center gap-1 text-xs text-emerald-600"><Check className="w-3.5 h-3.5" /> Saved</span>}
                <button onClick={saveItems} disabled={saving} className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm bg-violet-600 hover:bg-violet-500 text-white font-medium transition-colors disabled:opacity-40 cursor-pointer">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save BOM
                </button>
              </div>
            </div>

            {/* Raw Materials to Procure/Produce — decomposed from each manufactured product's recipe */}
            {manufacturedGoods.length > 0 && (
              <>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Beaker className="w-4 h-4 text-teal-600" />
                    <h3 className="text-sm font-semibold text-gray-900">Raw Materials to Procure</h3>
                    <span className="text-xs text-gray-400">— decomposed from {manufacturedGoods.map(m => m.product_name).join(", ")}</span>
                  </div>
                  <span className="text-xs text-gray-500">Est. total: <span className="text-gray-900 font-medium">${totals.materialsCost.toFixed(2)}</span></span>
                </div>
                <div className="rounded-xl bg-white/70 border border-gray-200/80 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200/70">
                          <th className="text-left px-4 py-3 text-gray-500 font-medium w-8">#</th>
                          <th className="text-left px-4 py-3 text-gray-500 font-medium">Material</th>
                          <th className="text-left px-4 py-3 text-gray-500 font-medium w-32">Category</th>
                          <th className="text-left px-4 py-3 text-gray-500 font-medium w-40">Calculation</th>
                          <th className="text-center px-4 py-3 text-gray-500 font-medium w-20">Unit</th>
                          <th className="text-center px-4 py-3 text-gray-500 font-medium w-20">Required Qty</th>
                          <th className="text-center px-4 py-3 text-gray-500 font-medium w-24">Qty In Stock</th>
                          <th className="text-center px-4 py-3 text-gray-500 font-medium w-20">Extra Qty</th>
                          <th className="text-center px-4 py-3 text-gray-500 font-medium w-24">Qty To Order</th>
                          <th className="text-center px-4 py-3 text-gray-500 font-medium w-20">Est. Cost</th>
                          <th className="text-left px-4 py-3 text-gray-500 font-medium w-32">Remarks</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleMaterials.map((m, idx) => (
                          <tr key={m.id} className="border-b border-gray-100 hover:bg-gray-50/80">
                            <td className="px-4 py-2.5 text-gray-400 text-xs">{idx + 1}</td>
                            <td className="px-4 py-2.5 text-gray-900 text-xs font-medium">{m.material_name}</td>
                            <td className="px-4 py-2.5 text-gray-500 text-xs">{m.category || "—"}</td>
                            <td className="px-4 py-2.5 text-gray-400 text-[11px] font-mono">{m.calc_breakdown || "—"}</td>
                            <td className="px-4 py-2.5 text-center text-gray-500 text-xs">{m.unit || "—"}</td>
                            <td className="px-4 py-2.5 text-center text-gray-900 text-xs font-medium">{m.qty_needed}</td>
                            <td className="px-4 py-2.5">
                              <input type="number" min="0" value={m.qty_in_stock || ""} onChange={e => updateMaterial(m.id, "qty_in_stock", e.target.value)}
                                className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-center text-gray-900 text-sm focus:outline-none focus:border-teal-500/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                            </td>
                            <td className="px-4 py-2.5">
                              <input type="number" min="0" value={m.extra_qty || ""} onChange={e => updateMaterial(m.id, "extra_qty", e.target.value)}
                                className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-center text-gray-900 text-sm focus:outline-none focus:border-teal-500/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                            </td>
                            <td className="px-4 py-2.5 text-center text-teal-700 text-xs font-semibold">{m.qty_to_order}</td>
                            <td className="px-4 py-2.5 text-center text-gray-500 text-xs">${m.est_cost.toFixed(2)}</td>
                            <td className="px-4 py-2.5">
                              <input type="text" value={m.remarks || ""} onChange={e => updateMaterial(m.id, "remarks", e.target.value)} placeholder="..."
                                className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-gray-700 text-xs focus:outline-none focus:border-teal-500/50" />
                            </td>
                          </tr>
                        ))}
                        {visibleMaterials.length === 0 && <tr><td colSpan={11} className="px-4 py-8 text-center text-gray-400 text-xs">No raw materials found — the manufactured product(s) above have no recipe saved in the Product List yet.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-200/70">
                    {materialsSaved && <span className="flex items-center gap-1 text-xs text-emerald-600"><Check className="w-3.5 h-3.5" /> Saved</span>}
                    <button onClick={saveMaterials} disabled={savingMaterials || visibleMaterials.length === 0} className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm bg-teal-600 hover:bg-teal-500 text-white font-medium transition-colors disabled:opacity-40 cursor-pointer">
                      {savingMaterials ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      Save Materials
                    </button>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Generate Modal */}
      {showGenerate && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6" onClick={() => setShowGenerate(false)}>
          <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-lg max-h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200/70">
              <div>
                <h3 className="text-gray-900 font-semibold">Generate BOM from CBM Plan</h3>
                <p className="text-xs text-gray-500 mt-0.5">Pick a saved packing plan to build its Bill of Materials</p>
              </div>
              <button onClick={() => setShowGenerate(false)} className="p-1 rounded hover:bg-gray-100 text-gray-500 cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {plansLoading && <div className="px-5 py-8 text-center"><Loader2 className="w-5 h-5 animate-spin text-violet-600 mx-auto" /></div>}
              {!plansLoading && plans.length === 0 && <div className="px-5 py-10 text-center text-gray-400 text-sm">No saved CBM plans yet. Create one in the CBM Calculator first.</div>}
              {plans.map(plan => {
                const gen = generatingId === plan.id;
                return (
                  <button key={plan.id} onClick={() => generateFromPlan(plan)} disabled={gen}
                    className="w-full flex items-center gap-3 px-5 py-3 border-b border-gray-100 text-left hover:bg-gray-50 transition-colors cursor-pointer">
                    <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0">
                      <Package className="w-4 h-4 text-violet-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-gray-900 text-sm font-medium truncate">{plan.plan_name}</div>
                      <div className="text-xs text-gray-500 truncate">{plan.buyer_name && `${plan.buyer_name} · `}{plan.container_type.toUpperCase()} · {plan.total_cartons} cartons · {plan.total_fill_pct}%</div>
                    </div>
                    {gen && <Loader2 className="w-4 h-4 animate-spin text-violet-600 shrink-0" />}
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
          <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-lg max-h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200/70">
              <h3 className="text-gray-900 font-semibold">Saved BOMs</h3>
              <button onClick={() => setShowList(false)} className="p-1 rounded hover:bg-gray-100 text-gray-500 cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {boms.length === 0 && <div className="px-5 py-10 text-center text-gray-400 text-sm">No BOMs yet</div>}
              {boms.map(b => (
                <div key={b.id} className="flex items-center gap-3 px-5 py-3 border-b border-gray-100 hover:bg-gray-50">
                  <button onClick={() => loadBom(b.id)} className="flex-1 text-left cursor-pointer">
                    <div className="text-gray-900 text-sm font-medium">{b.bom_name}</div>
                    <div className="text-xs text-gray-500">
                      {b.buyer_name && `${b.buyer_name} · `}{b.container_type.toUpperCase()}
                      <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] ${b.status === "confirmed" ? "bg-emerald-500/10 text-emerald-600" : b.status === "ordered" ? "bg-blue-500/10 text-blue-600" : "bg-gray-500/10 text-gray-500"}`}>{b.status}</span>
                    </div>
                  </button>
                  <button onClick={() => deleteBom(b.id)} className="p-1.5 rounded hover:bg-red-500/10 text-gray-400 hover:text-red-600 transition-colors cursor-pointer">
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
