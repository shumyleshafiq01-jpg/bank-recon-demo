"use client";
import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, Plus, Trash2, Pencil, X, Save, Search, Package, List, LayoutGrid, DollarSign, Settings2, Tag, Upload, Container, Edit2, Check, Loader2 } from "lucide-react";
import { COUNTRIES, continentForCountry } from "@/lib/countries";
import {
  calcRice, calcBagRate, RiceProduct, RiceMaster, RiceSettings, RiceProductByproduct, RiceBag,
  RICE_DEFAULT_SETTINGS, RICE_DEFAULT_PRODUCT_BYPRODUCTS,
} from "@/lib/rice-costing";
import CnfCards from "./CnfCards";
import { compressImage } from "@/lib/image-compress";

/* ═══════════ types (brands/categories mirror Food & Spices) */
interface RiceBrand { id: string; name: string; address: string; city: string; country: string; logoUrl: string; createdAt: string; contactPerson: string; website: string; email: string; }
interface RiceCategory { id: string; name: string; createdAt: string; }
interface RiceMockup { id: string; name: string; imageUrl: string; productIds: string[]; bagIds: string[]; sortOrder: number; }

const genId = () => Math.random().toString(36).slice(2, 10);
const fmt2 = (n: number) => n.toFixed(2);

type RiceTab = "products" | "master" | "brands" | "pricelist" | null;

async function getJson<T>(url: string, fallback: T): Promise<T> {
  try { const r = await fetch(url); const j = await r.json(); if (!r.ok || j?.error) return fallback; return j; }
  catch { return fallback; }
}

async function uploadImage(rawFile: File): Promise<string> {
  const file = await compressImage(rawFile);
  const base64 = await new Promise<string>((res, rej) => {
    const reader = new FileReader();
    reader.onload = () => res((reader.result as string).split(",")[1] ?? "");
    reader.onerror = rej;
    reader.readAsDataURL(file);
  });
  const r = await fetch("/api/product-list/upload-image", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename: file.name, mimeType: file.type, base64 }),
  });
  const j = await r.json();
  return j.thumbnailUrl || j.fullUrl || "";
}

function suggestNextRiceSku(products: RiceProduct[]): string {
  const rx = /^SKU-RI-(\d+)$/i;
  const maxN = products.reduce((max, p) => {
    const m = p.sku.match(rx);
    return m ? Math.max(max, parseInt(m[1], 10)) : max;
  }, 0);
  return `SKU-RI-${String(maxN + 1).padStart(2, "0")}`;
}

const emptyProduct = (products: RiceProduct[]): RiceProduct => ({
  id: genId(), sku: suggestNextRiceSku(products), name: "", brandId: "", category: "", imageUrl: "", packagingDesc: "",
  quantity: 1000, recoveryPct: 90, purchaseRate: 300, freight: 0,
  byproducts: RICE_DEFAULT_PRODUCT_BYPRODUCTS.map(b => ({ ...b })), active: true,
});

type ContainerMtRow = {
  id: string; country: string; mt20: number; mt40: number; mt40hc: number; updatedAt: string;
};

function ContainerMtSection({ rows, onUpdate, requireAuth }: { rows: ContainerMtRow[]; onUpdate: (rows: ContainerMtRow[]) => void; requireAuth: (fn: () => void) => void }) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState<ContainerMtRow[]>(rows);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => { setLocal(rows); }, [rows]);

  function initAllCountries() {
    const existing = new Set(local.map(r => r.country));
    const toAdd = COUNTRIES.filter(c => !existing.has(c.country)).map(c => ({
      id: crypto.randomUUID(), country: c.country, mt20: 0, mt40: 0, mt40hc: 0, updatedAt: "",
    }));
    setLocal(prev => [...prev, ...toAdd].sort((a, b) => a.country.localeCompare(b.country)));
  }

  function updateMt(i: number, field: "mt20" | "mt40" | "mt40hc", value: number) {
    setLocal(prev => { const next = [...prev]; next[i] = { ...next[i], [field]: Math.max(0, value) }; return next; });
  }

  async function save() {
    setSaving(true);
    const toSave = local.filter(r => r.mt20 > 0 || r.mt40 > 0 || r.mt40hc > 0);
    await fetch("/api/cnf/container-mt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: toSave }),
    });
    onUpdate(toSave);
    setEditing(false);
    setSaving(false);
  }

  const filtered = search
    ? local.filter(r => r.country.toLowerCase().includes(search.toLowerCase()))
    : local;
  const withValues = rows.filter(r => r.mt20 > 0 || r.mt40 > 0 || r.mt40hc > 0);
  const displayRows = editing ? filtered : withValues;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <Container className="w-4 h-4 text-green-600" />
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-gray-900">Container Capacity (MT)</h3>
              <span className="text-[10px] bg-green-50 text-green-600 px-2 py-0.5 rounded-full font-medium">Rice only</span>
              <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">{withValues.length} countries set</span>
            </div>
            <p className="text-[10px] text-gray-400 mt-0.5">Metric tons per container by country — used to calculate rice freight (freight USD ÷ MT = $/MT)</p>
          </div>
        </div>
        <div className="flex gap-2">
          {editing ? (
            <>
              <button onClick={() => { setLocal(rows); setEditing(false); setSearch(""); }} className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 cursor-pointer">Cancel</button>
              {local.length < COUNTRIES.length && (
                <button onClick={initAllCountries} className="flex items-center gap-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg cursor-pointer transition-colors">
                  <Plus className="w-3 h-3" /> Add All Countries
                </button>
              )}
              <button onClick={() => requireAuth(() => save())} disabled={saving} className="flex items-center gap-1 text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg cursor-pointer transition-colors">
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Save
              </button>
            </>
          ) : (
            <button onClick={() => { setEditing(true); if (local.length === 0) initAllCountries(); }} className="flex items-center gap-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg cursor-pointer transition-colors">
              <Edit2 className="w-3 h-3" /> Edit
            </button>
          )}
        </div>
      </div>

      {editing && (
        <div className="px-4 py-2 border-b border-gray-100">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search country…"
            className="w-full max-w-xs border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-green-400" />
        </div>
      )}

      {displayRows.length === 0 && !editing ? (
        <div className="px-5 py-8 text-center text-sm text-gray-400">
          No MT values set yet. Click Edit to configure container capacity per country.
        </div>
      ) : (
        <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Country</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Continent</th>
                <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">20ft (MT)</th>
                <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">40ft (MT)</th>
                <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">40ft HC (MT)</th>
              </tr>
            </thead>
            <tbody>
              {displayRows.map((r) => {
                const realIdx = local.findIndex(lr => lr.id === r.id);
                return (
                  <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-2 font-medium text-gray-900 text-xs">{r.country}</td>
                    <td className="px-4 py-2 text-xs text-gray-500">{continentForCountry(r.country) || "—"}</td>
                    <td className="px-4 py-2 text-right">
                      {editing ? (
                        <input type="number" min={0} step={0.1} value={r.mt20 || ""} onChange={e => updateMt(realIdx, "mt20", parseFloat(e.target.value) || 0)}
                          className="w-20 border border-gray-200 rounded px-2 py-1 text-xs text-gray-900 text-right focus:outline-none focus:border-green-400 ml-auto block" />
                      ) : (
                        <span className={`text-xs ${r.mt20 > 0 ? "font-semibold text-green-700" : "text-gray-300"}`}>{r.mt20 || "—"}</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {editing ? (
                        <input type="number" min={0} step={0.1} value={r.mt40 || ""} onChange={e => updateMt(realIdx, "mt40", parseFloat(e.target.value) || 0)}
                          className="w-20 border border-gray-200 rounded px-2 py-1 text-xs text-gray-900 text-right focus:outline-none focus:border-green-400 ml-auto block" />
                      ) : (
                        <span className={`text-xs ${r.mt40 > 0 ? "font-semibold text-green-700" : "text-gray-300"}`}>{r.mt40 || "—"}</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {editing ? (
                        <input type="number" min={0} step={0.1} value={r.mt40hc || ""} onChange={e => updateMt(realIdx, "mt40hc", parseFloat(e.target.value) || 0)}
                          className="w-20 border border-gray-200 rounded px-2 py-1 text-xs text-gray-900 text-right focus:outline-none focus:border-green-400 ml-auto block" />
                      ) : (
                        <span className={`text-xs ${r.mt40hc > 0 ? "font-semibold text-green-700" : "text-gray-300"}`}>{r.mt40hc || "—"}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function RiceWorkspace({ requireAuth }: { requireAuth: (fn: () => void) => void }) {
  const [tab, setTab] = useState<RiceTab>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [products, setProducts] = useState<RiceProduct[]>([]);
  const [master, setMaster] = useState<RiceMaster>({ byproducts: [], charges: [] });
  const [bags, setBags] = useState<RiceBag[]>([]);
  const [settings, setSettings] = useState<RiceSettings>({ ...RICE_DEFAULT_SETTINGS });
  const [brands, setBrands] = useState<RiceBrand[]>([]);
  const [categories, setCategories] = useState<RiceCategory[]>([]);
  const [mockups, setMockups] = useState<RiceMockup[]>([]);
  const [containerMtRows, setContainerMtRows] = useState<ContainerMtRow[]>([]);

  const [search, setSearch] = useState("");
  const [plView, setPlView] = useState<"grid" | "list">("grid");
  const [plBrandFilter, setPlBrandFilter] = useState("");
  const [plCategoryFilter, setPlCategoryFilter] = useState("");
  const [plSort, setPlSort] = useState<"name-asc" | "name-desc" | "price-asc" | "price-desc">("name-asc");

  // modals
  const [editingProduct, setEditingProduct] = useState<RiceProduct | null>(null);
  const [editingBrand, setEditingBrand] = useState<RiceBrand | null>(null);
  const [showBrandForm, setShowBrandForm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [newCategory, setNewCategory] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setLoadError(false);
    const [p, m, s, b, c, bg, mk, mt] = await Promise.all([
      getJson<{ products: RiceProduct[] }>("/api/product-list/rice-products", { products: [] }),
      getJson<RiceMaster>("/api/product-list/rice-master", { byproducts: [], charges: [] }),
      getJson<RiceSettings>("/api/product-list/rice-settings", { ...RICE_DEFAULT_SETTINGS }),
      getJson<{ brands: RiceBrand[] }>("/api/product-list/rice-brands", { brands: [] }),
      getJson<{ categories: RiceCategory[] }>("/api/product-list/rice-categories", { categories: [] }),
      getJson<{ bags: RiceBag[] }>("/api/product-list/rice-bags", { bags: [] }),
      getJson<{ mockups: RiceMockup[] }>("/api/product-list/rice-mockups", { mockups: [] }),
      getJson<{ rows: ContainerMtRow[] }>("/api/cnf/container-mt", { rows: [] }),
    ]);
    setProducts(p.products ?? []);
    setMaster({ byproducts: m.byproducts ?? [], charges: m.charges ?? [] });
    setSettings(s);
    setBrands(b.brands ?? []);
    setCategories(c.categories ?? []);
    setBags(bg.bags ?? []);
    setMockups(mk.mockups ?? []);
    setContainerMtRows(mt.rows ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const brandName = (id: string) => brands.find(b => b.id === id)?.name || "—";
  const calc = (p: RiceProduct) => calcRice(p, master, settings);

  /* ─── product save/delete */
  async function saveProduct(p: RiceProduct) {
    setProducts(prev => prev.some(x => x.id === p.id) ? prev.map(x => x.id === p.id ? p : x) : [...prev, p]);
    setEditingProduct(null);
    await fetch("/api/product-list/rice-products", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "upsert", product: p }) });
  }
  async function deleteProduct(id: string) {
    setProducts(prev => prev.filter(x => x.id !== id));
    await fetch("/api/product-list/rice-products", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", product: { id } }) });
  }

  /* ─── master save/delete */
  async function saveMasterItem(kind: "byproduct" | "charge" | "bag", item: { id: string; name: string; rate: number; sortOrder: number }) {
    await fetch("/api/product-list/rice-master", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "upsert", item: { ...item, kind } }) });
    await load();
  }
  async function deleteMasterItem(id: string) {
    await fetch("/api/product-list/rice-master", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", id }) });
    await load();
  }

  /* ─── bags (calculator) — optimistic local update, persist in background */
  async function saveBag(b: RiceBag) {
    setBags(prev => prev.some(x => x.id === b.id) ? prev.map(x => x.id === b.id ? b : x) : [...prev, b]);
    await fetch("/api/product-list/rice-bags", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "upsert", bag: b }) });
  }
  async function deleteBag(id: string) {
    setBags(prev => prev.filter(x => x.id !== id));
    await fetch("/api/product-list/rice-bags", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", id }) });
  }

  /* ─── mockups */
  async function saveMockup(m: RiceMockup) {
    setMockups(prev => prev.some(x => x.id === m.id) ? prev.map(x => x.id === m.id ? m : x) : [...prev, m]);
    await fetch("/api/product-list/rice-mockups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "upsert", mockup: m }) });
  }
  async function deleteMockup(id: string) {
    setMockups(prev => prev.filter(x => x.id !== id));
    await fetch("/api/product-list/rice-mockups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", id }) });
  }

  /* ─── settings */
  async function saveSettings(s: RiceSettings) {
    setSettings(s); setShowSettings(false);
    await fetch("/api/product-list/rice-settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(s) });
  }
  // Persist just the bag-calculator settings (dollar rate / overhead) inline.
  async function saveBagSettings(patch: Partial<RiceSettings>) {
    const next = { ...settings, ...patch };
    setSettings(next);
    await fetch("/api/product-list/rice-settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
  }

  /* ─── brands */
  async function saveBrand(b: RiceBrand) {
    setBrands(prev => prev.some(x => x.id === b.id) ? prev.map(x => x.id === b.id ? b : x) : [...prev, b]);
    setShowBrandForm(false); setEditingBrand(null);
    await fetch("/api/product-list/rice-brands", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "upsert", brand: b }) });
  }
  async function deleteBrand(id: string) {
    setBrands(prev => prev.filter(x => x.id !== id));
    await fetch("/api/product-list/rice-brands", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", brand: { id } }) });
  }

  /* ─── categories */
  async function saveCategory(name: string) {
    const n = name.trim(); if (!n) return;
    const cat = { id: genId(), name: n, createdAt: new Date().toISOString() };
    setCategories(prev => [...prev, cat]); setNewCategory("");
    await fetch("/api/product-list/rice-categories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "upsert", category: cat }) });
  }
  async function deleteCategory(id: string) {
    setCategories(prev => prev.filter(c => c.id !== id));
    await fetch("/api/product-list/rice-categories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", id }) });
  }

  const filteredProducts = products.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase()));
  const filteredBrands = brands.filter(b => !search || b.name.toLowerCase().includes(search.toLowerCase()));

  const pricelistRows = filteredProducts
    .filter(p => (!plBrandFilter || p.brandId === plBrandFilter) && (!plCategoryFilter || p.category === plCategoryFilter))
    .map(p => ({ p, c: calc(p) }))
    .sort((a, b) => {
      switch (plSort) {
        case "name-desc": return b.p.name.localeCompare(a.p.name);
        case "price-asc": return a.c.fobPerPmt - b.c.fobPerPmt;
        case "price-desc": return b.c.fobPerPmt - a.c.fobPerPmt;
        default: return a.p.name.localeCompare(b.p.name);
      }
    });

  if (loading) return <div className="py-20 text-center text-muted text-sm">Loading Rice division…</div>;

  return (
    <div className="space-y-5">
      {loadError && <div className="text-xs text-red-400">Couldn&apos;t load some rice data — try again.</div>}

      {/* Section header */}
      {tab && (
        <div className="flex items-center justify-between flex-wrap gap-3">
          <button onClick={() => { setTab(null); setSearch(""); }} className="flex items-center gap-2 text-sm text-muted hover:text-foreground cursor-pointer">
            <ArrowLeft className="w-4 h-4" />
            <span className="font-semibold">{tab === "products" ? "Rice Products" : tab === "master" ? "Rice Master Prices" : tab === "brands" ? "Rice Brands & Categories" : "Rice Price List"}</span>
          </button>
          <div className="flex items-center gap-2">
            {tab === "master" && (
              <button onClick={() => setShowSettings(true)} className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-border text-muted hover:text-foreground hover:border-amber-500/40 rounded-lg cursor-pointer">
                <Settings2 className="w-3 h-3" /> Cost Settings (FC {settings.fcRate})
              </button>
            )}
            {tab === "products" && (
              <button onClick={() => requireAuth(() => setEditingProduct(emptyProduct(products)))} className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-amber-500 hover:bg-amber-500/80 text-white rounded-lg cursor-pointer">
                <Plus className="w-3 h-3" /> Add Rice Product
              </button>
            )}
            {tab === "brands" && (
              <button onClick={() => requireAuth(() => { setEditingBrand(null); setShowBrandForm(true); })} className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-amber-500 hover:bg-amber-500/80 text-white rounded-lg cursor-pointer">
                <Plus className="w-3 h-3" /> Add Brand
              </button>
            )}
          </div>
        </div>
      )}

      {/* Search bar */}
      {tab && tab !== "master" && (
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
              className="w-full bg-surface border border-border rounded-xl pl-9 pr-4 py-2.5 text-sm text-foreground focus:outline-none focus:border-amber-500/50" />
          </div>
          {tab === "pricelist" && (
            <div className="flex items-center gap-2 flex-wrap">
              <select value={plBrandFilter} onChange={e => setPlBrandFilter(e.target.value)} className="bg-surface border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-amber-500/50 cursor-pointer">
                <option value="">All Brands</option>
                {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <select value={plCategoryFilter} onChange={e => setPlCategoryFilter(e.target.value)} className="bg-surface border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-amber-500/50 cursor-pointer">
                <option value="">All Categories</option>
                {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
              <select value={plSort} onChange={e => setPlSort(e.target.value as typeof plSort)} className="bg-surface border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-amber-500/50 cursor-pointer">
                <option value="name-asc">Product (A–Z)</option>
                <option value="name-desc">Product (Z–A)</option>
                <option value="price-asc">FOB/PMT (Low → High)</option>
                <option value="price-desc">FOB/PMT (High → Low)</option>
              </select>
              <div className="flex items-center border border-border rounded-xl overflow-hidden">
                <button onClick={() => setPlView("grid")} title="Grid" className={`p-2.5 cursor-pointer ${plView === "grid" ? "bg-amber-500/15 text-amber-500" : "text-muted hover:text-foreground"}`}><LayoutGrid className="w-4 h-4" /></button>
                <button onClick={() => setPlView("list")} title="List" className={`p-2.5 cursor-pointer border-l border-border ${plView === "list" ? "bg-amber-500/15 text-amber-500" : "text-muted hover:text-foreground"}`}><List className="w-4 h-4" /></button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── LANDING CARDS ── */}
      {!tab && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
          {([
            { key: "products" as const, Icon: Package, label: "Products", desc: "Rice costing sheets — recovery %, purchase rate, by-products. Auto-calculates FOB per PMT.", count: products.length },
            { key: "master" as const, Icon: List, label: "Master Prices", desc: "Milling & handling charges (per-kg) + bag packaging calculator ($/PMT) + mockup builder. Update once — all rice pricing recalculates.", count: master.charges.length + bags.length + mockups.length },
            { key: "pricelist" as const, Icon: DollarSign, label: "Price List", desc: "Calculated rice price list, FOB per metric ton.", count: products.length },
            { key: "brands" as const, Icon: Tag, label: "Brands & Categories", desc: "Rice brands and categories. Tag each rice product to a brand and category.", count: brands.length + categories.length },
          ]).map(({ key, Icon, label, desc, count }) => (
            <button key={key} onClick={() => { setTab(key); setSearch(""); }}
              className="group text-left p-5 bg-white/65 backdrop-blur-sm rounded-2xl border border-gray-200/80 hover:border-amber-400/60 hover:bg-white/95 hover:shadow-md cursor-pointer transition-all shadow-sm">
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100/60 flex items-center justify-center"><Icon className="w-5 h-5 text-amber-500" /></div>
                {count != null && <span className="text-xs font-mono text-muted">{count}</span>}
              </div>
              <p className="text-base font-bold text-foreground">{label}</p>
              <p className="text-xs text-muted mt-1 leading-relaxed">{desc}</p>
            </button>
          ))}
          {/* CNF builder + client list are shared across all divisions */}
          <CnfCards />
        </div>
      )}

      {/* ── PRODUCTS TAB ── */}
      {tab === "products" && (
        <div className="bg-surface rounded-2xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="bg-amber-500/10 text-amber-600">
              <th className="px-4 py-3 text-left font-semibold w-[40px]">#</th>
              <th className="px-4 py-3 text-left font-semibold w-[120px]">SKU</th>
              <th className="px-4 py-3 text-left font-semibold">Product Name</th>
              <th className="px-4 py-3 text-left font-semibold w-[120px]">Brand</th>
              <th className="px-4 py-3 text-right font-semibold w-[100px]">Recovery</th>
              <th className="px-4 py-3 text-right font-semibold w-[150px]">FOB / PMT</th>
              <th className="px-4 py-3 text-center w-[90px]">Actions</th>
            </tr></thead>
            <tbody>
              {filteredProducts.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-muted">No rice products yet. Click &quot;Add Rice Product&quot;.</td></tr>}
              {filteredProducts.map((p, i) => {
                const c = calc(p);
                return (
                  <tr key={p.id} className={`hover:bg-amber-500/5 transition-colors ${i % 2 ? "bg-surface-light/20" : ""}`}>
                    <td className="px-4 py-3 text-muted">{i + 1}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted">{p.sku || "—"}</td>
                    <td className="px-4 py-3 font-semibold text-foreground">{p.name}</td>
                    <td className="px-4 py-3">{p.brandId ? <span className="text-xs px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-400 font-semibold">{brandName(p.brandId)}</span> : <span className="text-xs text-red-400">Unassigned</span>}</td>
                    <td className="px-4 py-3 text-right text-muted">{p.recoveryPct}%</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-amber-600">${fmt2(c.fobPerPmt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => requireAuth(() => setEditingProduct({ ...p }))} className="p-1 text-muted hover:text-amber-500 cursor-pointer"><Pencil className="w-3.5 h-3.5" /></button>
                        <button onClick={() => requireAuth(() => deleteProduct(p.id))} className="p-1 text-muted hover:text-red-400 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
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
        <div className="space-y-6">
          <p className="text-[11px] text-muted">Milling &amp; handling charges (per-kg) are shared across all rice products. By-product resale rates are set per-product. Bag packaging $/PMT is calculated from component prices below and added at CNF.</p>
          <div className="max-w-xl">
            <MasterTable title="Milling & Handling Charges (PKR/kg)" kind="charge" items={master.charges}
              onSave={(it) => requireAuth(() => saveMasterItem("charge", it))} onDelete={(id) => requireAuth(() => deleteMasterItem(id))} />
          </div>
          <BagCalculator bags={bags} dollarRate={settings.bagDollarRate} overheadPct={settings.bagOverheadPct}
            onSave={(b) => requireAuth(() => saveBag(b))} onDelete={(id) => requireAuth(() => deleteBag(id))}
            onSaveSettings={(p) => requireAuth(() => saveBagSettings(p))} />
          <MockupBuilder mockups={mockups} products={products} bags={bags}
            onSave={(m) => requireAuth(() => saveMockup(m))} onDelete={(id) => requireAuth(() => deleteMockup(id))} />
          <ContainerMtSection rows={containerMtRows} onUpdate={rows => setContainerMtRows(rows)} requireAuth={requireAuth} />
        </div>
      )}

      {/* ── BRANDS & CATEGORIES TAB ── */}
      {tab === "brands" && (
        <div className="space-y-8">
          <div>
            <h3 className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-3">Brands</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredBrands.map(b => (
                <div key={b.id} className="bg-surface rounded-2xl border border-border p-4">
                  <div className="flex items-start gap-3">
                    {b.logoUrl ? <img src={b.logoUrl} alt={b.name} className="w-14 h-14 rounded-lg object-cover border border-border shrink-0" />
                      : <div className="w-14 h-14 rounded-lg border border-dashed border-border bg-surface-light/30 flex items-center justify-center shrink-0"><Tag className="w-5 h-5 text-muted/40" /></div>}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-foreground truncate">{b.name}</p>
                      <p className="text-[11px] text-muted mt-0.5">{[b.city, b.country].filter(Boolean).join(", ") || "—"}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/50">
                    <span className="text-[10px] text-muted">{products.filter(p => p.brandId === b.id).length} product(s)</span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => requireAuth(() => { setEditingBrand(b); setShowBrandForm(true); })} className="p-1 text-muted hover:text-amber-500 cursor-pointer"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => requireAuth(() => deleteBrand(b.id))} className="p-1 text-muted hover:text-red-400 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                </div>
              ))}
              {filteredBrands.length === 0 && <div className="col-span-full py-8 text-center text-muted text-sm">No rice brands yet.</div>}
            </div>
          </div>
          <div>
            <h3 className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-3">Categories</h3>
            <div className="bg-surface rounded-2xl border border-border p-4 max-w-2xl">
              <div className="flex items-center gap-2 mb-4">
                <input value={newCategory} onChange={e => setNewCategory(e.target.value)} onKeyDown={e => e.key === "Enter" && requireAuth(() => saveCategory(newCategory))}
                  placeholder="New category (e.g. BASMATI)" className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-amber-500/50" />
                <button onClick={() => requireAuth(() => saveCategory(newCategory))} disabled={!newCategory.trim()} className="flex items-center gap-1.5 text-xs px-3 py-2 bg-amber-500 hover:bg-amber-500/80 disabled:opacity-40 text-white rounded-lg cursor-pointer"><Plus className="w-3 h-3" /> Add</button>
              </div>
              {categories.length === 0 ? <p className="text-sm text-muted text-center py-4">No categories yet.</p> : (
                <div className="flex flex-wrap gap-2">
                  {categories.map(c => (
                    <span key={c.id} className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-amber-500/10 text-amber-600 rounded-full">
                      {c.name}<button onClick={() => requireAuth(() => deleteCategory(c.id))} className="text-muted hover:text-red-400 cursor-pointer"><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── PRICE LIST TAB ── */}
      {tab === "pricelist" && plView === "grid" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {pricelistRows.map(({ p, c }) => (
            <div key={p.id} className="bg-surface rounded-2xl border border-border overflow-hidden">
              {p.imageUrl ? <img src={p.imageUrl} alt={p.name} className="w-full h-40 object-cover" />
                : <div className="w-full h-40 bg-amber-500/5 flex items-center justify-center"><Package className="w-12 h-12 text-amber-500/20" /></div>}
              <div className="p-4">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-mono text-muted">{p.sku || "—"}</p>
                  {p.brandId && <span className="text-[9px] px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-400 font-semibold">{brandName(p.brandId)}</span>}
                </div>
                <p className="text-sm font-bold text-foreground mt-0.5">{p.name}</p>
                {p.category && <p className="text-[10px] text-muted mt-0.5">{p.category}</p>}
                <div className="flex items-center justify-between mt-3">
                  <div><p className="text-[10px] text-muted">FOB / PMT</p><p className="text-xl font-bold text-amber-600">${fmt2(c.fobPerPmt)}</p></div>
                  <div className="text-right"><p className="text-[10px] text-muted">Recovery</p><p className="text-sm font-semibold text-muted">{p.recoveryPct}%</p></div>
                </div>
              </div>
            </div>
          ))}
          {pricelistRows.length === 0 && <div className="col-span-3 py-12 text-center text-muted">No rice products match.</div>}
        </div>
      )}
      {tab === "pricelist" && plView === "list" && (
        <div className="bg-surface rounded-2xl border border-border overflow-hidden">
          <table className="w-full text-xs">
            <thead><tr className="bg-amber-500/10 text-amber-600">
              <th className="px-4 py-3 text-left font-semibold">Product Name</th>
              <th className="px-4 py-3 text-left font-semibold w-[120px]">Brand</th>
              <th className="px-4 py-3 text-left font-semibold w-[120px]">Category</th>
              <th className="px-4 py-3 text-right font-semibold w-[90px]">Recovery</th>
              <th className="px-4 py-3 text-right font-semibold w-[130px]">FOB / PMT</th>
            </tr></thead>
            <tbody>
              {pricelistRows.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-muted">No rice products match.</td></tr>}
              {pricelistRows.map(({ p, c }, i) => (
                <tr key={p.id} className={`hover:bg-amber-500/5 ${i % 2 ? "bg-surface-light/20" : ""}`}>
                  <td className="px-4 py-3 font-semibold text-foreground">{p.name}</td>
                  <td className="px-4 py-3">{p.brandId ? <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-400 font-semibold">{brandName(p.brandId)}</span> : <span className="text-[10px] text-muted">—</span>}</td>
                  <td className="px-4 py-3 text-muted">{p.category || "—"}</td>
                  <td className="px-4 py-3 text-right text-muted">{p.recoveryPct}%</td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-amber-600">${fmt2(c.fobPerPmt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── MODALS ── */}
      {editingProduct && <ProductForm product={editingProduct} master={master} settings={settings} brands={brands} categories={categories}
        onClose={() => setEditingProduct(null)} onSave={p => requireAuth(() => saveProduct(p))} />}
      {showSettings && <SettingsForm settings={settings} onClose={() => setShowSettings(false)} onSave={saveSettings} />}
      {showBrandForm && <BrandForm brand={editingBrand} onClose={() => { setShowBrandForm(false); setEditingBrand(null); }} onSave={saveBrand} />}
    </div>
  );
}

/* ═══════════ Master rate table */
function MasterTable({ title, kind, items, onSave, onDelete }: {
  title: string; kind: "byproduct" | "charge" | "bag";
  items: { id: string; name: string; rate: number; sortOrder: number }[];
  onSave: (it: { id: string; name: string; rate: number; sortOrder: number }) => void;
  onDelete: (id: string) => void;
}) {
  const [newName, setNewName] = useState("");
  const [newRate, setNewRate] = useState("");
  return (
    <div className="bg-surface rounded-2xl border border-border overflow-hidden">
      <div className="px-4 py-3 border-b border-border"><h3 className="text-xs font-semibold text-amber-600 uppercase tracking-wide">{title}</h3></div>
      <table className="w-full text-xs">
        <thead><tr className="text-muted"><th className="px-4 py-2 text-left font-semibold">Name</th><th className="px-4 py-2 text-right font-semibold w-[110px]">Rate</th><th className="w-[50px]"></th></tr></thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={it.id} className={i % 2 ? "bg-surface-light/20" : ""}>
              <td className="px-4 py-2">
                <input defaultValue={it.name} onBlur={e => e.target.value !== it.name && onSave({ ...it, name: e.target.value })}
                  className="w-full bg-transparent border border-transparent hover:border-border focus:border-amber-500/50 rounded px-1.5 py-1 text-foreground focus:outline-none" />
              </td>
              <td className="px-4 py-2 text-right">
                <input type="number" step="0.01" defaultValue={it.rate} onBlur={e => parseFloat(e.target.value) !== it.rate && onSave({ ...it, rate: parseFloat(e.target.value) || 0 })}
                  className="w-24 bg-transparent border border-transparent hover:border-border focus:border-amber-500/50 rounded px-1.5 py-1 text-right font-mono text-foreground focus:outline-none" />
              </td>
              <td className="px-2 py-2 text-center"><button onClick={() => onDelete(it.id)} className="p-1 text-muted hover:text-red-400 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center gap-2 p-3 border-t border-border">
        <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="New name"
          className="flex-1 bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-amber-500/50" />
        <input type="number" step="0.01" value={newRate} onChange={e => setNewRate(e.target.value)} placeholder="Rate"
          className="w-20 bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-right font-mono text-foreground focus:outline-none focus:border-amber-500/50" />
        <button disabled={!newName.trim()} onClick={() => { onSave({ id: genId(), name: newName.trim(), rate: parseFloat(newRate) || 0, sortOrder: items.length }); setNewName(""); setNewRate(""); }}
          className="flex items-center gap-1 text-xs px-3 py-1.5 bg-amber-500 hover:bg-amber-500/80 disabled:opacity-40 text-white rounded-lg cursor-pointer"><Plus className="w-3 h-3" /> Add</button>
      </div>
    </div>
  );
}

/* ═══════════ Bag packaging calculator */
function BagCalculator({ bags, dollarRate, overheadPct, onSave, onDelete, onSaveSettings }: {
  bags: RiceBag[]; dollarRate: number; overheadPct: number;
  onSave: (b: RiceBag) => void; onDelete: (id: string) => void; onSaveSettings: (patch: Partial<RiceSettings>) => void;
}) {
  const [rows, setRows] = useState<RiceBag[]>(bags);
  useEffect(() => setRows(bags), [bags]);
  const [dr, setDr] = useState(dollarRate);
  const [oh, setOh] = useState(overheadPct);
  useEffect(() => { setDr(dollarRate); setOh(overheadPct); }, [dollarRate, overheadPct]);

  const patch = (i: number, p: Partial<RiceBag>) => setRows(rs => rs.map((b, j) => j === i ? { ...b, ...p } : b));
  const addRow = () => {
    const type = rows.length ? rows[rows.length - 1].type : "NON WOVEN";
    const nb: RiceBag = { id: genId(), type, sizeLabel: "", outerQty: 0, outerPKR: 0, innerQty: 0, innerPKR: 0, masterQty: 0, masterPKR: 0, labourPKR: 30, sortOrder: rows.length };
    setRows(rs => [...rs, nb]);
    onSave(nb);
  };
  const numCell = (i: number, key: keyof RiceBag, val: number, w = "w-16") => (
    <input type="number" step="0.01" value={val}
      onChange={e => patch(i, { [key]: parseFloat(e.target.value) || 0 } as Partial<RiceBag>)}
      onBlur={() => onSave(rows[i])}
      className={`${w} bg-transparent border border-transparent hover:border-border focus:border-amber-500/50 rounded px-1 py-0.5 text-right font-mono text-foreground focus:outline-none`} />
  );

  return (
    <div className="bg-surface rounded-2xl border border-border overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-xs font-semibold text-amber-600 uppercase tracking-wide">Bag Packaging Calculator ($/PMT)</h3>
          <p className="text-[10px] text-muted mt-0.5">$/PMT = material + {oh}% overhead + labour, converted at the bag dollar rate. Added at CNF. Add PP / PLASTIC / BOPP types here as needed.</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-[11px] text-muted">Dollar rate
            <input type="number" step="0.01" value={dr} onChange={e => setDr(parseFloat(e.target.value) || 0)} onBlur={() => dr !== dollarRate && onSaveSettings({ bagDollarRate: dr })}
              className="w-16 bg-background border border-border rounded px-1.5 py-1 text-right font-mono text-foreground focus:outline-none focus:border-amber-500/50" />
          </label>
          <label className="flex items-center gap-1.5 text-[11px] text-muted">Overhead %
            <input type="number" step="0.01" value={oh} onChange={e => setOh(parseFloat(e.target.value) || 0)} onBlur={() => oh !== overheadPct && onSaveSettings({ bagOverheadPct: oh })}
              className="w-14 bg-background border border-border rounded px-1.5 py-1 text-right font-mono text-foreground focus:outline-none focus:border-amber-500/50" />
          </label>
          <button onClick={addRow} className="flex items-center gap-1 text-xs px-3 py-1.5 bg-amber-500 hover:bg-amber-500/80 text-white rounded-lg cursor-pointer"><Plus className="w-3 h-3" /> Add bag</button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs whitespace-nowrap">
          <thead><tr className="text-muted bg-surface-light/20">
            <th className="px-3 py-2 text-left font-semibold">Type</th>
            <th className="px-3 py-2 text-left font-semibold">Size</th>
            <th className="px-3 py-2 text-right font-semibold">Outer qty</th>
            <th className="px-3 py-2 text-right font-semibold">Outer PKR</th>
            <th className="px-3 py-2 text-right font-semibold">Inner qty</th>
            <th className="px-3 py-2 text-right font-semibold">Inner PKR</th>
            <th className="px-3 py-2 text-right font-semibold">Master qty</th>
            <th className="px-3 py-2 text-right font-semibold">Master PKR</th>
            <th className="px-3 py-2 text-right font-semibold">Labour PKR</th>
            <th className="px-3 py-2 text-right font-semibold">$/PMT</th>
            <th className="w-[40px]"></th>
          </tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={11} className="px-4 py-6 text-center text-muted">No bags yet. Click &quot;Add bag&quot;.</td></tr>}
            {rows.map((b, i) => {
              const c = calcBagRate(b, dr, oh);
              return (
                <tr key={b.id} className={i % 2 ? "bg-surface-light/10" : ""}>
                  <td className="px-3 py-1"><input value={b.type} onChange={e => patch(i, { type: e.target.value })} onBlur={() => onSave(rows[i])} className="w-28 bg-transparent border border-transparent hover:border-border focus:border-amber-500/50 rounded px-1 py-0.5 text-foreground focus:outline-none" /></td>
                  <td className="px-3 py-1"><input value={b.sizeLabel} onChange={e => patch(i, { sizeLabel: e.target.value })} onBlur={() => onSave(rows[i])} placeholder="5 KG X 4" className="w-24 bg-transparent border border-transparent hover:border-border focus:border-amber-500/50 rounded px-1 py-0.5 text-foreground focus:outline-none" /></td>
                  <td className="px-3 py-1 text-right">{numCell(i, "outerQty", b.outerQty)}</td>
                  <td className="px-3 py-1 text-right">{numCell(i, "outerPKR", b.outerPKR)}</td>
                  <td className="px-3 py-1 text-right">{numCell(i, "innerQty", b.innerQty)}</td>
                  <td className="px-3 py-1 text-right">{numCell(i, "innerPKR", b.innerPKR)}</td>
                  <td className="px-3 py-1 text-right">{numCell(i, "masterQty", b.masterQty)}</td>
                  <td className="px-3 py-1 text-right">{numCell(i, "masterPKR", b.masterPKR)}</td>
                  <td className="px-3 py-1 text-right">{numCell(i, "labourPKR", b.labourPKR, "w-14")}</td>
                  <td className="px-3 py-1 text-right font-mono font-bold text-amber-600">${fmt2(c.finalPmt)}</td>
                  <td className="px-2 py-1 text-center"><button onClick={() => onDelete(b.id)} className="p-1 text-muted hover:text-red-400 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ═══════════ Product costing form (the ERP sheet) */
function ProductForm({ product, master, settings, brands, categories, onClose, onSave }: {
  product: RiceProduct; master: RiceMaster; settings: RiceSettings; brands: RiceBrand[]; categories: RiceCategory[];
  onClose: () => void; onSave: (p: RiceProduct) => void;
}) {
  // By-products are entered per-product (they vary by product), so the form owns
  // the full list — name, %, and rate — with free add/edit/delete.
  const [draft, setDraft] = useState<RiceProduct>({ ...product, byproducts: product.byproducts.map(b => ({ ...b })) });
  const upd = (k: keyof RiceProduct, v: unknown) => setDraft(d => ({ ...d, [k]: v }));
  const setBp = (i: number, patch: Partial<RiceProductByproduct>) => setDraft(d => ({ ...d, byproducts: d.byproducts.map((b, j) => j === i ? { ...b, ...patch } : b) }));
  const addBp = () => setDraft(d => ({ ...d, byproducts: [...d.byproducts, { name: "", percent: 0, rate: 0 }] }));
  const removeBp = (i: number) => setDraft(d => ({ ...d, byproducts: d.byproducts.filter((_, j) => j !== i) }));
  const c = calcRice(draft, master, settings);
  const totalBpPct = Math.round(draft.byproducts.reduce((s, b) => s + (b.percent || 0), 0) * 100) / 100;

  const Row = ({ label, val, bold, color }: { label: string; val: string; bold?: boolean; color?: string }) => (
    <div className="flex items-center justify-between py-1.5 border-b border-border/40">
      <span className="text-xs text-muted">{label}</span>
      <span className={`text-sm font-mono ${bold ? "font-bold" : ""} ${color ?? "text-foreground"}`}>{val}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface rounded-2xl border border-border w-full max-w-7xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-surface z-10">
          <h3 className="text-base font-semibold text-foreground">{product.name ? "Edit" : "New"} Rice Product</h3>
          <div className="flex items-center gap-2">
            <button onClick={() => onSave(draft)} disabled={!draft.name.trim()} className="flex items-center gap-1.5 text-sm px-4 py-2 bg-amber-500 hover:bg-amber-500/80 disabled:opacity-40 text-white rounded-lg cursor-pointer"><Save className="w-4 h-4" /> Save</button>
            <button onClick={onClose} className="p-1.5 text-muted hover:text-foreground cursor-pointer"><X className="w-4 h-4" /></button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-6">
          {/* Left: inputs */}
          <div className="lg:col-span-2 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Field className="col-span-2" label="Product Name"><input value={draft.name} onChange={e => upd("name", e.target.value)} className={inp} /></Field>
              <Field label="SKU"><input value={draft.sku} onChange={e => upd("sku", e.target.value)} className={inp} /></Field>
              <Field label="Brand">
                <select value={draft.brandId} onChange={e => upd("brandId", e.target.value)} className={inp}>
                  <option value="">—</option>{brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </Field>
              <Field label="Category">
                <select value={draft.category} onChange={e => upd("category", e.target.value)} className={inp}>
                  <option value="">—</option>{categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Field label="Quantity (kg)"><input type="number" step="1" value={draft.quantity} onChange={e => upd("quantity", parseFloat(e.target.value) || 0)} className={inp} /></Field>
              <Field label="Recovery %"><input type="number" step="0.01" value={draft.recoveryPct} onChange={e => upd("recoveryPct", parseFloat(e.target.value) || 0)} className={inp} /></Field>
              <Field label="Purchase Rate (PKR/kg)"><input type="number" step="0.01" value={draft.purchaseRate} onChange={e => upd("purchaseRate", parseFloat(e.target.value) || 0)} className={inp} /></Field>
            </div>

            {/* By-products — entered per product (vary by product) */}
            <div className="bg-background/50 rounded-xl border border-border overflow-hidden">
              <div className="px-4 py-2 border-b border-border flex items-center justify-between">
                <h4 className="text-xs font-semibold text-muted uppercase tracking-wide">By-products (% of raw input · resale rate)</h4>
                <button onClick={addBp} className="flex items-center gap-1 text-xs text-amber-500 hover:text-amber-400 cursor-pointer"><Plus className="w-3.5 h-3.5" /> Add by-product</button>
              </div>
              <table className="w-full text-sm">
                <thead><tr className="text-muted"><th className="px-4 py-2 text-left font-semibold">By-product</th><th className="px-4 py-2 text-right font-semibold w-[80px]">%</th><th className="px-4 py-2 text-right font-semibold w-[90px]">Rate</th><th className="px-4 py-2 text-right font-semibold w-[120px]">Value (PKR)</th><th className="w-[40px]"></th></tr></thead>
                <tbody>
                  {draft.byproducts.map((bp, i) => {
                    const kg = Math.round((bp.percent / 100) * c.rawInput * 100) / 100;
                    return (
                      <tr key={i}>
                        <td className="px-4 py-1.5"><input value={bp.name} onChange={e => setBp(i, { name: e.target.value })} placeholder="name" className="w-full bg-transparent border border-transparent hover:border-border focus:border-amber-500/50 rounded px-1.5 py-1 text-foreground focus:outline-none" /></td>
                        <td className="px-4 py-1.5 text-right"><input type="number" step="0.01" value={bp.percent} onChange={e => setBp(i, { percent: parseFloat(e.target.value) || 0 })} className="w-20 bg-transparent border border-transparent hover:border-border focus:border-amber-500/50 rounded px-1.5 py-1 text-right font-mono text-foreground focus:outline-none" /></td>
                        <td className="px-4 py-1.5 text-right"><input type="number" step="0.01" value={bp.rate} onChange={e => setBp(i, { rate: parseFloat(e.target.value) || 0 })} className="w-24 bg-transparent border border-transparent hover:border-border focus:border-amber-500/50 rounded px-1.5 py-1 text-right font-mono text-foreground focus:outline-none" /></td>
                        <td className="px-4 py-1.5 text-right font-mono text-muted">{fmt2(kg * bp.rate)}</td>
                        <td className="px-2 py-1.5 text-center"><button onClick={() => removeBp(i)} className="p-0.5 text-muted hover:text-red-400 cursor-pointer"><Trash2 className="w-4 h-4" /></button></td>
                      </tr>
                    );
                  })}
                  {draft.byproducts.length === 0 && <tr><td colSpan={5} className="px-4 py-4 text-center text-muted">No by-products yet. Click &quot;Add by-product&quot;.</td></tr>}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border font-semibold">
                    <td className="px-4 py-1.5 text-foreground">Total</td>
                    <td className={`px-4 py-1.5 text-right font-mono ${totalBpPct > 100 ? "text-red-400" : "text-amber-600"}`}>{fmt2(totalBpPct)}%</td>
                    <td></td>
                    <td className="px-4 py-1.5 text-right font-mono text-muted">{fmt2(c.byproductCredit)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Right: live calculation */}
          <div className="bg-surface-light/30 rounded-2xl border border-border p-4 h-fit sticky top-16">
            <h4 className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-3">Costing (per PMT)</h4>
            <Row label="Raw input needed" val={`${fmt2(c.rawInput)} kg`} />
            <Row label="Raw cost" val={`PKR ${fmt2(c.rawCost)}`} />
            <Row label="By-product credit" val={`− PKR ${fmt2(c.byproductCredit)}`} color="text-green-500" />
            <Row label="Net head cost" val={`PKR ${fmt2(c.netHead)}`} />
            <Row label="Net head / kg" val={`PKR ${fmt2(c.netHeadPerKg)}`} />
            <Row label="Milling & charges / kg" val={`PKR ${fmt2(c.chargePerKg)}`} />
            <Row label="Total cost / kg" val={`PKR ${fmt2(c.totalPerKg)}`} bold />
            <div className="h-2" />
            <Row label="USD total (÷ FC rate)" val={`$ ${fmt2(c.usdTotal)}`} />
            <Row label={`Finance charges (${fmt2(c.financePct)}%)`} val={`$ ${fmt2(c.bankCharges)}`} />
            <Row label="Profit + packaging" val={`$ ${fmt2(settings.profit + settings.packagingMaterial)}`} />
            <div className="flex items-center justify-between pt-3 mt-1 border-t border-border">
              <div><p className="text-base font-bold text-foreground">FOB / PMT</p><p className="text-xs text-muted">freight added at CNF quotation</p></div>
              <span className="text-2xl font-bold text-amber-600">$ {fmt2(c.fobPerPmt)}</span>
            </div>
            <p className="text-xs text-muted mt-3">FC rate, finance %, profit &amp; packaging are shared — edit in Master Prices → Cost Settings.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════ Settings form */
function SettingsForm({ settings, onClose, onSave }: { settings: RiceSettings; onClose: () => void; onSave: (s: RiceSettings) => void }) {
  const [d, setD] = useState<RiceSettings>({ ...settings });
  const upd = (k: keyof RiceSettings, v: number) => setD(s => ({ ...s, [k]: v }));
  const fields: [keyof RiceSettings, string][] = [
    ["fcRate", "FC Rate (PKR→USD)"], ["whtPct", "W.H.T %"], ["servicePct", "Service Charges %"],
    ["edsPct", "EDS %"], ["courierPct", "Courier %"], ["interestPct", "Interest %"],
    ["profit", "Profit (USD/shipment)"], ["packagingMaterial", "Packaging Material (USD)"],
    ["bagDollarRate", "Bag Dollar Rate (PKR)"], ["bagOverheadPct", "Bag Overhead %"],
  ];
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface rounded-2xl border border-border w-full max-w-lg p-5">
        <div className="flex items-center justify-between mb-4"><h3 className="text-base font-semibold text-foreground">Rice Cost Settings</h3><button onClick={onClose} className="p-1.5 text-muted hover:text-foreground cursor-pointer"><X className="w-4 h-4" /></button></div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {fields.map(([k, l]) => (
            <Field key={k} label={l}><input type="number" step="0.01" value={d[k]} onChange={e => upd(k, parseFloat(e.target.value) || 0)} className={inp} /></Field>
          ))}
        </div>
        <p className="text-[10px] text-muted mt-3">W.H.T + Service + EDS + Courier + Interest are summed and applied as a % of the USD total (finance charges).</p>
        <div className="flex justify-end gap-2 mt-4"><button onClick={onClose} className="px-4 py-2 text-sm text-muted hover:text-foreground cursor-pointer">Cancel</button><button onClick={() => onSave(d)} className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-500/80 text-white text-sm font-semibold rounded-lg cursor-pointer"><Save className="w-3.5 h-3.5" /> Save</button></div>
      </div>
    </div>
  );
}

/* ═══════════ Brand form */
function BrandForm({ brand, onClose, onSave }: { brand: RiceBrand | null; onClose: () => void; onSave: (b: RiceBrand) => void }) {
  const [d, setD] = useState<RiceBrand>(brand ?? { id: genId(), name: "", address: "", city: "", country: "", logoUrl: "", createdAt: "", contactPerson: "", website: "", email: "" });
  const [uploading, setUploading] = useState(false);
  const upd = (k: keyof RiceBrand, v: string) => setD(s => ({ ...s, [k]: v }));
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setUploading(true);
    try { const url = await uploadImage(f); if (url) upd("logoUrl", url); } finally { setUploading(false); }
  }
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface rounded-2xl border border-border w-full max-w-lg p-5">
        <div className="flex items-center justify-between mb-4"><h3 className="text-sm font-semibold text-foreground">{brand ? "Edit" : "New"} Brand</h3><button onClick={onClose} className="p-1.5 text-muted hover:text-foreground cursor-pointer"><X className="w-4 h-4" /></button></div>
        <div className="grid grid-cols-2 gap-3">
          <Field className="col-span-2" label="Brand Name"><input value={d.name} onChange={e => upd("name", e.target.value)} className={inp} /></Field>
          <Field label="City"><input value={d.city} onChange={e => upd("city", e.target.value)} className={inp} /></Field>
          <Field label="Country"><input value={d.country} onChange={e => upd("country", e.target.value)} className={inp} /></Field>
          <Field className="col-span-2" label="Address"><input value={d.address} onChange={e => upd("address", e.target.value)} className={inp} /></Field>
          <Field label="Contact Person"><input value={d.contactPerson} onChange={e => upd("contactPerson", e.target.value)} className={inp} /></Field>
          <Field label="Website"><input value={d.website} onChange={e => upd("website", e.target.value)} className={inp} /></Field>
          <Field label="Email"><input value={d.email} onChange={e => upd("email", e.target.value)} className={inp} /></Field>
          <Field label="Logo">
            <label className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 border border-border rounded-lg cursor-pointer text-muted hover:text-foreground hover:border-amber-500/40">
              <Upload className="w-3 h-3" /> {uploading ? "…" : d.logoUrl ? "Change" : "Upload"}
              <input type="file" accept="image/*" onChange={onFile} className="hidden" />
            </label>
          </Field>
        </div>
        <div className="flex justify-end gap-2 mt-4"><button onClick={onClose} className="px-4 py-2 text-sm text-muted hover:text-foreground cursor-pointer">Cancel</button><button onClick={() => onSave(d)} disabled={!d.name.trim()} className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-500/80 disabled:opacity-40 text-white text-sm font-semibold rounded-lg cursor-pointer"><Save className="w-3.5 h-3.5" /> Save</button></div>
      </div>
    </div>
  );
}

/* ═══════════ Mockup Builder */
function MockupBuilder({ mockups, products, bags, onSave, onDelete }: {
  mockups: RiceMockup[]; products: RiceProduct[]; bags: RiceBag[];
  onSave: (m: RiceMockup) => void; onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState<RiceMockup | null>(null);

  return (
    <div className="bg-surface rounded-2xl border border-border overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div>
          <h3 className="text-xs font-semibold text-amber-600 uppercase tracking-wide">Mockup Builder</h3>
          <p className="text-[10px] text-muted mt-0.5">Bag images linked to products &amp; packaging. Used as visual options when building CNF/FOB quotes.</p>
        </div>
        <button onClick={() => setEditing({ id: genId(), name: "", imageUrl: "", productIds: [], bagIds: [], sortOrder: mockups.length })}
          className="flex items-center gap-1 text-xs px-3 py-1.5 bg-amber-500 hover:bg-amber-500/80 text-white rounded-lg cursor-pointer"><Plus className="w-3 h-3" /> Add mockup</button>
      </div>

      {mockups.length === 0 && !editing && (
        <div className="px-4 py-8 text-center text-muted text-sm">No mockups yet. Click &quot;Add mockup&quot; to create one.</div>
      )}

      {mockups.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
          {mockups.map(m => (
            <div key={m.id} className="bg-background rounded-xl border border-border overflow-hidden">
              {m.imageUrl ? (
                <img src={m.imageUrl} alt={m.name} className="w-full h-40 object-cover" />
              ) : (
                <div className="w-full h-40 bg-amber-500/5 flex items-center justify-center"><Package className="w-12 h-12 text-amber-500/20" /></div>
              )}
              <div className="p-3 space-y-2">
                <p className="text-sm font-bold text-foreground">{m.name || "Untitled"}</p>
                {m.productIds.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {m.productIds.map(pid => {
                      const p = products.find(x => x.id === pid);
                      return p ? <span key={pid} className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 font-semibold">{p.name}</span> : null;
                    })}
                  </div>
                )}
                {m.bagIds.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {m.bagIds.map(bid => {
                      const b = bags.find(x => x.id === bid);
                      return b ? <span key={bid} className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-500 font-semibold">{b.type} {b.sizeLabel}</span> : null;
                    })}
                  </div>
                )}
                <div className="flex items-center justify-end gap-1 pt-1 border-t border-border/50">
                  <button onClick={() => setEditing({ ...m })} className="p-1 text-muted hover:text-amber-500 cursor-pointer"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => onDelete(m.id)} className="p-1 text-muted hover:text-red-400 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && <MockupForm mockup={editing} products={products} bags={bags} onClose={() => setEditing(null)}
        onSave={m => { onSave(m); setEditing(null); }} />}
    </div>
  );
}

/* ═══════════ Mockup form modal */
function MockupForm({ mockup, products, bags, onClose, onSave }: {
  mockup: RiceMockup; products: RiceProduct[]; bags: RiceBag[];
  onClose: () => void; onSave: (m: RiceMockup) => void;
}) {
  const [d, setD] = useState<RiceMockup>({ ...mockup, productIds: [...mockup.productIds], bagIds: [...mockup.bagIds] });
  const [uploading, setUploading] = useState(false);

  const toggleProduct = (id: string) => setD(prev => ({
    ...prev,
    productIds: prev.productIds.includes(id) ? prev.productIds.filter(x => x !== id) : [...prev.productIds, id],
  }));
  const toggleBag = (id: string) => setD(prev => ({
    ...prev,
    bagIds: prev.bagIds.includes(id) ? prev.bagIds.filter(x => x !== id) : [...prev.bagIds, id],
  }));

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setUploading(true);
    try { const url = await uploadImage(f); setD(prev => ({ ...prev, imageUrl: url })); } catch { /* */ }
    setUploading(false);
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface rounded-2xl border border-border w-full max-w-2xl max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-surface z-10">
          <h3 className="text-base font-semibold text-foreground">{mockup.name ? "Edit" : "New"} Mockup</h3>
          <div className="flex items-center gap-2">
            <button onClick={() => onSave(d)} disabled={!d.name.trim()} className="flex items-center gap-1.5 text-sm px-4 py-2 bg-amber-500 hover:bg-amber-500/80 disabled:opacity-40 text-white rounded-lg cursor-pointer"><Save className="w-4 h-4" /> Save</button>
            <button onClick={onClose} className="p-1.5 text-muted hover:text-foreground cursor-pointer"><X className="w-4 h-4" /></button>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* Name */}
          <div>
            <label className="text-xs text-muted uppercase tracking-wide block mb-1">Mockup Name</label>
            <input value={d.name} onChange={e => setD(prev => ({ ...prev, name: e.target.value }))}
              placeholder="e.g. 1121 Sella PP 40kg Bag"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-amber-500/50" />
          </div>

          {/* Image */}
          <div>
            <label className="text-xs text-muted uppercase tracking-wide block mb-1">Bag Image</label>
            <div className="flex items-start gap-4">
              {d.imageUrl ? (
                <img src={d.imageUrl} alt={d.name} className="w-32 h-32 rounded-xl object-cover border border-border" />
              ) : (
                <div className="w-32 h-32 rounded-xl border border-dashed border-border bg-surface-light/30 flex items-center justify-center">
                  <Package className="w-8 h-8 text-muted/30" />
                </div>
              )}
              <div className="space-y-2">
                <label className="flex items-center gap-1.5 text-xs px-3 py-2 border border-border rounded-lg cursor-pointer text-muted hover:text-foreground hover:border-amber-500/40">
                  <Upload className="w-3.5 h-3.5" /> {uploading ? "Uploading…" : d.imageUrl ? "Change image" : "Upload image"}
                  <input type="file" accept="image/*" onChange={onFile} className="hidden" />
                </label>
                {d.imageUrl && (
                  <button onClick={() => setD(prev => ({ ...prev, imageUrl: "" }))} className="text-[10px] text-red-400 hover:text-red-500 cursor-pointer">Remove image</button>
                )}
              </div>
            </div>
          </div>

          {/* Products multi-select */}
          <div>
            <label className="text-xs text-muted uppercase tracking-wide block mb-2">Products (select which rice products this mockup applies to)</label>
            <div className="bg-background rounded-xl border border-border p-3 max-h-48 overflow-y-auto space-y-1">
              {products.length === 0 && <p className="text-xs text-muted text-center py-2">No rice products created yet.</p>}
              {products.map(p => (
                <label key={p.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-surface cursor-pointer">
                  <input type="checkbox" checked={d.productIds.includes(p.id)} onChange={() => toggleProduct(p.id)}
                    className="w-3.5 h-3.5 rounded accent-amber-500" />
                  <span className="text-xs text-foreground">{p.name}</span>
                  {p.category && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-500 font-semibold">{p.category}</span>}
                </label>
              ))}
            </div>
          </div>

          {/* Bags multi-select */}
          <div>
            <label className="text-xs text-muted uppercase tracking-wide block mb-2">Bag Packaging (select which bag types this mockup applies to)</label>
            <div className="bg-background rounded-xl border border-border p-3 max-h-48 overflow-y-auto space-y-1">
              {bags.length === 0 && <p className="text-xs text-muted text-center py-2">No bag packaging created yet.</p>}
              {bags.map(b => (
                <label key={b.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-surface cursor-pointer">
                  <input type="checkbox" checked={d.bagIds.includes(b.id)} onChange={() => toggleBag(b.id)}
                    className="w-3.5 h-3.5 rounded accent-amber-500" />
                  <span className="text-xs text-foreground">{b.type} {b.sizeLabel}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════ small helpers */
const inp = "w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-amber-500/50";
function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="text-xs text-muted uppercase tracking-wide block mb-1">{label}</label>
      {children}
    </div>
  );
}
