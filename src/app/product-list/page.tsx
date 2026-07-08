"use client";
import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, Plus, Trash2, Pencil, X, Save, Lock, Search, Package, List, DollarSign, Settings2, ChevronRight, ChevronDown, ExternalLink, Copy, Ship, Upload, Check, Tag } from "lucide-react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";

/* ════════════════════════════════ TYPES */
interface Material { id: string; name: string; unit: string; category: string; pricePerUnit: number; updatedAt: string; defaultUnitType: "PCS" | "CONTAINER" | "FIXED"; }
interface Brand { id: string; name: string; address: string; city: string; country: string; logoUrl: string; createdAt: string; contactPerson: string; website: string; email: string; }
interface Product { id: string; sku: string; name: string; productType: string; fclQty: number; grossProfitPct: number; imageUrl: string; notes: string; active: boolean; specs: string; packagingDesc: string; brandId: string; category: string; }
interface RecipeItem { id: string; productId: string; materialId: string; materialName: string; qty: number; unitType: "PCS" | "CONTAINER" | "FIXED"; sortOrder: number; priceOverride?: number | null; }
interface Settings { fcRate: number; currency: string; targetCurrency: string; adminPct: number; whtPct: number; serviceCharges: number; eds: number; courierCharges: number; }

// Materials that must exist on every product's recipe (accountant-mandated standard export charges)
// Standard export-charge materials that must exist on every product's recipe,
// with the accountant-mandated default recipe type for each. Unconfirmed ones
// default to FIXED until the accountant specifies otherwise (adjustable anytime
// in Master Prices — this only sets the initial default when first added).
const DEFAULT_RECIPE_MATERIALS: { name: string; defaultUnitType: "PCS" | "CONTAINER" | "FIXED" }[] = [
  { name: "Unloading/Loading", defaultUnitType: "FIXED" },
  { name: "CONTAINER SEALS", defaultUnitType: "FIXED" },
  { name: "Labour Expense", defaultUnitType: "FIXED" },
  { name: "Craft Paper", defaultUnitType: "FIXED" },
  { name: "Clearing FOB", defaultUnitType: "FIXED" },
  { name: "Inspection", defaultUnitType: "CONTAINER" },
  { name: "Fumigation", defaultUnitType: "FIXED" },
  { name: "Certificate SGS", defaultUnitType: "CONTAINER" },
];

const genId = () => Math.random().toString(36).slice(2, 10);
const UNIT_TYPES = ["PCS", "CONTAINER", "FIXED"] as const;
const PRODUCT_TYPES = ["FINISH GOODS", "RAW MATERIAL", "SEMI FINISHED", "PACKAGING"];
const CATEGORIES = ["Raw Material", "Packaging", "Labels & Seals", "Labor", "Export Charges", "Other"];

/* ════════════════════════════════ PIN */
type PLRole = "accountant" | "aa1" | "aa2";
interface PLSession { role: PLRole; name: string; }
const PL_PINS: Record<string, PLSession> = {
  [process.env.NEXT_PUBLIC_FE_PIN_ACCOUNTANT || ""]: { role: "accountant", name: "A.Hafeez" },
  [process.env.NEXT_PUBLIC_FE_PIN_AA1 || ""]:        { role: "aa1",        name: "Moiz" },
  [process.env.NEXT_PUBLIC_FE_PIN_AA2 || ""]:        { role: "aa2",        name: "Hamza" },
};
const PL_SESSION_KEY = "pl_session";

function PinModal({ onSuccess, onClose }: { onSuccess: (s: PLSession) => void; onClose: () => void }) {
  const [pin, setPin] = useState(""); const [err, setErr] = useState("");
  function submit() { const s = PL_PINS[pin.trim()]; if (!s) { setErr("Incorrect PIN."); return; } onSuccess(s); }
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface rounded-2xl border border-border w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-4"><Lock className="w-4 h-4 text-green-400" /><h3 className="text-sm font-semibold text-foreground">Enter PIN</h3><span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 ml-auto">Product List</span></div>
        <input type="password" value={pin} onChange={e => { setPin(e.target.value); setErr(""); }} onKeyDown={e => e.key === "Enter" && submit()} placeholder="Enter your PIN" autoFocus className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-green-500/50 mb-3" />
        {err && <p className="text-xs text-red-400 mb-3">{err}</p>}
        <div className="flex gap-2"><button onClick={onClose} className="flex-1 px-4 py-2 text-sm text-muted hover:text-foreground cursor-pointer">Cancel</button><button onClick={submit} className="flex-1 px-4 py-2 bg-green-500 hover:bg-green-500/80 text-white text-sm font-semibold rounded-lg cursor-pointer">Confirm</button></div>
      </div>
    </div>
  );
}

/* ════════════════════════════════ COST CALCULATOR */
function calcCost(recipe: RecipeItem[], materials: Material[], product: Product, settings: Settings, quoteQty = 1) {
  const matMap = new Map(materials.map(m => [m.id, m]));
  let pcsCOG = 0;   // scales with quoteQty
  let fixedCOG = 0; // stays same regardless of qty
  for (const item of recipe) {
    const price = item.priceOverride != null ? item.priceOverride : (matMap.get(item.materialId)?.pricePerUnit ?? 0);
    if (item.unitType === "CONTAINER") fixedCOG += price / (product.fclQty || 1500);
    else if (item.unitType === "FIXED") fixedCOG += item.qty * price;
    else pcsCOG += item.qty * price; // PCS — scales
  }
  const r = (n: number) => Math.round(n * 100) / 100;
  const cogTotal    = r(pcsCOG * quoteQty + fixedCOG);
  const cogPerCarton = r(cogTotal / quoteQty);
  const adminAmt    = r(cogTotal * (settings.adminPct / 100));
  const cogWithAdmin = r(cogTotal + adminAmt);
  const cogUSD      = r(cogWithAdmin / (settings.fcRate || 275));
  const sellingUSD  = r(cogUSD * (1 + product.grossProfitPct / 100));
  const sellingPerCarton = r(sellingUSD / quoteQty);
  const whtUSD      = r(sellingUSD * (settings.whtPct / 100));
  const serviceChargesAmt = r(sellingUSD * (settings.serviceCharges / 100));
  const edsAmt            = r(sellingUSD * (settings.eds / 100));
  const courierChargesAmt = r(sellingUSD * (settings.courierCharges / 100));
  const fobTotal    = r(sellingUSD + whtUSD + serviceChargesAmt + edsAmt + courierChargesAmt);
  const fobPerCarton = r(fobTotal / quoteQty);
  return { cogPerCarton, cogTotal, adminAmt, cogWithAdmin, cogUSD, sellingUSD, sellingPerCarton, whtUSD, serviceChargesAmt, edsAmt, courierChargesAmt, fobTotal, fobPerCarton,
    // legacy alias for price list tab
    cogPKR: cogPerCarton, fobUSD: fobPerCarton };
}

/* ════════════════════════════════ MAIN */
export default function ProductListPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"master" | "products" | "pricelist" | "brands" | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [recipes, setRecipes] = useState<Map<string, RecipeItem[]>>(new Map());
  const [settings, setSettings] = useState<Settings>({ fcRate: 275, currency: "PKR", targetCurrency: "USD", adminPct: 5, whtPct: 2, serviceCharges: 0, eds: 0, courierCharges: 0 });
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const [session, setSession] = useState<PLSession | null>(null);
  const [pinModal, setPinModal] = useState<{ action: (s: PLSession) => void } | null>(null);
  const [showGear, setShowGear] = useState(false);
  const [gearPin, setGearPin] = useState("");
  const [gearPinErr, setGearPinErr] = useState("");
  const [accessConfig, setAccessConfig] = useState({
    master_aa1: true,  master_aa2: true,
    products_aa1: true, products_aa2: true,
    pricelist_aa1: true, pricelist_aa2: true,
    brands_aa1: true, brands_aa2: true,
  });
  const [savingAccess, setSavingAccess] = useState(false);

  // Product detail view
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [productDraft, setProductDraft] = useState<Product | null>(null);
  const [productRecipe, setProductRecipe] = useState<RecipeItem[]>([]);
  const [quoteQty, setQuoteQty] = useState(1);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [showProductForm, setShowProductForm] = useState(false);
  const [showCartonImport, setShowCartonImport] = useState(false);
  const [savingRecipe, setSavingRecipe] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  // Master prices
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [showMaterialForm, setShowMaterialForm] = useState(false);
  const [matCatFilter, setMatCatFilter] = useState("");

  // Brands
  const [brands, setBrands] = useState<Brand[]>([]);
  const [editingBrand, setEditingBrand] = useState<Brand | null>(null);
  const [showBrandForm, setShowBrandForm] = useState(false);

  // Settings edit
  const [editSettings, setEditSettings] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState<Settings>({ fcRate: 275, currency: "PKR", targetCurrency: "USD", adminPct: 5, whtPct: 2, serviceCharges: 0, eds: 0, courierCharges: 0 });

  // Price list
  const [copiedId, setCopiedId] = useState("");

  useEffect(() => {
    try { const s = localStorage.getItem(PL_SESSION_KEY); if (s) setSession(JSON.parse(s)); } catch { /* */ }
    Promise.all([
      fetch("/api/product-list/master").then(r => r.json()).then(d => setMaterials(d.materials ?? [])),
      fetch("/api/product-list/products").then(r => r.json()).then(d => setProducts(d.products ?? [])),
      fetch("/api/product-list/brands").then(r => r.json()).then(d => setBrands(d.brands ?? [])),
      fetch("/api/product-list/settings").then(r => r.json()).then(d => {
        setSettings(d);
        // Load access config from settings
        if (d.pl_access) {
          try { setAccessConfig(JSON.parse(d.pl_access)); } catch { /* use defaults */ }
        }
      }),
      fetch("/api/product-list/recipes").then(r => r.json()).then(d => {
        const map = new Map<string, RecipeItem[]>();
        for (const item of (d.items ?? []) as RecipeItem[]) {
          if (!map.has(item.productId)) map.set(item.productId, []);
          map.get(item.productId)!.push(item);
        }
        setRecipes(map);
      }),
    ]).finally(() => setLoaded(true));
  }, []);

  function login(s: PLSession) { localStorage.setItem(PL_SESSION_KEY, JSON.stringify(s)); setSession(s); setPinModal(null); }
  function logout() { localStorage.removeItem(PL_SESSION_KEY); setSession(null); setShowGear(false); }
  function requireAuth(action: (s: PLSession) => void) { if (session) { action(session); return; } setPinModal({ action }); }

  function gearLogin() {
    const s = PL_PINS[gearPin.trim()];
    if (!s) { setGearPinErr("Incorrect PIN."); return; }
    login(s); setGearPin(""); setGearPinErr("");
  }

  function canAccess(section: "master" | "products" | "pricelist" | "brands"): boolean {
    if (!session) return false;
    if (session.role === "accountant") return true;
    return accessConfig[`${section}_${session.role}` as keyof typeof accessConfig];
  }

  async function saveAccessConfig(cfg: typeof accessConfig) {
    setSavingAccess(true);
    setAccessConfig(cfg);
    try {
      await fetch("/api/product-list/settings", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pl_access: JSON.stringify(cfg) }),
      });
    } catch { /* ignore */ }
    setSavingAccess(false);
  }

  function toggleAccess(key: keyof typeof accessConfig) {
    const cfg = { ...accessConfig, [key]: !accessConfig[key] };
    saveAccessConfig(cfg);
  }

  async function loadRecipe(productId: string) {
    if (recipes.has(productId)) return recipes.get(productId)!;
    const res = await fetch(`/api/product-list/recipes?productId=${productId}`);
    const data = await res.json();
    const items = (data.items ?? []) as RecipeItem[];
    setRecipes(prev => new Map(prev).set(productId, items));
    return items;
  }

  async function openProduct(p: Product) {
    setSelectedProduct(p);
    setProductDraft({ ...p });
    setQuoteQty(1);
    const items = await loadRecipe(p.id);
    setProductRecipe(items);
  }

  async function saveProductSettings() {
    if (!productDraft) return;
    setSavingSettings(true);
    await saveProduct(productDraft);
    setSelectedProduct(productDraft);
    setSavingSettings(false);
  }

  function updateDraft<K extends keyof Product>(key: K, value: Product[K]) {
    setProductDraft(prev => prev ? { ...prev, [key]: value } : prev);
  }

  async function saveRecipe() {
    if (!selectedProduct) return;
    setSavingRecipe(true);
    await fetch("/api/product-list/recipes", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save-product-recipe", productId: selectedProduct.id, items: productRecipe }),
    });
    setRecipes(prev => new Map(prev).set(selectedProduct.id, productRecipe));
    setSavingRecipe(false);
  }

  // Ensures the accountant-mandated standard charge materials exist in Master Prices,
  // creating any that are missing. Returns their material ids in DEFAULT_RECIPE_MATERIALS order.
  async function ensureStandardMaterials(): Promise<Material[]> {
    let current = materials;
    for (const std of DEFAULT_RECIPE_MATERIALS) {
      const exists = current.some(m => m.name.trim().toLowerCase() === std.name.toLowerCase());
      if (!exists) {
        const mat: Material = { id: genId(), name: std.name, unit: "PCS", category: "Export Charges", pricePerUnit: 0, updatedAt: new Date().toISOString(), defaultUnitType: std.defaultUnitType };
        await fetch("/api/product-list/master", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "upsert", material: mat }),
        });
        current = [...current, mat];
      }
    }
    if (current !== materials) setMaterials(current);
    return current;
  }

  // Adds any of the 8 standard charge materials missing from a recipe, without touching existing items.
  async function addMissingStandardCharges(productId: string, existingItems: RecipeItem[]): Promise<RecipeItem[]> {
    const allMaterials = await ensureStandardMaterials();
    const existingMaterialIds = new Set(existingItems.map(i => i.materialId));
    const missing = DEFAULT_RECIPE_MATERIALS
      .map(std => allMaterials.find(m => m.name.trim().toLowerCase() === std.name.toLowerCase()))
      .filter((m): m is Material => !!m && !existingMaterialIds.has(m.id));
    const newItems: RecipeItem[] = missing.map((m, i) => ({
      id: genId(), productId, materialId: m.id, materialName: m.name,
      qty: 1, unitType: m.defaultUnitType || "FIXED", sortOrder: existingItems.length + i,
    }));
    return [...existingItems, ...newItems];
  }

  async function saveProduct(p: Product) {
    const isNew = !products.some(x => x.id === p.id);
    await fetch("/api/product-list/products", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "upsert", product: p }),
    });
    setProducts(prev => prev.some(x => x.id === p.id) ? prev.map(x => x.id === p.id ? p : x) : [...prev, p]);
    setShowProductForm(false); setEditingProduct(null);

    if (isNew) {
      const items = await addMissingStandardCharges(p.id, []);
      await fetch("/api/product-list/recipes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save-product-recipe", productId: p.id, items }),
      });
      setRecipes(prev => new Map(prev).set(p.id, items));
    }
  }

  async function applyCartonImport(updates: { id: string; specs: string; packagingDesc: string }[]) {
    const merged = updates.map(u => {
      const existing = products.find(p => p.id === u.id);
      return existing ? { ...existing, specs: u.specs, packagingDesc: u.packagingDesc } : null;
    }).filter((p): p is Product => p !== null);
    for (const p of merged) {
      await fetch("/api/product-list/products", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "upsert", product: p }),
      });
    }
    setProducts(prev => prev.map(p => merged.find(m => m.id === p.id) ?? p));
  }

  async function deleteProduct(id: string) {
    if (!confirm("Delete this product and its recipe?")) return;
    await fetch("/api/product-list/products", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", product: { id } }) });
    await fetch("/api/product-list/recipes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete-product", productId: id }) });
    setProducts(prev => prev.filter(p => p.id !== id));
    if (selectedProduct?.id === id) setSelectedProduct(null);
  }

  async function saveMaterial(m: Material) {
    await fetch("/api/product-list/master", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "upsert", material: m }),
    });
    setMaterials(prev => prev.some(x => x.id === m.id) ? prev.map(x => x.id === m.id ? m : x) : [...prev, m]);
    setShowMaterialForm(false); setEditingMaterial(null);
  }

  async function deleteMaterial(id: string) {
    if (!confirm("Delete this material?")) return;
    await fetch("/api/product-list/master", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", material: { id } }) });
    setMaterials(prev => prev.filter(m => m.id !== id));
  }

  async function saveBrand(b: Brand) {
    await fetch("/api/product-list/brands", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "upsert", brand: b }),
    });
    setBrands(prev => prev.some(x => x.id === b.id) ? prev.map(x => x.id === b.id ? b : x) : [...prev, b]);
    setShowBrandForm(false); setEditingBrand(null);
  }

  async function deleteBrand(id: string) {
    if (!confirm("Delete this brand? Products already tagged with it will keep their brandId but show as unassigned.")) return;
    await fetch("/api/product-list/brands", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", brand: { id } }) });
    setBrands(prev => prev.filter(b => b.id !== id));
  }

  async function saveSettings() {
    await fetch("/api/product-list/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settingsDraft) });
    setSettings(settingsDraft);
    setEditSettings(false);
  }

  function addRecipeRow() {
    setProductRecipe(prev => [...prev, { id: genId(), productId: selectedProduct?.id ?? "", materialId: "", materialName: "", qty: 1, unitType: "PCS", sortOrder: prev.length, priceOverride: null }]);
  }

  function updateRecipeRow(idx: number, field: keyof RecipeItem, value: unknown) {
    setProductRecipe(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  }

  function copyShareLink(productId: string) {
    const url = `${window.location.origin}/product-list/share/${productId}`;
    navigator.clipboard.writeText(url);
    setCopiedId(productId);
    setTimeout(() => setCopiedId(""), 2000);
  }

  const fmt2 = (n: number) => n.toFixed(2);
  const filteredProducts = products.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase()));
  const filteredMaterials = materials.filter(m => (!search || m.name.toLowerCase().includes(search.toLowerCase())) && (!matCatFilter || m.category === matCatFilter));
  const filteredBrands = brands.filter(b => !search || b.name.toLowerCase().includes(search.toLowerCase()));
  const brandName = (id: string) => brands.find(b => b.id === id)?.name || "—";

  if (!loaded) return null;

  return (
    <div className="flex-1 flex flex-col h-screen" onClick={() => showGear && setShowGear(false)}>
      {/* Header */}
      <header className="border-b border-border bg-surface/50 backdrop-blur px-4 md:px-6 py-3 flex items-center gap-3 shrink-0">
        {selectedProduct ? (
          <button onClick={() => setSelectedProduct(null)} className="text-muted hover:text-foreground cursor-pointer"><ArrowLeft className="w-5 h-5" /></button>
        ) : (
          <button onClick={() => router.push("/dashboard")} className="text-muted hover:text-foreground cursor-pointer"><ArrowLeft className="w-5 h-5" /></button>
        )}
        <div className="w-7 h-7 rounded-lg bg-green-500/20 flex items-center justify-center"><Package className="w-3.5 h-3.5 text-green-400" /></div>
        <span className="text-sm font-bold text-foreground">{selectedProduct ? selectedProduct.name : "Product List / Recipes / Price List"}</span>
        {selectedProduct && <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 font-semibold">{selectedProduct.sku}</span>}
        <div className="ml-auto flex items-center gap-2">
          {/* Gear icon — login + access control */}
          <div className="relative">
            <button onClick={() => setShowGear(v => !v)}
              className={`p-1.5 rounded-lg cursor-pointer transition-colors ${session ? "text-green-400 bg-green-500/10 hover:bg-green-500/20" : "text-muted hover:text-foreground hover:bg-surface-light/40"}`}>
              <Settings2 className="w-4 h-4" />
            </button>
          </div>
          {selectedProduct && (
            <button onClick={() => requireAuth(() => { saveRecipe(); })} disabled={savingRecipe}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-green-500 hover:bg-green-500/80 text-white rounded-lg cursor-pointer disabled:opacity-50">
              <Save className="w-3 h-3" /> {savingRecipe ? "Saving..." : "Save Recipe"}
            </button>
          )}
        </div>
      </header>

      {/* ── PRODUCT DETAIL VIEW ── */}
      {selectedProduct && (() => {
        const calc = calcCost(productRecipe, materials, productDraft ?? selectedProduct, settings, quoteQty);
        return (
          <div className="flex-1 overflow-y-auto p-4 md:p-6">
            <div className="max-w-6xl mx-auto space-y-5 animate-fade-in">

              {/* Product Info */}
              {productDraft && (
              <div className="bg-surface rounded-2xl border border-border p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xs font-semibold text-green-400 uppercase tracking-wide">Product Settings</h3>
                  <button onClick={() => requireAuth(() => saveProductSettings())} disabled={savingSettings}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-green-500 hover:bg-green-500/80 text-white rounded-lg cursor-pointer disabled:opacity-50 transition-colors">
                    <Save className="w-3 h-3" /> {savingSettings ? "Saving..." : "Save Settings"}
                  </button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div className="col-span-2">
                    <label className="text-[10px] text-muted uppercase tracking-wide block mb-1">Product Name</label>
                    <input value={productDraft.name} onChange={e => updateDraft("name", e.target.value)}
                      className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:border-green-500/50" />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted uppercase tracking-wide block mb-1">SKU</label>
                    <input value={productDraft.sku} onChange={e => updateDraft("sku", e.target.value)}
                      className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:border-green-500/50" />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted uppercase tracking-wide block mb-1">Product Type</label>
                    <select value={productDraft.productType} onChange={e => updateDraft("productType", e.target.value)}
                      className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:border-green-500/50 cursor-pointer">
                      {PRODUCT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  {([
                    ["fclQty","FCL Container Qty","number"],
                    ["grossProfitPct","Gross Profit %","number"],
                  ] as [keyof Product, string, string][]).map(([k, l]) => (
                    <div key={k}>
                      <label className="text-[10px] text-muted uppercase tracking-wide block mb-1">{l}</label>
                      <input type="number" step="0.01" value={Number(productDraft[k])}
                        onChange={e => updateDraft(k, parseFloat(e.target.value) || 0 as never)}
                        className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:border-green-500/50" />
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-muted mt-3">Admin %, WHT %, Service Charges, EDS &amp; Courier Charges are shared across all products — edit them in Master Prices → Global Cost Settings.</p>
              </div>
              )}

              {/* Recipe + Calculation side by side */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* Recipe table */}
                <div className="lg:col-span-2 bg-surface rounded-2xl border border-border overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-3 border-b border-border">
                    <h3 className="text-xs font-semibold text-muted uppercase tracking-wide">Recipe / Ingredients</h3>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted uppercase tracking-wide font-semibold">Quote Qty</span>
                        <input type="number" min="1" value={quoteQty} onChange={e => setQuoteQty(Math.max(1, parseInt(e.target.value) || 1))}
                          className="w-16 bg-background border border-green-500/40 rounded-lg px-2 py-1 text-sm text-center font-bold text-green-400 focus:outline-none focus:border-green-500" />
                        <span className="text-[10px] text-muted">carton{quoteQty > 1 ? "s" : ""}</span>
                      </div>
                      <button onClick={() => requireAuth(async () => { setProductRecipe(await addMissingStandardCharges(selectedProduct.id, productRecipe)); })}
                        className="flex items-center gap-1 text-[11px] text-amber-400 hover:text-amber-300 cursor-pointer">
                        <Plus className="w-3 h-3" /> Add Standard Charges
                      </button>
                      <button onClick={() => requireAuth(addRecipeRow)} className="flex items-center gap-1 text-[11px] text-green-400 hover:text-green-300 cursor-pointer"><Plus className="w-3 h-3" /> Add Row</button>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead><tr className="bg-green-500/10 text-green-400">
                        <th className="px-3 py-2 text-left font-semibold">Ingredient</th>
                        <th className="px-3 py-2 text-left font-semibold w-[90px]">Qty</th>
                        <th className="px-3 py-2 text-left font-semibold w-[110px]">Type</th>
                        <th className="px-3 py-2 text-right font-semibold w-[90px]">Rate (PKR)</th>
                        <th className="px-3 py-2 text-right font-semibold w-[90px]">Total</th>
                        <th className="px-3 py-2 w-[30px]"></th>
                      </tr></thead>
                      <tbody>
                        {productRecipe.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted">No ingredients. Click "Add Row" to start.</td></tr>}
                        {productRecipe.map((item, idx) => {
                          const mat = materials.find(m => m.id === item.materialId);
                          const masterPrice = mat?.pricePerUnit ?? 0;
                          const isOverride = item.priceOverride != null;
                          const price = isOverride ? item.priceOverride! : masterPrice;
                          const total = item.unitType === "CONTAINER" ? price / (selectedProduct.fclQty || 1500) : item.qty * price;
                          return (
                            <tr key={item.id} className={idx % 2 === 0 ? "" : "bg-surface-light/20"}>
                              <td className="px-3 py-1.5">
                                <select value={item.materialId} onChange={e => {
                                  const m = materials.find(x => x.id === e.target.value);
                                  updateRecipeRow(idx, "materialId", e.target.value);
                                  if (m) {
                                    updateRecipeRow(idx, "materialName", m.name);
                                    updateRecipeRow(idx, "unitType", m.defaultUnitType || "PCS");
                                  }
                                }} className="w-full bg-background border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:border-green-500/50 cursor-pointer">
                                  <option value="">— Select —</option>
                                  {materials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                </select>
                              </td>
                              <td className="px-3 py-1.5">
                                <input type="number" value={item.qty} onChange={e => updateRecipeRow(idx, "qty", parseFloat(e.target.value) || 0)} disabled={false}
                                  className="w-full bg-background border border-border rounded px-2 py-1 text-xs text-right text-foreground focus:outline-none focus:border-green-500/50 disabled:opacity-50" />
                              </td>
                              <td className="px-3 py-1.5">
                                <select value={item.unitType} onChange={e => updateRecipeRow(idx, "unitType", e.target.value)}
                                  className="w-full bg-background border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:border-green-500/50 cursor-pointer">
                                  {UNIT_TYPES.map(u => <option key={u} value={u}>{u === "PCS" ? "PCS (×qty)" : u === "CONTAINER" ? "CONTAINER (÷FCL)" : "FIXED (flat)"}</option>)}
                                </select>
                              </td>
                              <td className="px-3 py-1.5">
                                <div className="flex items-center gap-1 justify-end">
                                  <input type="number" step="0.01" value={price}
                                    onChange={e => updateRecipeRow(idx, "priceOverride", e.target.value === "" ? null : (parseFloat(e.target.value) || 0))}
                                    title={isOverride ? "Custom price — locked, won't change when Master Price updates" : "Fetched from Master Price — edit to set a custom price for this product only"}
                                    className={`w-16 bg-background border rounded px-1.5 py-1 text-xs text-right focus:outline-none ${isOverride ? "border-amber-500/60 text-amber-400 font-semibold" : "border-border text-muted focus:border-green-500/50"}`} />
                                  {isOverride && <button onClick={() => updateRecipeRow(idx, "priceOverride", null)} title="Reset to Master Price" className="text-amber-400 hover:text-amber-300 cursor-pointer text-xs leading-none">↺</button>}
                                </div>
                              </td>
                              <td className="px-3 py-1.5 text-right font-mono font-semibold text-foreground">{total.toFixed(2)}</td>
                              <td className="px-3 py-1.5"><button onClick={() => setProductRecipe(prev => prev.filter((_, i) => i !== idx))} className="text-muted hover:text-red-400 cursor-pointer"><X className="w-3 h-3" /></button></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="px-5 py-2 border-t border-border">
                    <p className="text-[10px] text-muted">Rate auto-fetches from Master Prices. Edit a rate to set a <span className="text-amber-400 font-semibold">custom price</span> for this product only — it locks and won&apos;t change when Master Prices update. Click ↺ to reset to master.</p>
                  </div>
                </div>

                {/* Cost Breakdown */}
                <div className="bg-surface rounded-2xl border border-border p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-muted uppercase tracking-wide">Cost Breakdown</h3>
                    {quoteQty > 1 && <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 font-semibold">{quoteQty} cartons</span>}
                  </div>
                  {[
                    ["COG (PKR)", quoteQty > 1 ? `PKR ${fmt2(calc.cogTotal)} total / ${fmt2(calc.cogPerCarton)}/ctn` : `PKR ${fmt2(calc.cogPerCarton)}`, "text-foreground"],
                    [`Admin ${settings.adminPct}%`, `PKR ${fmt2(calc.adminAmt)}`, "text-muted"],
                    ["COG + Admin", `PKR ${fmt2(calc.cogWithAdmin)}`, "text-foreground font-bold"],
                    [`÷ FC Rate (${settings.fcRate})`, `USD ${fmt2(calc.cogUSD)}`, "text-blue-400"],
                    [`× GP ${(productDraft ?? selectedProduct).grossProfitPct}%`, quoteQty > 1 ? `USD ${fmt2(calc.sellingUSD)} total / ${fmt2(calc.sellingPerCarton)}/ctn` : `USD ${fmt2(calc.sellingUSD)}`, "text-green-400 font-bold"],
                    [`WHT ${settings.whtPct}%`, `USD ${fmt2(calc.whtUSD)}`, "text-muted"],
                    [`Service Charges ${settings.serviceCharges}%`, `USD ${fmt2(calc.serviceChargesAmt)}`, "text-muted"],
                    [`EDS ${settings.eds}%`, `USD ${fmt2(calc.edsAmt)}`, "text-muted"],
                    [`Courier Charges ${settings.courierCharges}%`, `USD ${fmt2(calc.courierChargesAmt)}`, "text-muted"],
                  ].map(([label, value, cls]) => (
                    <div key={String(label)} className="flex items-center justify-between border-b border-border/50 pb-2">
                      <span className="text-[11px] text-muted">{label}</span>
                      <span className={`text-xs font-mono ${cls}`}>{value}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between pt-1">
                    <div>
                      <p className="text-sm font-bold text-foreground">FOB Price</p>
                      {quoteQty > 1 && <p className="text-[10px] text-muted">per carton: USD {fmt2(calc.fobPerCarton)}</p>}
                    </div>
                    <span className="text-lg font-bold text-green-400">USD {fmt2(calc.fobTotal)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted">CNF (freight TBD)</span>
                    <span className="text-sm font-semibold text-foreground">USD {fmt2(calc.fobTotal)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── MAIN TABS ── */}
      {!selectedProduct && (
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="max-w-7xl mx-auto space-y-5 animate-fade-in">

            {/* Module cards — shown when no section selected */}
            {!tab && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4 mt-4">
                {([
                  { key: "products" as const, Icon: Package, label: "Products", desc: "Manage products, recipes & BOM. Auto-calculates FOB price per carton.", count: products.length, color: "green", external: false, route: "", newTab: false },
                  { key: "master" as const, Icon: List, label: "Master Prices", desc: "Raw material & component prices. Update once — all products recalculate.", count: materials.length, color: "blue", external: false, route: "", newTab: false },
                  { key: "pricelist" as const, Icon: DollarSign, label: "Price List", desc: "Calculated price list with images. Generate shareable links per product.", count: products.length, color: "amber", external: false, route: "", newTab: false },
                  { key: "brands" as const, Icon: Tag, label: "Brands", desc: "Manage brands (Kafi, Essence, etc.) — name, address, logo. Assign products to a brand.", count: brands.length, color: "violet", external: false, route: "", newTab: false },
                  { key: "cnf" as const, Icon: Ship, label: "CNF Quotations", desc: "Generate immutable CNF export quotes — master freight card, shareable client price list.", count: null, color: "sky", external: true, route: "/cnf", newTab: false },
                  { key: "cnf-public" as const, Icon: ExternalLink, label: "Client Quotation List", desc: "Public link — clients & CNF editors browse all active quotes and open their price list. No login required.", count: null, color: "teal", external: true, route: "/cnf/all-quotes", newTab: true },
                ]).map(({ key, Icon, label, desc, count, color, external, route, newTab }) => {
                  const allowed = external ? true : canAccess(key as "master" | "products" | "pricelist" | "brands");
                  return (
                    <button key={key}
                      onClick={() => {
                        if (!allowed) return;
                        if (external) { if (newTab) window.open(route, "_blank"); else router.push(route); return; }
                        setTab(key as "master" | "products" | "pricelist" | "brands"); setSearch("");
                      }}
                      className={`group text-left p-5 bg-white/65 backdrop-blur-sm rounded-2xl border transition-all shadow-sm ${
                        allowed
                          ? `border-gray-200/80 hover:border-${color}-400/60 hover:bg-white/95 hover:shadow-md cursor-pointer`
                          : "border-gray-200/40 opacity-50 cursor-not-allowed"
                      }`}>
                      <div className="flex items-start justify-between mb-3">
                        <div className={`w-10 h-10 rounded-xl bg-${color}-100/60 flex items-center justify-center`}>
                          <Icon className={`w-5 h-5 text-${color}-500`} />
                        </div>
                        <div className="flex items-center gap-1.5">
                          {count !== null && <span className="text-xs text-gray-400 font-semibold">{count}</span>}
                          {!allowed && <Lock className="w-3.5 h-3.5 text-gray-300" />}
                          {allowed && <ChevronRight className={`w-4 h-4 text-gray-300 group-hover:text-${color}-400 transition-colors`} />}
                        </div>
                      </div>
                      <p className="text-sm font-bold text-gray-800 mb-1">{label}</p>
                      <p className="text-xs text-gray-500 leading-relaxed">{desc}</p>
                      {!allowed && <p className="text-[10px] text-red-400 font-semibold mt-2">No Access — contact Accountant</p>}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Back button + action bar when inside a section */}
            {tab && (
              <div className="flex items-center justify-between flex-wrap gap-3">
                <button onClick={() => { setTab(null); setSearch(""); }}
                  className="flex items-center gap-2 text-sm text-muted hover:text-foreground cursor-pointer transition-colors">
                  <ArrowLeft className="w-4 h-4" />
                  <span className="font-semibold">{tab === "products" ? "Products" : tab === "master" ? "Master Prices" : tab === "brands" ? "Brands" : "Price List"}</span>
                </button>
                <div className="flex items-center gap-2">
                  {(tab === "master" || tab === "pricelist") && (
                    <button onClick={() => { setSettingsDraft(settings); setEditSettings(true); }} className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-border text-muted hover:text-foreground hover:border-green-500/40 rounded-lg cursor-pointer">
                      <Settings2 className="w-3 h-3" /> Global Cost Settings (Admin {settings.adminPct}%)
                    </button>
                  )}
                  {tab === "products" && (
                    <button onClick={() => requireAuth(() => setShowCartonImport(true))} className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-border text-muted hover:text-foreground hover:border-green-500/40 rounded-lg cursor-pointer">
                      <Upload className="w-3 h-3" /> Import Carton Sizes
                    </button>
                  )}
                  {tab !== "pricelist" && (
                    <button onClick={() => requireAuth(() => {
                      if (tab === "products") { setEditingProduct(null); setShowProductForm(true); }
                      else if (tab === "brands") { setEditingBrand(null); setShowBrandForm(true); }
                      else { setEditingMaterial(null); setShowMaterialForm(true); }
                    })} className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-green-500 hover:bg-green-500/80 text-white rounded-lg cursor-pointer">
                      <Plus className="w-3 h-3" /> Add {tab === "products" ? "Product" : tab === "brands" ? "Brand" : "Material"}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Search — only inside a section */}
            {tab && (
              <div className="flex items-center gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" />
                  <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder={`Search ${tab}...`}
                    className="w-full bg-surface border border-border rounded-xl pl-9 pr-4 py-2.5 text-sm text-foreground focus:outline-none focus:border-green-500/50" />
                </div>
                {tab === "master" && (
                  <select value={matCatFilter} onChange={e => setMatCatFilter(e.target.value)} className="bg-surface border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-green-500/50 cursor-pointer">
                    <option value="">All Categories</option>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                )}
              </div>
            )}

            {/* ── PRODUCTS TAB ── */}
            {tab === "products" && (
              <div className="bg-surface rounded-2xl border border-border overflow-hidden">
                <table className="w-full text-xs">
                  <thead><tr className="bg-green-500/10 text-green-400">
                    <th className="px-4 py-3 text-left font-semibold w-[40px]">#</th>
                    <th className="px-4 py-3 text-left font-semibold w-[120px]">SKU</th>
                    <th className="px-4 py-3 text-left font-semibold">Product Name</th>
                    <th className="px-4 py-3 text-left font-semibold w-[120px]">Type</th>
                    <th className="px-4 py-3 text-left font-semibold w-[110px]">Brand</th>
                    <th className="px-4 py-3 text-right font-semibold w-[90px]">GP%</th>
                    <th className="px-4 py-3 text-right font-semibold w-[100px]">FOB (USD)</th>
                    <th className="px-4 py-3 text-center w-[80px]">Actions</th>
                  </tr></thead>
                  <tbody>
                    {filteredProducts.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-muted">No products yet. Click "Add Product" to get started.</td></tr>}
                    {filteredProducts.map((p, i) => {
                      const recipe = recipes.get(p.id) ?? [];
                      const calc = calcCost(recipe, materials, p, settings);
                      return (
                        <tr key={p.id} onClick={() => openProduct(p)} className={`cursor-pointer hover:bg-green-500/5 transition-colors ${i % 2 === 0 ? "" : "bg-surface-light/20"}`}>
                          <td className="px-4 py-3 text-muted">{i + 1}</td>
                          <td className="px-4 py-3 font-mono text-[11px] text-muted">{p.sku}</td>
                          <td className="px-4 py-3 font-semibold text-foreground">{p.name}</td>
                          <td className="px-4 py-3"><span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 font-semibold">{p.productType}</span></td>
                          <td className="px-4 py-3">{p.brandId ? <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-400 font-semibold">{brandName(p.brandId)}</span> : <span className="text-[10px] text-red-400">Unassigned</span>}</td>
                          <td className="px-4 py-3 text-right text-muted">{p.grossProfitPct}%</td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-green-400">{recipe.length > 0 ? `$${fmt2(calc.fobUSD)}` : "—"}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-center gap-1" onClick={e => e.stopPropagation()}>
                              <button onClick={() => requireAuth(() => { setEditingProduct(p); setShowProductForm(true); })} className="p-1 text-muted hover:text-green-400 cursor-pointer"><Pencil className="w-3 h-3" /></button>
                              <button onClick={() => requireAuth(() => deleteProduct(p.id))} className="p-1 text-muted hover:text-red-400 cursor-pointer"><Trash2 className="w-3 h-3" /></button>
                              <ChevronRight className="w-3 h-3 text-muted" />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* ── MASTER PRICES TAB ── */}
            {tab === "master" && (
              <div className="bg-surface rounded-2xl border border-border overflow-hidden">
                <table className="w-full text-xs">
                  <thead><tr className="bg-green-500/10 text-green-400">
                    <th className="px-4 py-3 text-left font-semibold w-[40px]">#</th>
                    <th className="px-4 py-3 text-left font-semibold">Material / Component</th>
                    <th className="px-4 py-3 text-left font-semibold w-[70px]">Unit</th>
                    <th className="px-4 py-3 text-left font-semibold w-[140px]">Category</th>
                    <th className="px-4 py-3 text-right font-semibold w-[155px]">Price (PKR)</th>
                    <th className="px-4 py-3 text-left font-semibold w-[110px]">Updated</th>
                    <th className="px-4 py-3 text-center w-[70px]">Actions</th>
                  </tr></thead>
                  <tbody>
                    {filteredMaterials.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-muted">No materials yet.</td></tr>}
                    {filteredMaterials.map((m, i) => (
                      <tr key={m.id} className={`hover:bg-green-500/5 transition-colors ${i % 2 === 0 ? "" : "bg-surface-light/20"}`}>
                        <td className="px-4 py-3 text-muted">{i + 1}</td>
                        <td className="px-4 py-3 font-semibold text-foreground">{m.name}</td>
                        <td className="px-4 py-3 text-muted">{m.unit}</td>
                        <td className="px-4 py-3 text-muted text-xs">{m.category}</td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-foreground whitespace-nowrap">PKR {m.pricePerUnit.toFixed(2)}</td>
                        <td className="px-4 py-3 text-muted">{m.updatedAt ? new Date(m.updatedAt).toLocaleDateString("en-PK") : "—"}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => requireAuth(() => { setEditingMaterial(m); setShowMaterialForm(true); })} className="p-1 text-muted hover:text-green-400 cursor-pointer"><Pencil className="w-3 h-3" /></button>
                            <button onClick={() => requireAuth(() => deleteMaterial(m.id))} className="p-1 text-muted hover:text-red-400 cursor-pointer"><Trash2 className="w-3 h-3" /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* ── PRICE LIST TAB ── */}
            {tab === "pricelist" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredProducts.map(p => {
                  const recipe = recipes.get(p.id) ?? [];
                  const calc = calcCost(recipe, materials, p, settings);
                  return (
                    <div key={p.id} className="bg-surface rounded-2xl border border-border overflow-hidden hover:border-green-500/40 transition-all">
                      {p.imageUrl ? (
                        <img src={p.imageUrl} alt={p.name} className="w-full h-40 object-cover" />
                      ) : (
                        <div className="w-full h-40 bg-green-500/5 flex items-center justify-center">
                          <Package className="w-12 h-12 text-green-500/20" />
                        </div>
                      )}
                      <div className="p-4">
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] font-mono text-muted">{p.sku}</p>
                          {p.brandId && <span className="text-[9px] px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-400 font-semibold">{brandName(p.brandId)}</span>}
                        </div>
                        <p className="text-sm font-bold text-foreground mt-0.5 leading-snug">{p.name}</p>
                        <div className="flex items-center justify-between mt-3">
                          <div>
                            <p className="text-[10px] text-muted">FOB Price</p>
                            <p className="text-xl font-bold text-green-400">USD {fmt2(calc.fobUSD)}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] text-muted">COG (PKR)</p>
                            <p className="text-sm font-semibold text-muted">PKR {fmt2(calc.cogPKR)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mt-3">
                          <button onClick={() => openProduct(p)} className="flex-1 flex items-center justify-center gap-1 text-[11px] px-3 py-1.5 border border-border text-muted hover:text-foreground hover:border-green-500/40 rounded-lg cursor-pointer">
                            <Pencil className="w-3 h-3" /> Recipe
                          </button>
                          <button onClick={() => copyShareLink(p.id)} className={`flex-1 flex items-center justify-center gap-1 text-[11px] px-3 py-1.5 rounded-lg cursor-pointer transition-colors ${copiedId === p.id ? "bg-green-500/20 text-green-400 border border-green-500/30" : "border border-border text-muted hover:text-green-400 hover:border-green-500/40"}`}>
                            {copiedId === p.id ? <><Copy className="w-3 h-3" /> Copied!</> : <><ExternalLink className="w-3 h-3" /> Share</>}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {filteredProducts.length === 0 && <div className="col-span-3 py-12 text-center text-muted">No products yet.</div>}
              </div>
            )}

            {/* ── BRANDS TAB ── */}
            {tab === "brands" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredBrands.map(b => (
                  <div key={b.id} className="bg-surface rounded-2xl border border-border overflow-hidden hover:border-violet-500/40 transition-all p-4">
                    <div className="flex items-start gap-3">
                      {b.logoUrl ? (
                        <img src={b.logoUrl} alt={b.name} className="w-14 h-14 rounded-lg object-cover border border-border shrink-0" />
                      ) : (
                        <div className="w-14 h-14 rounded-lg border border-dashed border-border bg-surface-light/30 flex items-center justify-center shrink-0">
                          <Tag className="w-5 h-5 text-muted/40" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-foreground leading-snug truncate">{b.name}</p>
                        <p className="text-[11px] text-muted mt-0.5">{[b.city, b.country].filter(Boolean).join(", ") || "—"}</p>
                        {b.address && <p className="text-[10px] text-muted mt-0.5 line-clamp-2">{b.address}</p>}
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/50">
                      <span className="text-[10px] text-muted">{products.filter(p => p.brandId === b.id).length} product(s)</span>
                      <div className="flex items-center gap-1">
                        <button onClick={() => requireAuth(() => { setEditingBrand(b); setShowBrandForm(true); })} className="p-1 text-muted hover:text-violet-400 cursor-pointer"><Pencil className="w-3.5 h-3.5" /></button>
                        <button onClick={() => requireAuth(() => deleteBrand(b.id))} className="p-1 text-muted hover:text-red-400 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                  </div>
                ))}
                {filteredBrands.length === 0 && <div className="col-span-3 py-12 text-center text-muted">No brands yet. Click "Add Brand" to get started.</div>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── PRODUCT FORM MODAL ── */}
      {showProductForm && (
        <ProductForm item={editingProduct} products={products} brands={brands} onSave={saveProduct} onClose={() => { setShowProductForm(false); setEditingProduct(null); }} />
      )}

      {showCartonImport && (
        <CartonImportModal products={products} onApply={applyCartonImport} onClose={() => setShowCartonImport(false)} />
      )}

      {/* ── MATERIAL FORM MODAL ── */}
      {showMaterialForm && (
        <MaterialForm item={editingMaterial} onSave={saveMaterial} onClose={() => { setShowMaterialForm(false); setEditingMaterial(null); }} />
      )}

      {/* ── BRAND FORM MODAL ── */}
      {showBrandForm && (
        <BrandForm item={editingBrand} onSave={saveBrand} onClose={() => { setShowBrandForm(false); setEditingBrand(null); }} />
      )}

      {/* ── SETTINGS MODAL ── */}
      {editSettings && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-2xl border border-border w-full max-w-sm p-6 space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-foreground">Global Settings</h3>
            {[["FC Rate (PKR per USD)", "fcRate", "number"], ["Base Currency", "currency", "text"], ["Target Currency", "targetCurrency", "text"]].map(([l, k, t]) => (
              <div key={k}><label className="text-[10px] text-muted uppercase tracking-wide block mb-1">{l}</label>
                <input type={t} value={String(settingsDraft[k as keyof Settings])} onChange={e => setSettingsDraft(p => ({ ...p, [k]: t === "number" ? parseFloat(e.target.value) || 0 : e.target.value }))}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-green-500/50" /></div>
            ))}
            <div className="pt-2 border-t border-border">
              <p className="text-[10px] text-green-400 uppercase tracking-wide font-semibold mb-2">Global Cost Settings — same for every product</p>
              {[["Admin %", "adminPct", "number"], ["WHT %", "whtPct", "number"], ["Service Charges %", "serviceCharges", "number"], ["EDS %", "eds", "number"], ["Courier Charges %", "courierCharges", "number"]].map(([l, k, t]) => (
                <div key={k} className="mb-3"><label className="text-[10px] text-muted uppercase tracking-wide block mb-1">{l}</label>
                  <input type={t} step="0.01" value={String(settingsDraft[k as keyof Settings])} onChange={e => setSettingsDraft(p => ({ ...p, [k]: t === "number" ? parseFloat(e.target.value) || 0 : e.target.value }))}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-green-500/50" /></div>
              ))}
            </div>
            <div className="flex gap-2 pt-2"><button onClick={() => setEditSettings(false)} className="flex-1 px-4 py-2 text-sm text-muted cursor-pointer">Cancel</button>
              <button onClick={saveSettings} className="flex-1 px-4 py-2 bg-green-500 text-white text-sm font-semibold rounded-lg cursor-pointer">Save</button></div>
          </div>
        </div>
      )}

      {pinModal && <PinModal onSuccess={s => { login(s); pinModal.action(s); }} onClose={() => setPinModal(null)} />}

      {/* Gear panel — rendered at root level to avoid backdrop-blur stacking context */}
      {showGear && (
        <div className="fixed right-4 top-14 w-72 bg-white rounded-2xl border border-gray-200 shadow-2xl overflow-hidden" style={{zIndex: 9999}} onClick={e => e.stopPropagation()}>
          {!session ? (
            <div className="p-4 space-y-3">
              <p className="text-xs font-semibold text-foreground">Login to Product List</p>
              <input type="password" value={gearPin} onChange={e => { setGearPin(e.target.value); setGearPinErr(""); }}
                onKeyDown={e => e.key === "Enter" && gearLogin()} placeholder="Enter your PIN" autoFocus
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-green-500/50" />
              {gearPinErr && <p className="text-xs text-red-400">{gearPinErr}</p>}
              <button onClick={gearLogin} className="w-full px-4 py-2 bg-green-500 hover:bg-green-500/80 text-white text-sm font-semibold rounded-lg cursor-pointer">Login</button>
            </div>
          ) : (
            <div className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div><p className="text-xs font-semibold text-foreground">{session.name}</p><p className="text-[10px] text-muted capitalize">{session.role}</p></div>
                <button onClick={logout} className="text-[10px] text-muted hover:text-red-400 cursor-pointer px-2 py-1 border border-border rounded-lg">Logout</button>
              </div>
              {session.role === "accountant" && (
                <div>
                  <p className="text-[10px] text-muted uppercase tracking-wide font-semibold mb-2">Access Rights {savingAccess && <span className="text-green-400">Saving...</span>}</p>
                  <table className="w-full text-xs">
                    <thead><tr className="text-[10px] text-muted">
                      <th className="text-left py-1 font-semibold">Section</th>
                      <th className="text-center py-1 font-semibold">Moiz (AA1)</th>
                      <th className="text-center py-1 font-semibold">Hamza (AA2)</th>
                    </tr></thead>
                    <tbody>
                      {([["Master Prices","master"],["Products & Recipes","products"],["Price List","pricelist"],["Brands","brands"]] as [string,string][]).map(([label, section]) => (
                        <tr key={section} className="border-t border-border/40">
                          <td className="py-2 text-foreground">{label}</td>
                          {(["aa1","aa2"] as const).map(role => {
                            const key = `${section}_${role}` as keyof typeof accessConfig;
                            return (
                              <td key={role} className="py-2 text-center">
                                <button onClick={() => toggleAccess(key)}
                                  className={`w-8 h-4 rounded-full transition-colors cursor-pointer relative ${accessConfig[key] ? "bg-green-500" : "bg-gray-200"}`}>
                                  <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all ${accessConfig[key] ? "right-0.5" : "left-0.5"}`} />
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {session.role !== "accountant" && (
                <div className="space-y-1">
                  <p className="text-[10px] text-muted uppercase tracking-wide font-semibold mb-2">Your Access</p>
                  {([["Master Prices","master"],["Products & Recipes","products"],["Price List","pricelist"],["Brands","brands"]] as [string,string][]).map(([label, section]) => (
                    <div key={section} className="flex items-center justify-between py-1">
                      <span className="text-xs text-foreground">{label}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${canAccess(section as "master"|"products"|"pricelist"|"brands") ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
                        {canAccess(section as "master"|"products"|"pricelist"|"brands") ? "Allowed" : "No Access"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════ PRODUCT FORM */
const SKU_PREFIX_BY_TYPE: Record<string, string> = {
  "FINISH GOODS": "SKU-FI", "RAW MATERIAL": "SKU-RM", "SEMI FINISHED": "SKU-SF", "PACKAGING": "SKU-PK",
};

function suggestNextSku(products: Product[], productType: string): string {
  const prefix = SKU_PREFIX_BY_TYPE[productType] || "SKU-FI";
  const rx = new RegExp(`^${prefix}-(\\d+)$`, "i");
  const maxN = products.reduce((max, p) => {
    const m = p.sku.match(rx);
    return m ? Math.max(max, parseInt(m[1], 10)) : max;
  }, 0);
  return `${prefix}-${String(maxN + 1).padStart(2, "0")}`;
}

function ProductForm({ item, products, brands, onSave, onClose }: { item: Product | null; products: Product[]; brands: Brand[]; onSave: (p: Product) => void; onClose: () => void }) {
  const empty: Product = { id: Math.random().toString(36).slice(2, 10), sku: suggestNextSku(products, "FINISH GOODS"), name: "", productType: "FINISH GOODS", fclQty: 1500, grossProfitPct: 50, imageUrl: "", notes: "", active: true, specs: "", packagingDesc: "", brandId: "", category: "" };
  const [f, setF] = useState<Product>(item ?? empty);
  const [skuTouched, setSkuTouched] = useState(!!item);
  const [uploading, setUploading] = useState(false);
  const s = <K extends keyof Product>(k: K, v: Product[K]) => setF(p => ({ ...p, [k]: v }));

  async function handleImageUpload(file: File) {
    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = (e.target?.result as string).split(",")[1];
        const res = await fetch("/api/product-list/upload-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: file.name, mimeType: file.type, base64 }),
        });
        const data = await res.json();
        if (data.thumbnailUrl) s("imageUrl", data.thumbnailUrl);
        else alert(data.error || "Upload failed");
        setUploading(false);
      };
      reader.readAsDataURL(file);
    } catch { setUploading(false); }
  }
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface rounded-2xl border border-border max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border"><h3 className="text-sm font-semibold text-foreground">{item ? "Edit" : "Add"} Product</h3><button onClick={onClose} className="text-muted hover:text-foreground cursor-pointer"><X className="w-4 h-4" /></button></div>
        <div className="overflow-auto p-5 flex-1">
          <div className="grid grid-cols-2 gap-3">
            {([["sku","SKU *","text"],["name","Product Name *","text"],["notes","Product Packaging","text"]] as [keyof Product, string, string][]).map(([k, l, t]) => (
              <div key={k} className={k === "name" || k === "notes" ? "col-span-2" : ""}>
                <label className="text-[10px] text-muted uppercase tracking-wide block mb-1">{l}</label>
                <input type={t} value={String(f[k] ?? "")} onChange={e => { s(k, e.target.value as never); if (k === "sku") setSkuTouched(true); }} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-green-500/50" />
              </div>
            ))}
            {/* Image upload */}
            <div className="col-span-2">
              <label className="text-[10px] text-muted uppercase tracking-wide block mb-1">Product Image</label>
              <div className="flex items-start gap-3">
                {f.imageUrl ? (
                  <div className="relative shrink-0">
                    <img src={f.imageUrl} alt="preview" className="w-20 h-20 rounded-lg object-cover border border-border" />
                    <button onClick={() => s("imageUrl", "")} className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center cursor-pointer text-[10px]">×</button>
                  </div>
                ) : (
                  <div className="w-20 h-20 rounded-lg border border-dashed border-border bg-surface-light/30 flex items-center justify-center shrink-0">
                    <Package className="w-6 h-6 text-muted/40" />
                  </div>
                )}
                <div className="flex-1 space-y-2">
                  <label className={`flex items-center justify-center gap-2 w-full px-4 py-2.5 border border-dashed border-green-500/40 text-green-400 hover:bg-green-500/5 rounded-lg cursor-pointer transition-colors text-sm ${uploading ? "opacity-50 cursor-not-allowed" : ""}`}>
                    {uploading ? "Uploading to Drive..." : "Upload Image"}
                    <input type="file" accept="image/*" className="hidden" disabled={uploading}
                      onChange={e => { const file = e.target.files?.[0]; if (file) handleImageUpload(file); e.target.value = ""; }} />
                  </label>
                  <p className="text-[10px] text-muted">Uploads to Google Drive · Only thumbnail stored · JPG/PNG recommended</p>
                  {f.imageUrl && <input type="text" value={f.imageUrl} onChange={e => s("imageUrl", e.target.value)} placeholder="Or paste Drive URL" className="w-full bg-background border border-border rounded-lg px-2 py-1.5 text-xs text-foreground focus:outline-none focus:border-green-500/50" />}
                </div>
              </div>
            </div>
            <div><label className="text-[10px] text-muted uppercase tracking-wide block mb-1">Product Type</label>
              <select value={f.productType} onChange={e => { s("productType", e.target.value); if (!item && !skuTouched) s("sku", suggestNextSku(products, e.target.value)); }} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-green-500/50 cursor-pointer">
                {PRODUCT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select></div>
            <div><label className="text-[10px] text-muted uppercase tracking-wide block mb-1">Brand *</label>
              <select value={f.brandId} onChange={e => s("brandId", e.target.value)} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-green-500/50 cursor-pointer">
                <option value="">— Select Brand —</option>
                {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              {brands.length === 0 && <p className="text-[10px] text-red-400 mt-1">No brands yet — add one in the Brands tab first.</p>}
            </div>
            <div><label className="text-[10px] text-muted uppercase tracking-wide block mb-1">Category</label>
              <input type="text" list="product-categories" value={f.category} onChange={e => s("category", e.target.value)} placeholder="e.g. RICE, SALT" className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-green-500/50" />
              <datalist id="product-categories">
                {[...new Set(products.map(p => p.category).filter(Boolean))].map(c => <option key={c} value={c} />)}
              </datalist>
              <p className="text-[10px] text-muted mt-1">Groups products on the CNF client price list (e.g. all RICE items under one heading).</p>
            </div>
            {([["fclQty","FCL Container Qty"],["grossProfitPct","Gross Profit %"]] as [keyof Product, string][]).map(([k, l]) => (
              <div key={k}><label className="text-[10px] text-muted uppercase tracking-wide block mb-1">{l}</label>
                <input type="number" step="0.01" value={Number(f[k])} onChange={e => s(k, parseFloat(e.target.value) || 0 as never)} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-green-500/50" /></div>
            ))}
          </div>
        </div>
        <div className="px-5 py-4 border-t border-border flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-muted cursor-pointer">Cancel</button>
          <button onClick={() => { if (!f.sku.trim() || !f.name.trim() || !f.brandId) return; onSave(f); }} className="flex items-center gap-1.5 px-5 py-2 bg-green-500 text-white text-sm font-semibold rounded-lg cursor-pointer"><Save className="w-3.5 h-3.5" /> Save</button>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════ CARTON IMPORT */
interface CartonRow { key: string; rawName: string; packing: string; dims: string; matchId: string; }

function normalizeTokens(s: string): string[] {
  return s.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim().split(" ").filter(Boolean);
}

function bestMatch(rawName: string, products: Product[]): string {
  const rowTokens = normalizeTokens(rawName);
  let best = ""; let bestScore = 0;
  for (const p of products) {
    const prodTokens = normalizeTokens(p.name);
    if (prodTokens.length === 0) continue;
    const common = prodTokens.filter(t => rowTokens.includes(t)).length;
    const score = common / prodTokens.length;
    if (score > bestScore) { bestScore = score; best = p.id; }
  }
  return bestScore >= 0.4 ? best : "";
}

function parseCartonWorkbook(wb: XLSX.WorkBook, products: Product[]): CartonRow[] {
  const out: CartonRow[] = [];
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown>(ws, { header: 1, defval: "" }) as (string | number)[][];

    let headerIdx = -1, nameCol = -1, packingCol = -1, dimsCol = -1, lCol = -1, wCol = -1, hCol = -1;
    for (let i = 0; i < rows.length; i++) {
      const cells = rows[i].map(c => String(c).trim().toUpperCase());
      const nc = cells.findIndex(c => c === "PRODUCT" || c === "DESCRIPTION");
      if (nc >= 0) {
        headerIdx = i; nameCol = nc;
        packingCol = cells.findIndex(c => c === "PACKING");
        dimsCol = cells.findIndex(c => c === "CARTONS SIZE");
        lCol = cells.findIndex(c => c === "L");
        wCol = cells.findIndex(c => c === "W");
        hCol = cells.findIndex(c => c === "H");
        break;
      }
    }
    if (headerIdx === -1) continue;

    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      const rawName = String(row[nameCol] ?? "").trim();
      if (!rawName) continue;
      const packing = packingCol >= 0 ? String(row[packingCol] ?? "").trim() : "";
      let dims = "";
      if (dimsCol >= 0 && row[dimsCol]) dims = String(row[dimsCol]).trim();
      else if (lCol >= 0 && wCol >= 0 && hCol >= 0) {
        const l = row[lCol], w = row[wCol], h = row[hCol];
        if (l !== "" && w !== "" && h !== "") dims = `${l} x ${w} x ${h}`;
      }
      if (!packing && !dims) continue; // section-header row with no carton data
      out.push({ key: `${sheetName}-${i}`, rawName, packing, dims, matchId: bestMatch(rawName, products) });
    }
  }
  return out;
}

function CartonImportModal({ products, onApply, onClose }: { products: Product[]; onApply: (u: { id: string; specs: string; packagingDesc: string }[]) => Promise<void>; onClose: () => void }) {
  const [rows, setRows] = useState<CartonRow[]>([]);
  const [parsing, setParsing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [fileName, setFileName] = useState("");
  const sortedProducts = [...products].sort((a, b) => a.name.localeCompare(b.name));

  function handleFile(file: File) {
    setParsing(true);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: "binary" });
        setRows(parseCartonWorkbook(wb, products));
      } catch {
        setRows([]);
      }
      setParsing(false);
    };
    reader.readAsBinaryString(file);
  }

  function updateMatch(key: string, matchId: string) {
    setRows(prev => prev.map(r => r.key === key ? { ...r, matchId } : r));
  }

  const matchedCount = rows.filter(r => r.matchId).length;

  async function apply() {
    setApplying(true);
    const updates = rows.filter(r => r.matchId).map(r => ({ id: r.matchId, specs: r.packing, packagingDesc: r.dims }));
    await onApply(updates);
    setApplying(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface rounded-2xl border border-border max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Import Carton Sizes</h3>
            <p className="text-[10px] text-muted mt-0.5">Upload the carton size list — match each row to a product to fill its Specs &amp; Packaging fields.</p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-foreground cursor-pointer"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 flex-1 overflow-auto space-y-4">
          {rows.length === 0 && (
            <label className={`flex flex-col items-center justify-center gap-2 w-full py-10 border border-dashed border-green-500/40 text-green-400 hover:bg-green-500/5 rounded-xl cursor-pointer transition-colors ${parsing ? "opacity-50 cursor-not-allowed" : ""}`}>
              <Upload className="w-6 h-6" />
              <span className="text-sm font-medium">{parsing ? "Parsing..." : "Click to upload carton size list (.xlsx)"}</span>
              <input type="file" accept=".xlsx,.xls" className="hidden" disabled={parsing}
                onChange={e => { const file = e.target.files?.[0]; if (file) handleFile(file); e.target.value = ""; }} />
            </label>
          )}

          {rows.length > 0 && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted">{fileName} — {rows.length} rows found, <span className="text-green-400 font-semibold">{matchedCount} matched</span></p>
                <button onClick={() => setRows([])} className="text-xs text-muted hover:text-foreground cursor-pointer">Upload a different file</button>
              </div>
              <div className="border border-border rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-surface-light/40 border-b border-border">
                      <th className="text-left px-3 py-2 font-semibold text-muted uppercase tracking-wide">Row from File</th>
                      <th className="text-left px-3 py-2 font-semibold text-muted uppercase tracking-wide w-64">Match to Product</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r.key} className="border-b border-border/50">
                        <td className="px-3 py-2 align-top">
                          <p className="font-medium text-foreground">{r.rawName}</p>
                          <p className="text-[10px] text-muted">{[r.packing, r.dims].filter(Boolean).join(" · ")}</p>
                        </td>
                        <td className="px-3 py-2 align-top">
                          <select value={r.matchId} onChange={e => updateMatch(r.key, e.target.value)}
                            className={`w-full bg-background border rounded-lg px-2 py-1.5 text-xs focus:outline-none cursor-pointer ${r.matchId ? "border-green-500/40 text-foreground" : "border-border text-muted"}`}>
                            <option value="">— Skip —</option>
                            {sortedProducts.map(p => <option key={p.id} value={p.id}>{p.name}{p.sku ? ` (${p.sku})` : ""}</option>)}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div className="px-5 py-4 border-t border-border flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-muted cursor-pointer">Cancel</button>
          {rows.length > 0 && (
            <button onClick={apply} disabled={applying || matchedCount === 0}
              className="flex items-center gap-1.5 px-5 py-2 bg-green-500 hover:bg-green-500/80 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg cursor-pointer">
              <Check className="w-3.5 h-3.5" /> Apply to {matchedCount} Product{matchedCount !== 1 ? "s" : ""}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════ MATERIAL FORM */
function MaterialForm({ item, onSave, onClose }: { item: Material | null; onSave: (m: Material) => void; onClose: () => void }) {
  const empty: Material = { id: Math.random().toString(36).slice(2, 10), name: "", unit: "PCS", category: "Raw Material", pricePerUnit: 0, updatedAt: "", defaultUnitType: "PCS" };
  const [f, setF] = useState<Material>(item ?? empty);
  const UNITS = ["PCS", "KG", "GRAM", "LITRE", "METER", "CARTON", "BOTTLE", "POUCH", "CONTAINER"];
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface rounded-2xl border border-border max-w-md w-full p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between"><h3 className="text-sm font-semibold text-foreground">{item ? "Edit" : "Add"} Material</h3><button onClick={onClose} className="text-muted hover:text-foreground cursor-pointer"><X className="w-4 h-4" /></button></div>
        <div><label className="text-[10px] text-muted uppercase tracking-wide block mb-1">Material Name *</label><input type="text" value={f.name} onChange={e => setF(p => ({ ...p, name: e.target.value }))} autoFocus className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-green-500/50" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-[10px] text-muted uppercase tracking-wide block mb-1">Unit</label>
            <select value={f.unit} onChange={e => setF(p => ({ ...p, unit: e.target.value }))} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-green-500/50 cursor-pointer">
              {UNITS.map(u => <option key={u} value={u}>{u}</option>)}</select></div>
          <div><label className="text-[10px] text-muted uppercase tracking-wide block mb-1">Category</label>
            <select value={f.category} onChange={e => setF(p => ({ ...p, category: e.target.value }))} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-green-500/50 cursor-pointer">
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
        </div>
        <div>
          <label className="text-[10px] text-muted uppercase tracking-wide block mb-1">Default Recipe Type</label>
          <select value={f.defaultUnitType} onChange={e => setF(p => ({ ...p, defaultUnitType: e.target.value as Material["defaultUnitType"] }))} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-green-500/50 cursor-pointer">
            {UNIT_TYPES.map(u => <option key={u} value={u}>{u === "PCS" ? "PCS (×qty)" : u === "CONTAINER" ? "CONTAINER (÷FCL)" : "FIXED (flat)"}</option>)}
          </select>
          <p className="text-[10px] text-muted mt-1">Auto-selected whenever this material is added to a product&apos;s recipe.</p>
        </div>
        <div><label className="text-[10px] text-muted uppercase tracking-wide block mb-1">Price per Unit (PKR) *</label>
          <input type="number" step="0.01" value={f.pricePerUnit} onChange={e => setF(p => ({ ...p, pricePerUnit: parseFloat(e.target.value) || 0 }))} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-green-500/50" /></div>
        <div className="flex gap-2 pt-2"><button onClick={onClose} className="flex-1 px-4 py-2 text-sm text-muted cursor-pointer">Cancel</button>
          <button onClick={() => { if (!f.name.trim()) return; onSave(f); }} className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 bg-green-500 text-white text-sm font-semibold rounded-lg cursor-pointer"><Save className="w-3.5 h-3.5" /> Save</button></div>
      </div>
    </div>
  );
}

/* ════════════════════════════════ BRAND FORM */
function BrandForm({ item, onSave, onClose }: { item: Brand | null; onSave: (b: Brand) => void; onClose: () => void }) {
  const empty: Brand = { id: Math.random().toString(36).slice(2, 10), name: "", address: "", city: "", country: "", logoUrl: "", createdAt: "", contactPerson: "", website: "", email: "" };
  const [f, setF] = useState<Brand>(item ?? empty);
  const [uploading, setUploading] = useState(false);
  const s = <K extends keyof Brand>(k: K, v: Brand[K]) => setF(p => ({ ...p, [k]: v }));

  async function handleLogoUpload(file: File) {
    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = (e.target?.result as string).split(",")[1];
        const res = await fetch("/api/product-list/upload-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: file.name, mimeType: file.type, base64 }),
        });
        const data = await res.json();
        if (data.thumbnailUrl) s("logoUrl", data.thumbnailUrl);
        else alert(data.error || "Upload failed");
        setUploading(false);
      };
      reader.readAsDataURL(file);
    } catch { setUploading(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface rounded-2xl border border-border max-w-md w-full p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between"><h3 className="text-sm font-semibold text-foreground">{item ? "Edit" : "Add"} Brand</h3><button onClick={onClose} className="text-muted hover:text-foreground cursor-pointer"><X className="w-4 h-4" /></button></div>
        <div><label className="text-[10px] text-muted uppercase tracking-wide block mb-1">Brand Name *</label>
          <input type="text" value={f.name} onChange={e => s("name", e.target.value)} autoFocus className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-green-500/50" /></div>
        <div><label className="text-[10px] text-muted uppercase tracking-wide block mb-1">Address</label>
          <input type="text" value={f.address} onChange={e => s("address", e.target.value)} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-green-500/50" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-[10px] text-muted uppercase tracking-wide block mb-1">City</label>
            <input type="text" value={f.city} onChange={e => s("city", e.target.value)} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-green-500/50" /></div>
          <div><label className="text-[10px] text-muted uppercase tracking-wide block mb-1">Country</label>
            <input type="text" value={f.country} onChange={e => s("country", e.target.value)} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-green-500/50" /></div>
        </div>
        <div><label className="text-[10px] text-muted uppercase tracking-wide block mb-1">Contact Person</label>
          <input type="text" value={f.contactPerson} onChange={e => s("contactPerson", e.target.value)} placeholder="e.g. Mr. Khalid Mehmood Paracha" className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-green-500/50" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-[10px] text-muted uppercase tracking-wide block mb-1">Website</label>
            <input type="text" value={f.website} onChange={e => s("website", e.target.value)} placeholder="www.example.com" className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-green-500/50" /></div>
          <div><label className="text-[10px] text-muted uppercase tracking-wide block mb-1">Email</label>
            <input type="text" value={f.email} onChange={e => s("email", e.target.value)} placeholder="name@example.com" className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-green-500/50" /></div>
        </div>
        <div>
          <label className="text-[10px] text-muted uppercase tracking-wide block mb-1">Logo</label>
          <div className="flex items-start gap-3">
            {f.logoUrl ? (
              <div className="relative shrink-0">
                <img src={f.logoUrl} alt="preview" className="w-16 h-16 rounded-lg object-cover border border-border" />
                <button onClick={() => s("logoUrl", "")} className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center cursor-pointer text-[10px]">×</button>
              </div>
            ) : (
              <div className="w-16 h-16 rounded-lg border border-dashed border-border bg-surface-light/30 flex items-center justify-center shrink-0">
                <Tag className="w-5 h-5 text-muted/40" />
              </div>
            )}
            <div className="flex-1 space-y-2">
              <label className={`flex items-center justify-center gap-2 w-full px-4 py-2.5 border border-dashed border-violet-500/40 text-violet-400 hover:bg-violet-500/5 rounded-lg cursor-pointer transition-colors text-sm ${uploading ? "opacity-50 cursor-not-allowed" : ""}`}>
                {uploading ? "Uploading to Drive..." : "Upload Logo"}
                <input type="file" accept="image/*" className="hidden" disabled={uploading}
                  onChange={e => { const file = e.target.files?.[0]; if (file) handleLogoUpload(file); e.target.value = ""; }} />
              </label>
              <p className="text-[10px] text-muted">Uploads to Google Drive · JPG/PNG recommended</p>
            </div>
          </div>
        </div>
        <div className="flex gap-2 pt-2"><button onClick={onClose} className="flex-1 px-4 py-2 text-sm text-muted cursor-pointer">Cancel</button>
          <button onClick={() => { if (!f.name.trim()) return; onSave(f); }} className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 bg-violet-500 hover:bg-violet-500/80 text-white text-sm font-semibold rounded-lg cursor-pointer"><Save className="w-3.5 h-3.5" /> Save</button></div>
      </div>
    </div>
  );
}
