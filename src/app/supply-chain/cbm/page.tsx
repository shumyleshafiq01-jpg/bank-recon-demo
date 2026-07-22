"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useMemo } from "react";
import {
  ChevronLeft, Plus, Trash2, Save, Package, Calculator,
  AlertTriangle, Check, Search, X, ChevronDown, Settings,
  FileText, Loader2, Lock, Unlock, Wand2,
} from "lucide-react";

type Product = {
  id: string; brand: string; product_name: string; packing_desc: string;
  length_in: number; width_in: number; height_in: number;
  max_20ft: number; max_40ft: number; max_40hc: number;
  net_weight_kg: number; cbm_per_carton: number;
  unit_type: "carton" | "bag";
};

type PlanItem = {
  productId: string; product?: Product; cartons: number;
  fillPct: number; netWeightTotal: number; unitPriceFob: number;
  totalValue: number; remarks: string; locked?: boolean;
};

type PackingPlan = {
  id: string; plan_name: string; buyer_name: string; container_type: string;
  status: string; notes: string; total_cartons: number; total_fill_pct: number;
};

type ContainerType = { id: string; name: string; label: string; max_cbm: number; max_weight_pmt: number };

const CONTAINER_BTN_ACTIVE: Record<string, string> = {
  "20ft": "bg-emerald-500/15 text-emerald-700",
  "40ft": "bg-blue-500/15 text-blue-700",
  "40hc": "bg-violet-500/15 text-violet-700",
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
  const [settingsPmt, setSettingsPmt] = useState<Record<string, string>>({ "20ft": "25", "40ft": "27", "40hc": "27" });

  useEffect(() => {
    Promise.all([
      fetch("/api/supply-chain/products").then(r => r.json()),
      fetch("/api/supply-chain/settings").then(r => r.json()),
    ]).then(([pData, sData]) => {
      setProducts(pData.products ?? []);
      const cts: ContainerType[] = sData.containers ?? [];
      setContainers(cts);
      const th = Number(sData.settings?.capacity_threshold ?? 95);
      setCapacityThreshold(th);
      setSettingsThreshold(String(th));
      const pmt: Record<string, string> = {};
      for (const c of cts) pmt[c.name] = String(c.max_weight_pmt || 0);
      if (Object.keys(pmt).length > 0) setSettingsPmt(pmt);
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

  function getMaxWeightPmt(ct: string) {
    return containers.find(c => c.name === ct)?.max_weight_pmt || 0;
  }

  function calcFillPct(cartons: number, product: Product, ct: string) {
    const max = getMaxForContainer(product, ct);
    if (!max) return 0;
    return Math.round((cartons / max) * 10000) / 100;
  }

  const isBagItem = (it: PlanItem) => it.product?.unit_type === "bag";

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

  function toggleLock(idx: number) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, locked: !it.locked } : it));
  }

  const cartonItems = items.filter(it => !isBagItem(it));
  const bagItems = items.filter(isBagItem);

  const totalCartons = cartonItems.reduce((s, it) => s + it.cartons, 0);
  const totalFill = cartonItems.reduce((s, it) => s + it.fillPct, 0);
  const totalFillRounded = Math.round(totalFill * 100) / 100;
  const totalWeight = items.reduce((s, it) => s + it.netWeightTotal, 0);
  const totalValue = items.reduce((s, it) => s + it.totalValue, 0);
  const isOverCapacity = totalFillRounded > capacityThreshold;
  const isOverFull = totalFillRounded > 100;

  // Suggest carton counts to hit the capacity threshold: scale every
  // UNLOCKED item's cartons by the same factor so the whole plan lands on
  // the threshold, while locked items (fixed quantities — e.g. a buyer
  // wants exactly 500 of one SKU) are left untouched and their fill %
  // is reserved out of the target before scaling the rest.
  const suggestion = useMemo(() => {
    const unlocked = cartonItems.filter(it => !it.locked && it.product);
    if (unlocked.length === 0) return null;

    const lockedFillSum = cartonItems.filter(it => it.locked).reduce((s, it) => s + it.fillPct, 0);
    const unlockedFillSum = unlocked.reduce((s, it) => s + it.fillPct, 0);
    const remainingPct = capacityThreshold - lockedFillSum;

    if (remainingPct <= 0 || unlockedFillSum <= 0) return null;
    if (Math.abs(totalFillRounded - capacityThreshold) < 0.05) return null; // already at target

    const scale = remainingPct / unlockedFillSum;
    const rows = unlocked.map(it => ({
      productId: it.productId,
      name: it.product?.product_name ?? "",
      current: it.cartons,
      suggested: Math.max(0, Math.round(it.cartons * scale)),
    })).filter(r => r.suggested !== r.current);

    if (rows.length === 0) return null;
    return rows;
  }, [cartonItems, capacityThreshold, totalFillRounded]);

  function applySuggestion() {
    if (!suggestion) return;
    const map = new Map(suggestion.map(r => [r.productId, r.suggested]));
    setItems(prev => prev.map(it => {
      const sug = map.get(it.productId);
      if (sug === undefined || !it.product) return it;
      return { ...it, cartons: sug, fillPct: calcFillPct(sug, it.product, containerType), netWeightTotal: Math.round(sug * it.product.net_weight_kg * 100) / 100, totalValue: Math.round(sug * it.unitPriceFob * 100) / 100 };
    }));
    setSaved(false);
  }

  // Rice/bag items are weight-limited (PMT), not carton-count limited —
  // same threshold rule as cartons, just measured in metric tons instead
  // of container volume.
  const totalBags = bagItems.reduce((s, it) => s + it.cartons, 0);
  const totalWeightPmt = bagItems.reduce((s, it) => s + it.netWeightTotal, 0) / 1000;
  const maxWeightPmt = getMaxWeightPmt(containerType);
  const weightFillPct = maxWeightPmt ? Math.round((totalWeightPmt / maxWeightPmt) * 10000) / 100 : 0;
  const isWeightOverCapacity = weightFillPct > capacityThreshold;
  const isWeightOverFull = weightFillPct > 100;

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
    for (const name of ["20ft", "40ft", "40hc"]) {
      const pmtVal = Number(settingsPmt[name] || 0);
      await fetch("/api/supply-chain/settings", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update-container-weight", name, maxWeightPmt: pmtVal }),
      });
    }
    setContainers(prev => prev.map(c => ({ ...c, max_weight_pmt: Number(settingsPmt[c.name] ?? c.max_weight_pmt) })));
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
              <Calculator className="w-5 h-5 text-emerald-600" />
              <h1 className="text-lg font-bold text-gray-900">CBM Calculator</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowSettings(true)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-600 transition-colors cursor-pointer" title="Settings">
              <Settings className="w-4 h-4" />
            </button>
            <button onClick={loadPlans} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors cursor-pointer">
              <FileText className="w-4 h-4" /> Saved Plans
            </button>
            <button onClick={newPlan} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 transition-colors cursor-pointer">
              <Plus className="w-4 h-4" /> New Plan
            </button>
          </div>
        </div>

        {/* Plan Info Row */}
        <div className="flex flex-wrap gap-3 mb-4">
          <input value={planName} onChange={e => { setPlanName(e.target.value); setSaved(false); }} placeholder="Plan name (e.g. KAFI-2037 Neals)" className="flex-1 min-w-[200px] bg-white border border-gray-200/80 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-600 focus:outline-none focus:border-emerald-500/50" />
          <input value={buyerName} onChange={e => { setBuyerName(e.target.value); setSaved(false); }} placeholder="Buyer name" className="flex-1 min-w-[200px] bg-white border border-gray-200/80 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-600 focus:outline-none focus:border-emerald-500/50" />
          <div className="flex items-center gap-1 bg-white border border-gray-200/80 rounded-lg px-1">
            {["20ft", "40ft", "40hc"].map(ct => (
              <button key={ct} onClick={() => recalcForContainer(ct)} className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer ${containerType === ct ? CONTAINER_BTN_ACTIVE[ct] : "text-gray-500 hover:text-gray-600"}`}>
                {ct === "40hc" ? "40HC" : ct.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Capacity Bar */}
        <div className="mb-4 p-4 rounded-xl bg-white/70 border border-gray-200/80">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500">Container Fill</span>
              <span className={`text-2xl font-bold ${isOverFull ? "text-red-600" : isOverCapacity ? "text-amber-600" : "text-emerald-600"}`}>{totalFillRounded}%</span>
              <span className="text-xs text-gray-400">/ {capacityThreshold}% threshold</span>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <span className="text-gray-500">Cartons: <span className="text-gray-900 font-medium">{totalCartons}</span></span>
              <span className="text-gray-500">Weight: <span className="text-gray-900 font-medium">{totalWeight.toFixed(1)} kg</span></span>
              <span className="text-gray-500">Value: <span className="text-gray-900 font-medium">${totalValue.toFixed(2)}</span></span>
            </div>
          </div>
          <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden relative">
            <div className="absolute top-0 h-full bg-gray-300/60 rounded-full" style={{ left: 0, width: `${Math.min(capacityThreshold, 100)}%` }} />
            <div className={`absolute top-0 h-full rounded-full transition-all duration-500 ${isOverFull ? "bg-red-500" : isOverCapacity ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(totalFillRounded, 100)}%` }} />
            <div className="absolute top-0 h-full w-0.5 bg-amber-500/70" style={{ left: `${capacityThreshold}%` }} />
          </div>
          {isOverCapacity && !isOverFull && (
            <div className="flex items-center gap-1.5 mt-2 text-xs text-amber-600">
              <AlertTriangle className="w-3.5 h-3.5" /> Exceeds {capacityThreshold}% recommended threshold
            </div>
          )}
          {isOverFull && (
            <div className="flex items-center gap-1.5 mt-2 text-xs text-red-600">
              <AlertTriangle className="w-3.5 h-3.5" /> Container is overpacked! Reduce cartons.
            </div>
          )}
        </div>

        {/* 95% Suggestion — scales every unlocked item's cartons by the same
            factor to land the whole plan on the capacity threshold. */}
        {suggestion && (
          <div className="mb-4 p-4 rounded-xl bg-emerald-500/[0.04] border border-emerald-500/20">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-sm text-emerald-800 font-medium">
                <Wand2 className="w-4 h-4" /> Try our suggested CBM &mdash; reach {capacityThreshold}%
              </div>
              <button onClick={applySuggestion} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors cursor-pointer">
                <Check className="w-3.5 h-3.5" /> Apply Suggestion
              </button>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-600">
              {suggestion.map(r => (
                <span key={r.productId}>
                  <span className="text-gray-500">{r.name}:</span>{" "}
                  <span className="text-gray-400">{r.current}</span>
                  {" → "}
                  <span className="text-emerald-700 font-semibold">{r.suggested}</span>
                </span>
              ))}
            </div>
            <p className="text-[11px] text-gray-400 mt-1.5">Locked items (🔒) keep their quantity fixed — only unlocked items are scaled.</p>
          </div>
        )}

        {/* Rice / Weight Fill Bar — only appears once a bag-type (weight-limited) product is added */}
        {bagItems.length > 0 && (
          <div className="mb-4 p-4 rounded-xl bg-white/70 border border-gray-200/80">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-500">Rice Weight Fill</span>
                <span className={`text-2xl font-bold ${isWeightOverFull ? "text-red-600" : isWeightOverCapacity ? "text-amber-600" : "text-blue-600"}`}>{weightFillPct}%</span>
                <span className="text-xs text-gray-400">/ {capacityThreshold}% threshold &middot; max {maxWeightPmt || "—"} PMT</span>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-gray-500">Bags: <span className="text-gray-900 font-medium">{totalBags}</span></span>
                <span className="text-gray-500">Weight: <span className="text-gray-900 font-medium">{totalWeightPmt.toFixed(2)} PMT</span></span>
              </div>
            </div>
            <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden relative">
              <div className="absolute top-0 h-full bg-gray-300/60 rounded-full" style={{ left: 0, width: `${Math.min(capacityThreshold, 100)}%` }} />
              <div className={`absolute top-0 h-full rounded-full transition-all duration-500 ${isWeightOverFull ? "bg-red-500" : isWeightOverCapacity ? "bg-amber-500" : "bg-blue-500"}`} style={{ width: `${Math.min(weightFillPct, 100)}%` }} />
              <div className="absolute top-0 h-full w-0.5 bg-amber-500/70" style={{ left: `${capacityThreshold}%` }} />
            </div>
            {isWeightOverCapacity && !isWeightOverFull && (
              <div className="flex items-center gap-1.5 mt-2 text-xs text-amber-600">
                <AlertTriangle className="w-3.5 h-3.5" /> Exceeds {capacityThreshold}% recommended weight threshold
              </div>
            )}
            {isWeightOverFull && (
              <div className="flex items-center gap-1.5 mt-2 text-xs text-red-600">
                <AlertTriangle className="w-3.5 h-3.5" /> Over the container&apos;s rated tonnage! Reduce bags.
              </div>
            )}
            {cartonItems.length > 0 && (
              <p className="text-[11px] text-gray-400 mt-2">This container mixes rice with carton products — cartons and rice weight are tracked separately since the exact space-split rule is still being finalized.</p>
            )}
          </div>
        )}

        {/* Items Table */}
        <div className="rounded-xl bg-white/70 border border-gray-200/80 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200/70">
                  <th className="text-left px-4 py-3 text-gray-500 font-medium w-8">#</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">Product</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">Packing</th>
                  <th className="text-center px-4 py-3 text-gray-500 font-medium w-20">Max</th>
                  <th className="text-center px-4 py-3 text-gray-500 font-medium w-24">Cartons/Bags</th>
                  <th className="text-center px-4 py-3 text-gray-500 font-medium w-20">Fill %</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium w-24">Weight (kg)</th>
                  <th className="text-center px-4 py-3 text-gray-500 font-medium w-24">FOB $/unit</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium w-24">Value</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium w-32">Remarks</th>
                  <th className="text-center px-4 py-3 text-gray-500 font-medium w-10" title="Lock quantity — excluded from the 95% suggestion">Lock</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => {
                  const product = item.product;
                  const isBag = isBagItem(item);
                  const maxCap = product && !isBag ? getMaxForContainer(product, containerType) : 0;
                  const fillColor = item.fillPct > 10 ? "text-amber-600" : item.fillPct > 5 ? "text-emerald-600" : "text-gray-500";
                  return (
                    <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50/80">
                      <td className="px-4 py-2.5 text-gray-400">{idx + 1}</td>
                      <td className="px-4 py-2.5">
                        <div className="text-gray-900 text-xs font-medium">{product?.product_name ?? "Unknown"}</div>
                        <div className="text-[10px] text-gray-400 flex items-center gap-1">{product?.brand}{isBag && <span className="px-1 py-0.5 rounded bg-blue-500/10 text-blue-600">Bags/PMT</span>}</div>
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 text-xs">{product?.packing_desc ?? ""}</td>
                      <td className="px-4 py-2.5 text-center text-gray-500 text-xs">{isBag ? "—" : maxCap}</td>
                      <td className="px-4 py-2.5">
                        <input type="number" min="0" max={maxCap || 99999} value={item.cartons || ""} onChange={e => updateItem(idx, "cartons", e.target.value)}
                          placeholder={isBag ? "bags" : "cartons"}
                          className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-center text-gray-900 text-sm focus:outline-none focus:border-emerald-500/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                      </td>
                      <td className={`px-4 py-2.5 text-center font-medium text-xs ${isBag ? "text-gray-400" : fillColor}`}>{isBag ? "—" : `${item.fillPct}%`}</td>
                      <td className="px-4 py-2.5 text-right text-gray-700 text-xs">{item.netWeightTotal.toFixed(1)}</td>
                      <td className="px-4 py-2.5">
                        <input type="number" step="0.01" min="0" value={item.unitPriceFob || ""} onChange={e => updateItem(idx, "unitPriceFob", e.target.value)}
                          className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-center text-gray-900 text-sm focus:outline-none focus:border-emerald-500/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-700 text-xs">${item.totalValue.toFixed(2)}</td>
                      <td className="px-4 py-2.5">
                        <input type="text" value={item.remarks} onChange={e => updateItem(idx, "remarks", e.target.value)} placeholder="..."
                          className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-gray-700 text-xs focus:outline-none focus:border-emerald-500/50" />
                      </td>
                      <td className="px-2 py-2.5 text-center">
                        {!isBag && (
                          <button onClick={() => toggleLock(idx)} title={item.locked ? "Unlock — include in 95% suggestion" : "Lock — keep this quantity fixed"}
                            className={`p-1 rounded transition-colors cursor-pointer ${item.locked ? "text-amber-600 hover:bg-amber-500/10" : "text-gray-300 hover:text-gray-500 hover:bg-gray-100"}`}>
                            {item.locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                          </button>
                        )}
                      </td>
                      <td className="px-2 py-2.5">
                        <button onClick={() => removeItem(idx)} className="p-1 rounded hover:bg-red-500/10 text-gray-400 hover:text-red-600 transition-colors cursor-pointer">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {items.length === 0 && (
                  <tr><td colSpan={11} className="px-4 py-12 text-center text-gray-400">No products added. Click &quot;Add Product&quot; to start building your packing plan.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Add Product + Save */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200/70">
            <button onClick={() => { setShowPicker(true); setPickerSearch(""); setPickerBrand("ALL"); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 transition-colors cursor-pointer">
              <Plus className="w-4 h-4" /> Add Product
            </button>
            <div className="flex items-center gap-2">
              {saved && <span className="flex items-center gap-1 text-xs text-emerald-600"><Check className="w-3.5 h-3.5" /> Saved</span>}
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
          <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200/70">
              <h3 className="text-gray-900 font-semibold">Add Product to Plan</h3>
              <button onClick={() => setShowPicker(false)} className="p-1 rounded hover:bg-gray-100 text-gray-500 cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-5 py-3 flex gap-2 border-b border-gray-200/70">
              <div className="flex-1 relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={pickerSearch} onChange={e => setPickerSearch(e.target.value)} placeholder="Search products..." autoFocus
                  className="w-full bg-white border border-gray-200/80 rounded-lg pl-9 pr-3 py-2 text-sm text-gray-900 placeholder-gray-600 focus:outline-none focus:border-emerald-500/50" />
              </div>
              <div className="relative">
                <select value={pickerBrand} onChange={e => setPickerBrand(e.target.value)}
                  className="bg-white border border-gray-200/80 rounded-lg px-3 py-2 text-sm text-gray-900 appearance-none pr-8 focus:outline-none cursor-pointer">
                  {brands.map(b => <option key={b} value={b} className="bg-white">{b}</option>)}
                </select>
                <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {filteredProducts.map(p => {
                const alreadyAdded = items.some(it => it.productId === p.id);
                const isBag = p.unit_type === "bag";
                const maxCap = isBag ? 0 : getMaxForContainer(p, containerType);
                return (
                  <button key={p.id} onClick={() => !alreadyAdded && addProduct(p)} disabled={alreadyAdded}
                    className={`w-full flex items-center gap-3 px-5 py-3 border-b border-gray-100 text-left transition-colors ${alreadyAdded ? "opacity-40 cursor-default" : "hover:bg-gray-50 cursor-pointer"}`}>
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isBag ? "bg-blue-500/10" : "bg-emerald-500/10"}`}>
                      <Package className={`w-4 h-4 ${isBag ? "text-blue-600" : "text-emerald-600"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-gray-900 text-sm font-medium truncate">{p.product_name}</div>
                      <div className="text-xs text-gray-500 truncate">{p.brand} &middot; {p.packing_desc}</div>
                    </div>
                    <div className="text-right shrink-0">
                      {isBag ? (
                        <div className="text-xs text-blue-600">{p.net_weight_kg || 0} kg/bag</div>
                      ) : (
                        <>
                          <div className="text-xs text-gray-500">{p.length_in}&times;{p.width_in}&times;{p.height_in}&quot;</div>
                          <div className="text-xs text-gray-400">Max {maxCap}</div>
                        </>
                      )}
                    </div>
                    {alreadyAdded && <Check className="w-4 h-4 text-emerald-600 shrink-0" />}
                  </button>
                );
              })}
              {filteredProducts.length === 0 && <div className="px-5 py-8 text-center text-gray-400 text-sm">No products found</div>}
            </div>
          </div>
        </div>
      )}

      {/* Saved Plans Modal */}
      {showPlans && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6" onClick={() => setShowPlans(false)}>
          <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-lg max-h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200/70">
              <h3 className="text-gray-900 font-semibold">Saved Packing Plans</h3>
              <button onClick={() => setShowPlans(false)} className="p-1 rounded hover:bg-gray-100 text-gray-500 cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {plansLoading && <div className="px-5 py-8 text-center"><Loader2 className="w-5 h-5 animate-spin text-emerald-600 mx-auto" /></div>}
              {!plansLoading && plans.length === 0 && <div className="px-5 py-8 text-center text-gray-400 text-sm">No saved plans yet</div>}
              {plans.map(plan => (
                <div key={plan.id} className="flex items-center gap-3 px-5 py-3 border-b border-gray-100 hover:bg-gray-50">
                  <button onClick={() => loadPlan(plan)} className="flex-1 text-left cursor-pointer">
                    <div className="text-gray-900 text-sm font-medium">{plan.plan_name}</div>
                    <div className="text-xs text-gray-500">
                      {plan.buyer_name && `${plan.buyer_name} · `}{plan.container_type.toUpperCase()} &middot; {plan.total_cartons} cartons &middot; {plan.total_fill_pct}%
                      <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] ${plan.status === "confirmed" ? "bg-emerald-500/10 text-emerald-600" : plan.status === "shipped" ? "bg-blue-500/10 text-blue-600" : "bg-gray-500/10 text-gray-500"}`}>{plan.status}</span>
                    </div>
                  </button>
                  <button onClick={() => deletePlan(plan.id)} className="p-1.5 rounded hover:bg-red-500/10 text-gray-400 hover:text-red-600 transition-colors cursor-pointer">
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
          <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-gray-900 font-semibold mb-4">CBM Settings</h3>
            <label className="text-sm text-gray-500 block mb-1.5">Capacity Threshold (%)</label>
            <input type="number" min="1" max="100" value={settingsThreshold} onChange={e => setSettingsThreshold(e.target.value)}
              className="w-full bg-white border border-gray-200/80 rounded-lg px-3 py-2 text-gray-900 text-sm mb-4 focus:outline-none focus:border-emerald-500/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
            <p className="text-xs text-gray-400 mb-4">When container fill exceeds this threshold, a warning is shown. Default: 95%</p>

            <label className="text-sm text-gray-500 block mb-1.5">Rice Container Capacity (PMT)</label>
            <div className="grid grid-cols-3 gap-2 mb-1.5">
              {["20ft", "40ft", "40hc"].map(ct => (
                <div key={ct}>
                  <span className="text-[11px] text-gray-400 block mb-0.5">{ct === "40hc" ? "40HC" : ct.toUpperCase()}</span>
                  <input type="number" min="0" value={settingsPmt[ct] ?? ""} onChange={e => setSettingsPmt(prev => ({ ...prev, [ct]: e.target.value }))}
                    className="w-full bg-white border border-gray-200/80 rounded-lg px-2 py-1.5 text-gray-900 text-sm focus:outline-none focus:border-emerald-500/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-400 mb-4">Metric tons rice can weigh per container (Hafeez: 20ft=25, 40ft/40HC=27, editable).</p>

            <div className="flex justify-end gap-2">
              <button onClick={() => setShowSettings(false)} className="px-4 py-1.5 rounded-lg text-sm text-gray-500 hover:text-gray-900 cursor-pointer">Cancel</button>
              <button onClick={saveThreshold} className="px-4 py-1.5 rounded-lg text-sm bg-emerald-600 text-white hover:bg-emerald-500 cursor-pointer">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
