"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useMemo } from "react";
import {
  ChevronLeft, Plus, Package, Search, Edit3, Trash2,
  Save, X, Loader2, ChevronDown, Check, AlertTriangle, Info,
} from "lucide-react";

type Product = {
  id: string; brand: string; product_name: string; packing_desc: string;
  length_in: number; width_in: number; height_in: number;
  max_20ft: number; max_40ft: number; max_40hc: number;
  net_weight_kg: number; pcs_per_carton: number; cbm_per_carton: number;
  sort_order: number; source_product_id: string | null; source_division: string | null;
};

type CatalogItem = {
  sourceProductId: string; name: string; category: string;
  brandId: string; division: string; divisionLabel: string;
};

type DimForm = {
  packing_desc: string; length_in: number; width_in: number; height_in: number;
  max_20ft: number; max_40ft: number; max_40hc: number;
  net_weight_kg: number; pcs_per_carton: number; sort_order: number;
};

export default function ProductMasterPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [brandFilter, setBrandFilter] = useState("ALL");

  // Edit (dimensions only — product identity is read-only)
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<DimForm | null>(null);
  const [saving, setSaving] = useState(false);

  // Catalog picker
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [showCatalog, setShowCatalog] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogDivision, setCatalogDivision] = useState("ALL");
  const [addingId, setAddingId] = useState<string | null>(null);

  async function load() {
    const r = await fetch("/api/supply-chain/products");
    const d = await r.json();
    setProducts(d.products ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const brands = useMemo(() => {
    const set = new Set(products.map(p => p.brand).filter(Boolean));
    return ["ALL", ...Array.from(set).sort()];
  }, [products]);

  const filtered = useMemo(() => {
    let list = products;
    if (brandFilter !== "ALL") list = list.filter(p => p.brand === brandFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(p => p.product_name.toLowerCase().includes(q) || p.packing_desc?.toLowerCase().includes(q));
    }
    return list;
  }, [products, brandFilter, search]);

  // Products missing carton specs (dimensions all 0) — need Hafeez to fill
  const needsSpecs = useMemo(() => products.filter(p => !p.length_in && !p.max_20ft).length, [products]);

  async function openCatalog() {
    setShowCatalog(true);
    setCatalogSearch("");
    setCatalogDivision("ALL");
    const r = await fetch("/api/supply-chain/catalog");
    const d = await r.json();
    setCatalog(d.catalog ?? []);
  }

  const linkedSourceIds = useMemo(() => new Set(products.map(p => p.source_product_id).filter(Boolean)), [products]);

  const divisions = useMemo(() => {
    const set = new Set(catalog.map(c => c.divisionLabel));
    return ["ALL", ...Array.from(set)];
  }, [catalog]);

  const filteredCatalog = useMemo(() => {
    let list = catalog;
    if (catalogDivision !== "ALL") list = list.filter(c => c.divisionLabel === catalogDivision);
    if (catalogSearch) {
      const q = catalogSearch.toLowerCase();
      list = list.filter(c => c.name.toLowerCase().includes(q) || c.category?.toLowerCase().includes(q));
    }
    return list;
  }, [catalog, catalogDivision, catalogSearch]);

  async function addFromCatalog(item: CatalogItem) {
    if (linkedSourceIds.has(item.sourceProductId)) return;
    setAddingId(item.sourceProductId);
    await fetch("/api/supply-chain/products", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "add-from-catalog",
        sourceProductId: item.sourceProductId,
        productName: item.name,
        brand: item.divisionLabel,
        sourceDivision: item.division,
      }),
    });
    setAddingId(null);
    await load();
  }

  function startEdit(p: Product) {
    setEditing(p);
    setForm({
      packing_desc: p.packing_desc, length_in: p.length_in, width_in: p.width_in, height_in: p.height_in,
      max_20ft: p.max_20ft, max_40ft: p.max_40ft, max_40hc: p.max_40hc,
      net_weight_kg: p.net_weight_kg, pcs_per_carton: p.pcs_per_carton, sort_order: p.sort_order,
    });
  }

  async function saveSpecs() {
    if (!editing || !form) return;
    setSaving(true);
    await fetch("/api/supply-chain/products", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update", id: editing.id,
        packingDesc: form.packing_desc, lengthIn: form.length_in, widthIn: form.width_in, heightIn: form.height_in,
        max20ft: form.max_20ft, max40ft: form.max_40ft, max40hc: form.max_40hc,
        netWeightKg: form.net_weight_kg, pcsPerCarton: form.pcs_per_carton, sortOrder: form.sort_order,
      }),
    });
    setSaving(false);
    setEditing(null);
    setForm(null);
    load();
  }

  async function deleteProduct(id: string) {
    await fetch("/api/supply-chain/products", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });
    load();
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center" style={{ background: "#e8ecf1" }}><div className="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="min-h-screen" style={{ background: "#e8ecf1" }}>
      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push("/supply-chain")} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors cursor-pointer">
              <ChevronLeft className="w-4 h-4" /> Supply Chain
            </button>
            <div className="w-px h-5 bg-gray-300" />
            <div className="flex items-center gap-2">
              <Package className="w-5 h-5 text-teal-600" />
              <h1 className="text-lg font-bold text-gray-900">Product Master</h1>
              <span className="text-xs text-gray-400">{products.length} products</span>
            </div>
          </div>
          <button onClick={openCatalog} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 transition-colors cursor-pointer">
            <Plus className="w-4 h-4" /> Add from Product List
          </button>
        </div>

        {/* Info banner */}
        <div className="mb-4 flex items-start gap-2 px-4 py-2.5 rounded-lg bg-blue-500/[0.06] border border-blue-500/20 text-xs text-blue-700/90">
          <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-600" />
          <p>Products are created in the <span className="font-medium text-blue-800">Product List</span> (Foods &amp; Spices, Rice, etc.). Add them here, then fill the carton dimensions &amp; container capacities manually.
            {needsSpecs > 0 && <span className="text-amber-700"> {needsSpecs} product{needsSpecs > 1 ? "s" : ""} still need carton specs.</span>}
          </p>
        </div>

        {/* Filters */}
        <div className="flex gap-2 mb-4">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products..."
              className="w-full bg-white border border-gray-200/80 rounded-lg pl-9 pr-3 py-2 text-sm text-gray-900 placeholder-gray-600 focus:outline-none focus:border-emerald-500/50" />
          </div>
          <div className="relative">
            <select value={brandFilter} onChange={e => setBrandFilter(e.target.value)}
              className="bg-white border border-gray-200/80 rounded-lg px-3 py-2 text-sm text-gray-900 appearance-none pr-8 focus:outline-none cursor-pointer">
              {brands.map(b => <option key={b} value={b} className="bg-white">{b}</option>)}
            </select>
            <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
          </div>
        </div>

        {/* Edit dimensions form */}
        {editing && form && (
          <div className="mb-4 p-5 rounded-xl bg-white border border-emerald-500/20">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-gray-900 font-semibold text-sm">Carton Specs</h3>
              <button onClick={() => { setEditing(null); setForm(null); }} className="p-1 rounded hover:bg-gray-100 text-gray-500 cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-xs text-gray-500 mb-4">
              <span className="text-gray-900 font-medium">{editing.product_name}</span>
              {editing.source_division && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600">{editing.source_division === "rice" ? "Rice" : editing.source_division === "foods_spices" ? "Foods & Spices" : editing.source_division}</span>}
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
              <div className="col-span-2">
                <label className="text-xs text-gray-500 mb-1 block">Packing Description</label>
                <input value={form.packing_desc} onChange={e => setForm(f => f && ({ ...f, packing_desc: e.target.value }))} placeholder="e.g. 150G X 48 POUCH IN CARTON" className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 placeholder-gray-700 focus:outline-none focus:border-emerald-500/50" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Pcs/Carton</label>
                <input type="number" value={form.pcs_per_carton || ""} onChange={e => setForm(f => f && ({ ...f, pcs_per_carton: Number(e.target.value) }))} className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-emerald-500/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Net Weight/Carton (kg)</label>
                <input type="number" step="0.01" value={form.net_weight_kg || ""} onChange={e => setForm(f => f && ({ ...f, net_weight_kg: Number(e.target.value) }))} className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-emerald-500/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
              </div>
            </div>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-4">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">L (in)</label>
                <input type="number" step="0.01" value={form.length_in || ""} onChange={e => setForm(f => f && ({ ...f, length_in: Number(e.target.value) }))} className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-emerald-500/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">W (in)</label>
                <input type="number" step="0.01" value={form.width_in || ""} onChange={e => setForm(f => f && ({ ...f, width_in: Number(e.target.value) }))} className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-emerald-500/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">H (in)</label>
                <input type="number" step="0.01" value={form.height_in || ""} onChange={e => setForm(f => f && ({ ...f, height_in: Number(e.target.value) }))} className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-emerald-500/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Max 20FT</label>
                <input type="number" value={form.max_20ft || ""} onChange={e => setForm(f => f && ({ ...f, max_20ft: Number(e.target.value) }))} className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-emerald-500/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Max 40FT</label>
                <input type="number" value={form.max_40ft || ""} onChange={e => setForm(f => f && ({ ...f, max_40ft: Number(e.target.value) }))} className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-emerald-500/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Max 40HC</label>
                <input type="number" value={form.max_40hc || ""} onChange={e => setForm(f => f && ({ ...f, max_40hc: Number(e.target.value) }))} className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-emerald-500/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => { setEditing(null); setForm(null); }} className="px-4 py-1.5 rounded-lg text-sm text-gray-500 hover:text-gray-900 cursor-pointer">Cancel</button>
              <button onClick={saveSpecs} disabled={saving} className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-40 cursor-pointer">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Specs
              </button>
            </div>
          </div>
        )}

        {/* Product Table */}
        <div className="rounded-xl bg-white/70 border border-gray-200/80 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200/70">
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">#</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">Division</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">Product</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">Packing</th>
                  <th className="text-center px-4 py-3 text-gray-500 font-medium">L</th>
                  <th className="text-center px-4 py-3 text-gray-500 font-medium">W</th>
                  <th className="text-center px-4 py-3 text-gray-500 font-medium">H</th>
                  <th className="text-center px-4 py-3 text-gray-500 font-medium">20FT</th>
                  <th className="text-center px-4 py-3 text-gray-500 font-medium">40FT</th>
                  <th className="text-center px-4 py-3 text-gray-500 font-medium">40HC</th>
                  <th className="w-16"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p, i) => {
                  const missing = !p.length_in && !p.max_20ft;
                  return (
                    <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50/80">
                      <td className="px-4 py-2.5 text-gray-400 text-xs">{i + 1}</td>
                      <td className="px-4 py-2.5"><span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600">{p.brand || "—"}</span></td>
                      <td className="px-4 py-2.5 text-gray-900 text-xs font-medium">
                        {p.product_name}
                        {missing && <span className="ml-2 inline-flex items-center gap-0.5 text-[10px] text-amber-600"><AlertTriangle className="w-3 h-3" /> needs specs</span>}
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 text-xs">{p.packing_desc || "—"}</td>
                      <td className="px-4 py-2.5 text-center text-gray-500 text-xs">{p.length_in || "—"}</td>
                      <td className="px-4 py-2.5 text-center text-gray-500 text-xs">{p.width_in || "—"}</td>
                      <td className="px-4 py-2.5 text-center text-gray-500 text-xs">{p.height_in || "—"}</td>
                      <td className="px-4 py-2.5 text-center text-emerald-600 text-xs font-medium">{p.max_20ft || "—"}</td>
                      <td className="px-4 py-2.5 text-center text-blue-600 text-xs font-medium">{p.max_40ft || "—"}</td>
                      <td className="px-4 py-2.5 text-center text-violet-600 text-xs font-medium">{p.max_40hc || "—"}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1">
                          <button onClick={() => startEdit(p)} className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-900 cursor-pointer" title="Fill/edit carton specs"><Edit3 className="w-3.5 h-3.5" /></button>
                          <button onClick={() => deleteProduct(p.id)} className="p-1 rounded hover:bg-red-500/10 text-gray-400 hover:text-red-600 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && <tr><td colSpan={11} className="px-4 py-8 text-center text-gray-400 text-sm">No products yet. Click &quot;Add from Product List&quot; to begin.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Catalog Picker Modal */}
      {showCatalog && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6" onClick={() => setShowCatalog(false)}>
          <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200/70">
              <div>
                <h3 className="text-gray-900 font-semibold">Add from Product List</h3>
                <p className="text-xs text-gray-500 mt-0.5">Only products created in the Product List appear here</p>
              </div>
              <button onClick={() => setShowCatalog(false)} className="p-1 rounded hover:bg-gray-100 text-gray-500 cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-5 py-3 flex gap-2 border-b border-gray-200/70">
              <div className="flex-1 relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={catalogSearch} onChange={e => setCatalogSearch(e.target.value)} placeholder="Search Product List..." autoFocus
                  className="w-full bg-white border border-gray-200/80 rounded-lg pl-9 pr-3 py-2 text-sm text-gray-900 placeholder-gray-600 focus:outline-none focus:border-emerald-500/50" />
              </div>
              <div className="relative">
                <select value={catalogDivision} onChange={e => setCatalogDivision(e.target.value)}
                  className="bg-white border border-gray-200/80 rounded-lg px-3 py-2 text-sm text-gray-900 appearance-none pr-8 focus:outline-none cursor-pointer">
                  {divisions.map(d => <option key={d} value={d} className="bg-white">{d}</option>)}
                </select>
                <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {filteredCatalog.map(item => {
                const already = linkedSourceIds.has(item.sourceProductId);
                const isAdding = addingId === item.sourceProductId;
                return (
                  <button key={item.sourceProductId} onClick={() => !already && addFromCatalog(item)} disabled={already || isAdding}
                    className={`w-full flex items-center gap-3 px-5 py-3 border-b border-gray-100 text-left transition-colors ${already ? "opacity-40 cursor-default" : "hover:bg-gray-50 cursor-pointer"}`}>
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                      <Package className="w-4 h-4 text-emerald-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-gray-900 text-sm font-medium truncate">{item.name}</div>
                      <div className="text-xs text-gray-500 truncate">{item.divisionLabel}{item.category && ` · ${item.category}`}</div>
                    </div>
                    {isAdding && <Loader2 className="w-4 h-4 animate-spin text-emerald-600 shrink-0" />}
                    {already && !isAdding && <Check className="w-4 h-4 text-emerald-600 shrink-0" />}
                  </button>
                );
              })}
              {filteredCatalog.length === 0 && (
                <div className="px-5 py-10 text-center text-gray-400 text-sm">
                  {catalog.length === 0 ? "No products in the Product List yet. Create products there first." : "No products match your search."}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
