"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useMemo } from "react";
import {
  ChevronLeft, Plus, Trash2, Save, Package, Calculator,
  AlertTriangle, Check, Search, X, ChevronDown, Settings,
  FileText, Loader2,
} from "lucide-react";

type Product = {
  id: string; brand: string; product_name: string; packing_desc: string;
  length_in: number; width_in: number; height_in: number;
  max_20ft: number; max_40ft: number; max_40hc: number;
  net_weight_kg: number; cbm_per_carton: number;
};

type PlanItem = {
  productId: string; product?: Product; cartons: number;
  fillPct: number; netWeightTotal: number; unitPriceFob: number;
  totalValue: number; remarks: string;
};

type PackingPlan = {
  id: string; plan_name: string; buyer_name: string; container_type: string;
  status: string; notes: string; total_cartons: number; total_fill_pct: number;
};

type ContainerType = { id: string; name: string; label: string; max_cbm: number };

const CONTAINER_COLORS: Record<string, string> = {
  "20ft": "emerald", "40ft": "blue", "40hc": "violet",
};

export default function CbmCalculatorPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [containers, setContainers] = useState<ContainerType[]>([]);
  const [capacityThreshold, setCapacityThreshold] = useState(95);
  const [loading, setLoading] = useState(true);

  // Plan state
  const [planName, setPlanName] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [containerType, setContainerType] = useState("20ft");
  const [items, setItems] = useState<PlanItem[]>([]);
  const [planId, setPlanId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Product picker
  const [showPicker, setShowPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerBrand, setPickerBrand] = useState("ALL");

  // Saved plans list
  const [showPlans, setShowPlans] = useState(false);
  const [plans, setPlans] = useState<PackingPlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(false);

  // Settings modal
  const [showSettings, setShowSettings] = useState(false);
  const [settingsThreshold, setSettingsThreshold] = useState("95");

  useEffect(() => {
    Promise.all([
      fetch("/api/supply-chain/products").then(r => r.json()),
      fetch("/api/supply-chain/settings").then(r => r.json()),
    ]).then(([pData, sData]) => {
      setProducts(pData.products ?? []);
      setContainers(sData.containers ?? []);
      const th = Number(sData.settings?.capacity_threshold ?? 95);
      setCapacityThreshold(th);
      setSettingsThreshold(String(th));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const brands = useMemo(() => {
    const set = new Set(products.map(p => p.brand));
    return ["ALL", ...Array.from(set).sort()];
  }, [products]);

  const filteredProducts = useMemo(() => {
    let list = products;
    if (pickerBrand !== "ALL") list = list.filter(p => p.brand === pickerBrand);
    if (pickerSearch) {
      const q = pickerSearch.toLowerCase();
      list = list.filter(p => p.product_name.toLowerCase().includes(q) || p.packing_desc?.toLowerCase().includes(q));
    }
    return list;
  }, [products, pickerBrand, pickerSearch]);

  function getMaxForContainer(p: Product, ct: string) {
    if (ct === "40ft") return p.max_40ft;
    if (ct === "40hc") return p.max_40hc;
    return p.max_20ft;
  }

  function calcFillPct(cartons: number, product: Product, ct: string) {
    const max = getMaxForContainer(product, ct);
    if (!max) return 0;
    return Math.round((cartons / max) * 10000) / 100;
  }

  function addProduct(product: Product) {
    if (items.find(it => it.productId === product.id)) return;
    setItems(prev => [...prev, {
      productId: product.id, product, cartons: 0, fillPct: 0,
      netWeightTotal: 0, unitPriceFob: 0, totalValue: 0, remarks: "",
    }]);
    setShowPicker(false);
    setPickerSearch("");
  }

  function updateItem(idx: number, field: string, val: string | number) {
    setItems(prev => {
      const next = [...prev];
      const item = { ...next[idx] };
      if (field === "cartons") {
        item.cartons = Number(val) || 0;
        if (item.product) {
          item.fillPct = calcFillPct(item.cartons, item.product, containerType);
          item.netWeightTotal = Math.round(item.cartons * item.product.net_weight_kg * 100) / 100;
        }
        item.totalValue = Math.round(item.cartons * item.unitPriceFob * 100) / 100;
      } else if (field === "unitPriceFob") {
        item.unitPriceFob = Number(val) || 0;
        item.totalValue = Math.round(item.cartons * item.unitPriceFob * 100) / 100;
      } else if (field === "remarks") {
        item.remarks = String(val);
      }
      next[idx] = item;
      return next;
    });
    setSaved(false);
  }

  function removeItem(idx: number) {
    setItems(prev => prev.filter((_, i) => i !== idx));
    setSaved(false);
  }

  const totalCartons = items.reduce((s, it) => s + it.cartons, 0);
  const totalFill = items.reduce((s, it) => s + it.fillPct, 0);
  const totalFillRounded = Math.round(totalFill * 100) / 100;
  const totalWeight = items.reduce((s, it) => s + it.netWeightTotal, 0);
  const totalValue = items.reduce((s, it) => s + it.totalValue, 0);
  const isOverCapacity = totalFillRounded > capacityThreshold;
  const isOverFull = totalFillRounded > 100;

  function recalcForContainer(ct: string) {
    setContainerType(ct);
    setItems(prev => prev.map(item => {
      if (!item.product) return item;
      const fillPct = calcFillPct(item.cartons, item.product, ct);
      return { ...item, fillPct };
    }));
  }

  async function savePlan() {
    setSaving(true);
    try {
      let id = planId;
      if (!id) {
        const r = await fetch("/api/supply-chain/packing-plans", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "create", planName: planName || "Untitled Plan", buyerName, containerType }),
        });
        const d = await r.json();
        id = d.id;
        setPlanId(id);
      } else {
        await fetch("/api/supply-chain/packing-plans", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "update", id, planName, buyerName, containerType }),
        });
      }

      await fetch("/api/supply-chain/packing-plans", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save-items", planId: id,
          items: items.map(it => ({
            productId: it.productId, cartons: it.cartons, fillPct: it.fillPct,
            netWeightTotal: it.netWeightTotal, unitPriceFob: it.unitPriceFob,
            totalValue: it.totalValue, remarks: it.remarks,
          })),
        }),
      });
      setSaved(true);
    } catch { /* */ }
    setSaving(false);
  }

  async function loadPlans() {
    setPlansLoading(true);
    const r = await fetch("/api/supply-chain/packing-plans");
    const d = await r.json();
    setPlans(d.plans ?? []);
    setPlansLoading(false);
    setShowPlans(true);
  }

  async function loadPlan(plan: PackingPlan) {
    setPlanId(plan.id);
    setPlanName(plan.plan_name);
    setBuyerName(plan.buyer_name);
    setContainerType(plan.container_type);
    setShowPlans(false);

    const r = await fetch(`/api/supply-chain/packing-plans?id=${plan.id}`);
    const d = await r.json();
    const loadedItems: PlanItem[] = (d.items ?? []).map((it: Record<string, unknown>) => {
      const prod = it.sc_products as Product | null;
      return {
        productId: it.product_id as string,
        product: prod ?? undefined,
        cartons: Number(it.cartons),
        fillPct: Number(it.fill_pct),
        netWeightTotal: Number(it.net_weight_total),
        unitPriceFob: Number(it.unit_price_fob),
        totalValue: Number(it.total_value),
        remarks: (it.remarks as string) || "",
      };
    });
    setItems(loadedItems);
    setSaved(true);
  }

  function newPlan() {
    setPlanId(null);
    setPlanName("");
    setBuyerName("");
    setContainerType("20ft");
    setItems([]);
    setSaved(false);
    setShowPlans(false);
  }

  async function saveThreshold() {
    const val = Number(settingsThreshold);
    if (val > 0 && val <= 100) {
      await fetch("/api/supply-chain/settings", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update-setting", key: "capacity_threshold", value: String(val) }),
      });
      setCapacityThreshold(val);
    }
    setShowSettings(false);
  }

  async function deletePlan(id: string) {
    await fetch("/api/supply-chain/packing-plans", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });
    setPlans(prev => prev.filter(p => p.id !== id));
    if (planId === id) newPlan();
  }

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
              <Calculator className="w-5 h-5 text-emerald-400" />
              <h1 className="text-lg font-bold text-white">CBM Calculator</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowSettings(true)} className="p-2 rounded-lg hover:bg-white/5 text-gray-500 hover:text-gray-300 transition-colors cursor-pointer" title="Settings">
              <Settings className="w-4 h-4" />
            </button>
            <button onClick={loadPlans} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer">
              <FileText className="w-4 h-4" /> Saved Plans
            </button>
            <button onClick={newPlan} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors cursor-pointer">
              <Plus className="w-4 h-4" /> New Plan
            </button>
          </div>
        </div>

        {/* Plan Info Row */}
        <div className="flex flex-wrap gap-3 mb-4">
          <input value={planName} onChange={e => { setPlanName(e.target.value); setSaved(false); }} placeholder="Plan name (e.g. KAFI-2037 Neals)" className="flex-1 min-w-[200px] bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500/50" />
          <input value={buyerName} onChange={e => { setBuyerName(e.target.value); setSaved(false); }} placeholder="Buyer name" className="flex-1 min-w-[200px] bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500/50" />
          <div className="flex items-center gap-1 bg-white/[0.04] border border-white/[0.08] rounded-lg px-1">
            {["20ft", "40ft", "40hc"].map(ct => (
              <button key={ct} onClick={() => recalcForContainer(ct)} className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer ${containerType === ct ? `bg-${CONTAINER_COLORS[ct]}-500/20 text-${CONTAINER_COLORS[ct]}-300` : "text-gray-500 hover:text-gray-300"}`}>
                {ct === "40hc" ? "40HC" : ct.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Capacity Bar */}
        <div className="mb-4 p-4 rounded-xl bg-white/[0.03] border border-white/[0.08]">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-400">Container Fill</span>
              <span className={`text-2xl font-bold ${isOverFull ? "text-red-400" : isOverCapacity ? "text-amber-400" : "text-emerald-400"}`}>{totalFillRounded}%</span>
              <span className="text-xs text-gray-600">/ {capacityThreshold}% threshold</span>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <span className="text-gray-500">Cartons: <span className="text-white font-medium">{totalCartons}</span></span>
              <span className="text-gray-500">Weight: <span className="text-white font-medium">{totalWeight.toFixed(1)} kg</span></span>
              <span className="text-gray-500">Value: <span className="text-white font-medium">${totalValue.toFixed(2)}</span></span>
            </div>
          </div>
          <div className="w-full h-3 bg-gray-800 rounded-full overflow-hidden relative">
            <div className="absolute top-0 h-full bg-gray-700/50 rounded-full" style={{ left: 0, width: `${Math.min(capacityThreshold, 100)}%` }} />
            <div className={`absolute top-0 h-full rounded-full transition-all duration-500 ${isOverFull ? "bg-red-500" : isOverCapacity ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(totalFillRounded, 100)}%` }} />
            <div className="absolute top-0 h-full w-0.5 bg-amber-400/60" style={{ left: `${capacityThreshold}%` }} />
          </div>
          {isOverCapacity && !isOverFull && (
            <div className="flex items-center gap-1.5 mt-2 text-xs text-amber-400">
              <AlertTriangle className="w-3.5 h-3.5" /> Exceeds {capacityThreshold}% recommended threshold
            </div>
          )}
          {isOverFull && (
            <div className="flex items-center gap-1.5 mt-2 text-xs text-red-400">
              <AlertTriangle className="w-3.5 h-3.5" /> Container is overpacked! Reduce cartons.
            </div>
          )}
        </div>

        {/* Items Table */}
        <div className="rounded-xl bg-white/[0.03] border border-white/[0.08] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="text-left px-4 py-3 text-gray-500 font-medium w-8">#</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">Product</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">Packing</th>
                  <th className="text-center px-4 py-3 text-gray-500 font-medium w-20">Max</th>
                  <th className="text-center px-4 py-3 text-gray-500 font-medium w-24">Cartons</th>
                  <th className="text-center px-4 py-3 text-gray-500 font-medium w-20">Fill %</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium w-24">Weight (kg)</th>
                  <th className="text-center px-4 py-3 text-gray-500 font-medium w-24">FOB $/ctn</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium w-24">Value</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium w-32">Remarks</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => {
                  const product = item.product;
                  const maxCap = product ? getMaxForContainer(product, containerType) : 0;
                  const fillColor = item.fillPct > 10 ? "text-amber-400" : item.fillPct > 5 ? "text-emerald-400" : "text-gray-400";
                  return (
                    <tr key={idx} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                      <td className="px-4 py-2.5 text-gray-600">{idx + 1}</td>
                      <td className="px-4 py-2.5">
                        <div className="text-white text-xs font-medium">{product?.product_name ?? "Unknown"}</div>
                        <div className="text-[10px] text-gray-600">{product?.brand}</div>
                      </td>
                      <td className="px-4 py-2.5 text-gray-400 text-xs">{product?.packing_desc ?? ""}</td>
                      <td className="px-4 py-2.5 text-center text-gray-500 text-xs">{maxCap}</td>
                      <td className="px-4 py-2.5">
                        <input type="number" min="0" max={maxCap || 99999} value={item.cartons || ""} onChange={e => updateItem(idx, "cartons", e.target.value)}
                          className="w-full bg-white/[0.06] border border-white/[0.1] rounded px-2 py-1 text-center text-white text-sm focus:outline-none focus:border-emerald-500/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                      </td>
                      <td className={`px-4 py-2.5 text-center font-medium text-xs ${fillColor}`}>{item.fillPct}%</td>
                      <td className="px-4 py-2.5 text-right text-gray-300 text-xs">{item.netWeightTotal.toFixed(1)}</td>
                      <td className="px-4 py-2.5">
                        <input type="number" step="0.01" min="0" value={item.unitPriceFob || ""} onChange={e => updateItem(idx, "unitPriceFob", e.target.value)}
                          className="w-full bg-white/[0.06] border border-white/[0.1] rounded px-2 py-1 text-center text-white text-sm focus:outline-none focus:border-emerald-500/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-300 text-xs">${item.totalValue.toFixed(2)}</td>
                      <td className="px-4 py-2.5">
                        <input type="text" value={item.remarks} onChange={e => updateItem(idx, "remarks", e.target.value)} placeholder="..."
                          className="w-full bg-white/[0.06] border border-white/[0.1] rounded px-2 py-1 text-gray-300 text-xs focus:outline-none focus:border-emerald-500/50" />
                      </td>
                      <td className="px-2 py-2.5">
                        <button onClick={() => removeItem(idx)} className="p-1 rounded hover:bg-red-500/10 text-gray-600 hover:text-red-400 transition-colors cursor-pointer">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {items.length === 0 && (
                  <tr><td colSpan={11} className="px-4 py-12 text-center text-gray-600">No products added. Click &quot;Add Product&quot; to start building your packing plan.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Add Product + Save */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-white/[0.06]">
            <button onClick={() => { setShowPicker(true); setPickerSearch(""); setPickerBrand("ALL"); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors cursor-pointer">
              <Plus className="w-4 h-4" /> Add Product
            </button>
            <div className="flex items-center gap-2">
              {saved && <span className="flex items-center gap-1 text-xs text-emerald-400"><Check className="w-3.5 h-3.5" /> Saved</span>}
              <button onClick={savePlan} disabled={saving || items.length === 0} className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors disabled:opacity-40 cursor-pointer">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Plan
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Product Picker Modal */}
      {showPicker && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6" onClick={() => setShowPicker(false)}>
          <div className="bg-[#141c2e] border border-white/[0.1] rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
              <h3 className="text-white font-semibold">Add Product to Plan</h3>
              <button onClick={() => setShowPicker(false)} className="p-1 rounded hover:bg-white/5 text-gray-500 cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-5 py-3 flex gap-2 border-b border-white/[0.06]">
              <div className="flex-1 relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
                <input value={pickerSearch} onChange={e => setPickerSearch(e.target.value)} placeholder="Search products..." autoFocus
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500/50" />
              </div>
              <div className="relative">
                <select value={pickerBrand} onChange={e => setPickerBrand(e.target.value)}
                  className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white appearance-none pr-8 focus:outline-none cursor-pointer">
                  {brands.map(b => <option key={b} value={b} className="bg-[#141c2e]">{b}</option>)}
                </select>
                <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {filteredProducts.map(p => {
                const alreadyAdded = items.some(it => it.productId === p.id);
                const maxCap = getMaxForContainer(p, containerType);
                return (
                  <button key={p.id} onClick={() => !alreadyAdded && addProduct(p)} disabled={alreadyAdded}
                    className={`w-full flex items-center gap-3 px-5 py-3 border-b border-white/[0.04] text-left transition-colors ${alreadyAdded ? "opacity-40 cursor-default" : "hover:bg-white/[0.04] cursor-pointer"}`}>
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                      <Package className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-white text-sm font-medium truncate">{p.product_name}</div>
                      <div className="text-xs text-gray-500 truncate">{p.brand} &middot; {p.packing_desc}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs text-gray-500">{p.length_in}&times;{p.width_in}&times;{p.height_in}&quot;</div>
                      <div className="text-xs text-gray-600">Max {maxCap}</div>
                    </div>
                    {alreadyAdded && <Check className="w-4 h-4 text-emerald-400 shrink-0" />}
                  </button>
                );
              })}
              {filteredProducts.length === 0 && <div className="px-5 py-8 text-center text-gray-600 text-sm">No products found</div>}
            </div>
          </div>
        </div>
      )}

      {/* Saved Plans Modal */}
      {showPlans && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6" onClick={() => setShowPlans(false)}>
          <div className="bg-[#141c2e] border border-white/[0.1] rounded-2xl w-full max-w-lg max-h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
              <h3 className="text-white font-semibold">Saved Packing Plans</h3>
              <button onClick={() => setShowPlans(false)} className="p-1 rounded hover:bg-white/5 text-gray-500 cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {plansLoading && <div className="px-5 py-8 text-center"><Loader2 className="w-5 h-5 animate-spin text-emerald-400 mx-auto" /></div>}
              {!plansLoading && plans.length === 0 && <div className="px-5 py-8 text-center text-gray-600 text-sm">No saved plans yet</div>}
              {plans.map(plan => (
                <div key={plan.id} className="flex items-center gap-3 px-5 py-3 border-b border-white/[0.04] hover:bg-white/[0.03]">
                  <button onClick={() => loadPlan(plan)} className="flex-1 text-left cursor-pointer">
                    <div className="text-white text-sm font-medium">{plan.plan_name}</div>
                    <div className="text-xs text-gray-500">
                      {plan.buyer_name && `${plan.buyer_name} · `}{plan.container_type.toUpperCase()} &middot; {plan.total_cartons} cartons &middot; {plan.total_fill_pct}%
                      <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] ${plan.status === "confirmed" ? "bg-emerald-500/10 text-emerald-400" : plan.status === "shipped" ? "bg-blue-500/10 text-blue-400" : "bg-gray-500/10 text-gray-500"}`}>{plan.status}</span>
                    </div>
                  </button>
                  <button onClick={() => deletePlan(plan.id)} className="p-1.5 rounded hover:bg-red-500/10 text-gray-600 hover:text-red-400 transition-colors cursor-pointer">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6" onClick={() => setShowSettings(false)}>
          <div className="bg-[#141c2e] border border-white/[0.1] rounded-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-white font-semibold mb-4">CBM Settings</h3>
            <label className="text-sm text-gray-400 block mb-1.5">Capacity Threshold (%)</label>
            <input type="number" min="1" max="100" value={settingsThreshold} onChange={e => setSettingsThreshold(e.target.value)}
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-white text-sm mb-4 focus:outline-none focus:border-emerald-500/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
            <p className="text-xs text-gray-600 mb-4">When container fill exceeds this threshold, a warning is shown. Default: 95%</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowSettings(false)} className="px-4 py-1.5 rounded-lg text-sm text-gray-400 hover:text-white cursor-pointer">Cancel</button>
              <button onClick={saveThreshold} className="px-4 py-1.5 rounded-lg text-sm bg-emerald-600 text-white hover:bg-emerald-500 cursor-pointer">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
