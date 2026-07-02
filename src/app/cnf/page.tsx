"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Plus, Ship, Anchor, Search, Filter, Archive,
  ArchiveRestore, Share2, ChevronDown, ChevronUp, Trash2,
  Edit2, Check, X, Loader2, Copy,
} from "lucide-react";
import { calcCost, type CostMaterial, type CostProduct, type CostRecipeItem, type CostSettings } from "@/lib/costing";

type FreightCard = {
  id: string; destination: string; country: string;
  freightPerCarton: number; currency: string; updatedAt: string;
};

type QuoteProduct = {
  productId: string; productName: string; sku: string; specs: string; packagingDesc: string;
  qty: number; fobPerCarton: number; freightPerCarton: number; cnfPerCarton: number;
};

type Quote = {
  id: string; quoteNo: string; clientName: string; clientContact: string;
  destination: string; country: string; generatedAt: string; validTill: string;
  status: string; createdBy: string; brandKafi: boolean; brandEssence: boolean;
  notes: string; productsSnapshot: QuoteProduct[];
};

const PIN_MAP: Record<string, string> = {
  "1122": "Accountant", "5678": "Moiz", "4444": "Hamza", "786786": "Admin",
};

function fmtDate(iso: string) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return iso; }
}

function fmtUSD(n: number) {
  return "$" + n.toFixed(2);
}

function defaultValidTill() {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
}

// ─── New Quote Modal ────────────────────────────────────────────────────────

type NewQuoteModalProps = {
  freightCards: FreightCard[];
  catalogProducts: CostProduct[];
  catalogMaterials: CostMaterial[];
  catalogRecipes: Map<string, CostRecipeItem[]>;
  catalogSettings: CostSettings;
  createdBy: string;
  onClose: () => void;
  onCreated: () => void;
};

function NewQuoteModal({ freightCards, catalogProducts, catalogMaterials, catalogRecipes, catalogSettings, createdBy, onClose, onCreated }: NewQuoteModalProps) {
  const [step, setStep] = useState(1);
  const [clientName, setClientName] = useState("");
  const [clientContact, setClientContact] = useState("");
  const [destination, setDestination] = useState("");
  const [country, setCountry] = useState("");
  const [freightPerCarton, setFreightPerCarton] = useState(0);
  const [validTill, setValidTill] = useState(defaultValidTill());
  const [notes, setNotes] = useState("");
  const [brandKafi, setBrandKafi] = useState(true);
  const [brandEssence, setBrandEssence] = useState(false);
  const [products, setProducts] = useState<QuoteProduct[]>([
    { productId: "", productName: "", sku: "", specs: "", packagingDesc: "", qty: 1, fobPerCarton: 0, freightPerCarton: 0, cnfPerCarton: 0 },
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const sortedProducts = [...catalogProducts].sort((a, b) => a.name.localeCompare(b.name));

  function fobFor(productId: string, qty: number): number {
    const product = catalogProducts.find(p => p.id === productId);
    if (!product) return 0;
    const recipe = catalogRecipes.get(productId) ?? [];
    return calcCost(recipe, catalogMaterials, product, catalogSettings, qty || 1).fobPerCarton;
  }

  // Master Freight Card stores the cost of one FULL CONTAINER to a destination.
  // Each product's own Freight/Carton is that container cost divided by the
  // product's FCL Container Qty (set in Product List) — different products pack
  // differently into a container, so the per-carton freight differs per product.
  function freightFor(productId: string, containerRate: number): number {
    const product = catalogProducts.find(p => p.id === productId);
    if (!product) return 0;
    return Math.round((containerRate / (product.fclQty || 1500)) * 100) / 100;
  }

  function pickDestination(card: FreightCard) {
    setDestination(card.destination);
    setCountry(card.country);
    setFreightPerCarton(card.freightPerCarton);
    // Recompute each product's own per-carton freight using its own FCL Container Qty
    setProducts(prev => prev.map(p => {
      const freight = p.productId ? freightFor(p.productId, card.freightPerCarton) : 0;
      return { ...p, freightPerCarton: freight, cnfPerCarton: p.fobPerCarton + freight };
    }));
  }

  function updateProduct(i: number, field: keyof QuoteProduct, value: string | number) {
    setProducts(prev => {
      const next = [...prev];
      const p = { ...next[i], [field]: value };
      if (field === "productId") {
        const product = catalogProducts.find(cp => cp.id === value);
        p.productName = product?.name ?? "";
        p.sku = product?.sku ?? "";
        p.specs = product?.specs ?? "";
        p.packagingDesc = product?.packagingDesc ?? "";
        p.fobPerCarton = fobFor(String(value), p.qty);
        p.freightPerCarton = freightFor(String(value), freightPerCarton);
        p.cnfPerCarton = p.fobPerCarton + p.freightPerCarton;
      } else if (field === "qty") {
        const qty = Number(value) || 1;
        p.fobPerCarton = p.productId ? fobFor(p.productId, qty) : p.fobPerCarton;
        p.cnfPerCarton = p.fobPerCarton + p.freightPerCarton;
      } else if (field === "freightPerCarton") {
        p.freightPerCarton = Math.max(0, Number(value));
        p.cnfPerCarton = p.fobPerCarton + p.freightPerCarton;
      }
      next[i] = p;
      return next;
    });
  }

  function addProduct() {
    setProducts(prev => [...prev, {
      productId: "", productName: "", sku: "", specs: "", packagingDesc: "",
      qty: 1, fobPerCarton: 0, freightPerCarton: 0, cnfPerCarton: 0,
    }]);
  }

  function removeProduct(i: number) {
    setProducts(prev => prev.filter((_, idx) => idx !== i));
  }

  async function generate() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/cnf/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          quote: {
            clientName, clientContact, destination, country, validTill, notes,
            brandKafi, brandEssence, createdBy,
            productsSnapshot: products.filter(p => p.productName.trim()),
          },
        }),
      });
      const data = await res.json();
      if (data.saved) { onCreated(); onClose(); }
      else setError(data.error ?? "Failed to save");
    } catch (e) {
      setError(String(e));
    }
    setSaving(false);
  }

  const totalCNF = products.reduce((s, p) => s + p.cnfPerCarton * p.qty, 0);
  const validProducts = products.filter(p => p.productName.trim()).length;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-5 border-b border-gray-100">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">New CNF Quotation</h2>
            <p className="text-sm text-gray-400 mt-0.5">Step {step} of 3</p>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 cursor-pointer"><X className="w-5 h-5" /></button>
        </div>

        {/* Steps indicator */}
        <div className="flex px-8 pt-5 pb-3 gap-3">
          {["Client & Destination", "Products", "Review & Generate"].map((label, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${step > i + 1 ? "bg-green-500 text-white" : step === i + 1 ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-400"}`}>
                {step > i + 1 ? <Check className="w-4 h-4" /> : i + 1}
              </div>
              <span className={`text-xs text-center leading-tight ${step === i + 1 ? "text-blue-600 font-medium" : "text-gray-400"}`}>{label}</span>
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-8 py-5 text-base">

          {/* Step 1 */}
          {step === 1 && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1.5">Client Name *</label>
                  <input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="e.g. Al Futtaim Group"
                    className="w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-base text-gray-900 focus:outline-none focus:border-blue-400" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1.5">Contact (optional)</label>
                  <input value={clientContact} onChange={e => setClientContact(e.target.value)} placeholder="Phone / email"
                    className="w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-base text-gray-900 focus:outline-none focus:border-blue-400" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2.5">Destination (from Master Freight Card)</label>
                {freightCards.length === 0 ? (
                  <p className="text-sm text-gray-400 italic">No freight cards yet — add them in the Master Freight section below, or enter manually.</p>
                ) : (
                  <select
                    value={freightCards.find(c => c.destination === destination)?.id ?? ""}
                    onChange={e => { const card = freightCards.find(c => c.id === e.target.value); if (card) pickDestination(card); }}
                    className="w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-base text-gray-900 focus:outline-none focus:border-blue-400 bg-white cursor-pointer">
                    <option value="">— Choose a destination —</option>
                    {freightCards.map(c => (
                      <option key={c.id} value={c.id}>{c.destination}, {c.country} — ${c.freightPerCarton}/container</option>
                    ))}
                  </select>
                )}
                <div className="mt-4 grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Port / Destination</label>
                    <input value={destination} onChange={e => setDestination(e.target.value)} placeholder="e.g. JEBEL ALI PORT"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-400" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Country</label>
                    <input value={country} onChange={e => setCountry(e.target.value)} placeholder="UAE"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-400" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Freight/Container (USD)</label>
                    <input type="number" min={0} value={freightPerCarton} onChange={e => {
                      const v = Math.max(0, parseFloat(e.target.value) || 0);
                      setFreightPerCarton(v);
                      setProducts(prev => prev.map(p => {
                        const freight = p.productId ? freightFor(p.productId, v) : 0;
                        return { ...p, freightPerCarton: freight, cnfPerCarton: p.fobPerCarton + freight };
                      }));
                    }}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-400" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1.5">Valid Until</label>
                  <input type="date" value={validTill} onChange={e => setValidTill(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-base text-gray-900 focus:outline-none focus:border-blue-400" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1.5">Notes (optional)</label>
                  <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Subject to LC confirmation"
                    className="w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-base text-gray-900 focus:outline-none focus:border-blue-400" />
                </div>
              </div>
            </div>
          )}

          {/* Step 2 */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500">Freight: <span className="font-semibold text-gray-800">${freightPerCarton}/container</span> to <span className="font-semibold text-gray-800">{destination || "—"}</span> — per-carton freight is calculated automatically per product below</p>
                <button onClick={addProduct} className="flex items-center gap-1.5 text-sm bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 cursor-pointer transition-colors">
                  <Plus className="w-4 h-4" /> Add Product
                </button>
              </div>

              {sortedProducts.length === 0 && (
                <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                  No products found in the Product List. Add products (with recipes) there first — CNF quotes pull FOB pricing directly from the Product List.
                </p>
              )}

              {products.map((p, i) => (
                <div key={i} className="border border-gray-200 rounded-xl p-4 space-y-3 bg-gray-50/50">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Product {i + 1}</span>
                    {products.length > 1 && (
                      <button onClick={() => removeProduct(i)} className="text-red-400 hover:text-red-600 cursor-pointer"><X className="w-4 h-4" /></button>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Select Product (from Product List) *</label>
                    <select value={p.productId} onChange={e => updateProduct(i, "productId", e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-400 bg-white cursor-pointer">
                      <option value="">— Choose a product —</option>
                      {sortedProducts.map(cp => (
                        <option key={cp.id} value={cp.id}>{cp.name}{cp.sku ? ` (${cp.sku})` : ""}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Specs / Description <span className="text-gray-400">(auto-filled from Product List, editable)</span></label>
                      <input value={p.specs} onChange={e => updateProduct(i, "specs", e.target.value)} placeholder="e.g. 24 PCS × 1kg — add manually if not on file"
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-400 bg-white" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Packaging <span className="text-gray-400">(auto-filled from Product List, editable)</span></label>
                      <input value={p.packagingDesc} onChange={e => updateProduct(i, "packagingDesc", e.target.value)} placeholder="e.g. 24 pcs × 1 Carton — add manually if not on file"
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-400 bg-white" />
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Qty (Cartons)</label>
                      <div className="w-full border border-gray-200 bg-gray-100 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 text-right">
                        1
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">FOB/Carton ($) — auto</label>
                      <div className="w-full border border-gray-200 bg-gray-100 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 text-right">
                        {p.productId ? fmtUSD(p.fobPerCarton) : "—"}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Freight/Carton ($) — auto</label>
                      <div className="w-full border border-gray-200 bg-gray-100 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 text-right">
                        {fmtUSD(p.freightPerCarton)}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">CNF/Carton ($)</label>
                      <div className="w-full border border-blue-200 bg-blue-50 rounded-lg px-3 py-2 text-sm font-semibold text-blue-700 text-right">
                        {fmtUSD(p.cnfPerCarton)}
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end text-xs text-gray-500">
                    Total: <span className="ml-1 font-semibold text-gray-800">{fmtUSD(p.cnfPerCarton * p.qty)}</span>
                  </div>
                </div>
              ))}

              {products.length > 0 && (
                <div className="flex justify-end border-t border-gray-200 pt-4">
                  <div className="text-base text-gray-600">Grand Total CNF: <span className="font-bold text-blue-700 text-xl ml-2">{fmtUSD(totalCNF)}</span></div>
                </div>
              )}
            </div>
          )}

          {/* Step 3 */}
          {step === 3 && (
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2.5">Brand on Quote</label>
                <div className="flex gap-3">
                  {[{ key: "brandKafi", label: "Kafi Commodities", val: brandKafi, set: setBrandKafi },
                    { key: "brandEssence", label: "Essence", val: brandEssence, set: setBrandEssence }].map(b => (
                    <button key={b.key} onClick={() => b.set(!b.val)}
                      className={`flex items-center gap-2 border rounded-xl px-5 py-3 text-base cursor-pointer transition-all ${b.val ? "border-blue-500 bg-blue-50 text-blue-700 font-medium" : "border-gray-200 text-gray-500 hover:border-gray-300"}`}>
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${b.val ? "border-blue-500 bg-blue-500" : "border-gray-300"}`}>
                        {b.val && <Check className="w-3 h-3 text-white" />}
                      </div>
                      {b.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Preview summary */}
              <div className="border border-gray-200 rounded-xl p-5 bg-gray-50 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Quote Summary</span>
                  <span className="text-sm text-gray-400">Auto-numbered on save</span>
                </div>
                <div className="grid grid-cols-2 gap-y-2.5 text-base">
                  <span className="text-gray-500">Client</span><span className="font-medium text-gray-900">{clientName || "—"}</span>
                  <span className="text-gray-500">Destination</span><span className="font-medium text-gray-900">{destination || "—"}{country ? `, ${country}` : ""}</span>
                  <span className="text-gray-500">Freight/Container</span><span className="font-medium text-gray-900">${freightPerCarton}</span>
                  <span className="text-gray-500">Valid Until</span><span className="font-medium text-gray-900">{validTill ? fmtDate(validTill + "T00:00:00") : "—"}</span>
                  <span className="text-gray-500">Products</span><span className="font-medium text-gray-900">{validProducts} item{validProducts !== 1 ? "s" : ""}</span>
                  <span className="text-gray-500">Grand Total CNF</span><span className="font-bold text-blue-700 text-lg">{fmtUSD(totalCNF)}</span>
                </div>
                {notes && <p className="text-sm text-gray-500 italic border-t border-gray-200 pt-2.5">{notes}</p>}
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-3.5">
                <p className="text-sm text-amber-700 font-medium">Once generated, this quote is immutable and cannot be edited.</p>
                <p className="text-xs text-amber-600 mt-1">A unique quote number will be assigned automatically.</p>
              </div>

              {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">{error}</p>}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-8 py-5 border-t border-gray-100">
          <button onClick={() => step > 1 ? setStep(s => s - 1) : onClose()}
            className="px-4 py-2.5 text-base text-gray-500 hover:text-gray-700 cursor-pointer transition-colors">
            {step === 1 ? "Cancel" : "← Back"}
          </button>
          <div className="flex gap-2">
            {step < 3 && (
              <button
                onClick={() => setStep(s => s + 1)}
                disabled={step === 1 && !clientName.trim()}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 text-white text-base font-medium rounded-lg cursor-pointer disabled:cursor-not-allowed transition-colors">
                Next →
              </button>
            )}
            {step === 3 && (
              <button onClick={generate} disabled={saving || validProducts === 0}
                className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 text-white text-base font-semibold rounded-lg cursor-pointer disabled:cursor-not-allowed transition-colors">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ship className="w-4 h-4" />}
                Generate Quote
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Master Freight Section ─────────────────────────────────────────────────

function MasterFreightSection({ cards, onUpdate }: { cards: FreightCard[]; onUpdate: (cards: FreightCard[]) => void }) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState<FreightCard[]>(cards);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setLocal(cards); }, [cards]);

  function addRow() {
    setLocal(prev => [...prev, { id: crypto.randomUUID(), destination: "", country: "", freightPerCarton: 0, currency: "USD", updatedAt: "" }]);
  }

  function updateRow(i: number, field: keyof FreightCard, value: string | number) {
    const v = field === "freightPerCarton" ? Math.max(0, Number(value)) : value;
    setLocal(prev => { const next = [...prev]; next[i] = { ...next[i], [field]: v }; return next; });
  }

  function removeRow(i: number) {
    setLocal(prev => prev.filter((_, idx) => idx !== i));
  }

  async function save() {
    setSaving(true);
    await fetch("/api/cnf/master-freight", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ freightCards: local.filter(c => c.destination.trim()) }),
    });
    onUpdate(local.filter(c => c.destination.trim()));
    setEditing(false);
    setSaving(false);
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <Anchor className="w-4 h-4 text-blue-500" />
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-gray-900">Master Freight Card</h3>
              <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">{cards.length} destinations</span>
            </div>
            <p className="text-[10px] text-gray-400 mt-0.5">Cost per full container — each product&apos;s per-carton freight is calculated automatically from this ÷ its FCL Container Qty</p>
          </div>
        </div>
        <div className="flex gap-2">
          {editing ? (
            <>
              <button onClick={() => { setLocal(cards); setEditing(false); }} className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 cursor-pointer">Cancel</button>
              <button onClick={addRow} className="flex items-center gap-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg cursor-pointer transition-colors">
                <Plus className="w-3 h-3" /> Add Row
              </button>
              <button onClick={save} disabled={saving} className="flex items-center gap-1 text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg cursor-pointer transition-colors">
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Save
              </button>
            </>
          ) : (
            <button onClick={() => setEditing(true)} className="flex items-center gap-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg cursor-pointer transition-colors">
              <Edit2 className="w-3 h-3" /> Edit
            </button>
          )}
        </div>
      </div>

      {local.length === 0 && !editing ? (
        <div className="px-5 py-8 text-center text-sm text-gray-400">
          No freight destinations yet. Click Edit to add destinations.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Destination / Port</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Country</th>
                <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Freight/Container (USD)</th>
                {editing && <th className="px-4 py-2.5 w-8" />}
              </tr>
            </thead>
            <tbody>
              {(editing ? local : cards).map((c, i) => (
                <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-2.5">
                    {editing ? (
                      <input value={c.destination} onChange={e => updateRow(i, "destination", e.target.value)} placeholder="e.g. JEBEL ALI PORT"
                        className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-blue-400" />
                    ) : (
                      <span className="font-medium text-gray-900">{c.destination}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {editing ? (
                      <input value={c.country} onChange={e => updateRow(i, "country", e.target.value)} placeholder="UAE"
                        className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-blue-400" />
                    ) : (
                      <span className="text-gray-600">{c.country}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {editing ? (
                      <input type="number" min={0} value={c.freightPerCarton} onChange={e => updateRow(i, "freightPerCarton", parseFloat(e.target.value) || 0)}
                        className="w-28 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 text-right focus:outline-none focus:border-blue-400 ml-auto block" />
                    ) : (
                      <span className="font-semibold text-blue-700">${c.freightPerCarton.toFixed(2)}</span>
                    )}
                  </td>
                  {editing && (
                    <td className="px-4 py-2.5">
                      <button onClick={() => removeRow(i)} className="text-red-400 hover:text-red-600 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function CNFPage() {
  const router = useRouter();
  const [authed, setAuthed] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [user, setUser] = useState("");

  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [freightCards, setFreightCards] = useState<FreightCard[]>([]);
  const [catalogProducts, setCatalogProducts] = useState<CostProduct[]>([]);
  const [catalogMaterials, setCatalogMaterials] = useState<CostMaterial[]>([]);
  const [catalogRecipes, setCatalogRecipes] = useState<Map<string, CostRecipeItem[]>>(new Map());
  const [catalogSettings, setCatalogSettings] = useState<CostSettings>({ fcRate: 275, currency: "PKR", targetCurrency: "USD", adminPct: 5, whtPct: 2, serviceCharges: 0, eds: 0, courierCharges: 0 });
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "archived">("active");
  const [filterDest, setFilterDest] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [q, f, prod, mat, settings, rec] = await Promise.all([
      fetch("/api/cnf/quotes").then(r => r.json()).catch(() => ({ quotes: [] })),
      fetch("/api/cnf/master-freight").then(r => r.json()).catch(() => ({ freightCards: [] })),
      fetch("/api/product-list/products").then(r => r.json()).catch(() => ({ products: [] })),
      fetch("/api/product-list/master").then(r => r.json()).catch(() => ({ materials: [] })),
      fetch("/api/product-list/settings").then(r => r.json()).catch(() => ({ fcRate: 275, currency: "PKR", targetCurrency: "USD" })),
      fetch("/api/product-list/recipes").then(r => r.json()).catch(() => ({ items: [] })),
    ]);
    setQuotes(q.quotes ?? []);
    setFreightCards(f.freightCards ?? []);
    setCatalogProducts((prod.products ?? []).filter((p: CostProduct) => p.active !== false));
    setCatalogMaterials(mat.materials ?? []);
    setCatalogSettings({
      fcRate: settings.fcRate ?? 275, currency: settings.currency ?? "PKR", targetCurrency: settings.targetCurrency ?? "USD",
      adminPct: settings.adminPct ?? 5, whtPct: settings.whtPct ?? 2,
      serviceCharges: settings.serviceCharges ?? 0, eds: settings.eds ?? 0, courierCharges: settings.courierCharges ?? 0,
    });
    const recMap = new Map<string, CostRecipeItem[]>();
    for (const item of (rec.items ?? []) as CostRecipeItem[]) {
      if (!recMap.has(item.productId)) recMap.set(item.productId, []);
      recMap.get(item.productId)!.push(item);
    }
    setCatalogRecipes(recMap);
    setLoading(false);
  }, []);

  async function toggleArchive(q: Quote) {
    await fetch("/api/cnf/quotes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: q.status === "archived" ? "unarchive" : "archive", id: q.id }),
    });
    load();
  }

  async function copyShareLink(id: string) {
    const url = `${window.location.origin}/cnf/share/${id}`;
    await navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  async function deleteQuote(q: Quote) {
    if (!window.confirm(`Permanently delete quote ${q.quoteNo} for ${q.clientName}? This cannot be undone.`)) return;
    await fetch("/api/cnf/quotes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id: q.id }),
    });
    load();
  }

  function submitPin() {
    const name = PIN_MAP[pin.trim()];
    if (name) { setAuthed(true); setUser(name); setPinError(""); load(); }
    else setPinError("Invalid PIN");
  }

  // PIN gate
  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-xl p-8 w-full max-w-sm">
          <div className="flex items-center gap-2.5 mb-6">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center">
              <Ship className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-gray-900">CNF Quotations</h1>
              <p className="text-xs text-gray-400">Export pricing module</p>
            </div>
          </div>
          <input type="password" value={pin} onChange={e => { setPin(e.target.value); setPinError(""); }}
            onKeyDown={e => e.key === "Enter" && submitPin()}
            placeholder="Enter PIN" autoFocus
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 text-center tracking-widest focus:outline-none focus:border-blue-400 mb-3" />
          {pinError && <p className="text-xs text-red-500 text-center mb-3">{pinError}</p>}
          <button onClick={submitPin} className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-3 rounded-xl cursor-pointer transition-colors">
            Access Module
          </button>
        </div>
      </div>
    );
  }

  const isAdmin = user === "Admin" || user === "Accountant";
  const destinations = [...new Set(quotes.map(q => q.destination).filter(Boolean))];

  const filtered = quotes.filter(q => {
    if (filterStatus !== "all" && q.status !== filterStatus) return false;
    if (filterDest && q.destination !== filterDest) return false;
    if (search) {
      const s = search.toLowerCase();
      return q.clientName.toLowerCase().includes(s) || q.quoteNo.toLowerCase().includes(s) || q.destination.toLowerCase().includes(s) || q.country.toLowerCase().includes(s);
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-20 shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/dashboard")} className="p-1.5 text-gray-400 hover:text-gray-600 cursor-pointer transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <Ship className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-gray-900">CNF Quotations</h1>
              <p className="text-[10px] text-gray-400">{user}</p>
            </div>
          </div>
        </div>
        <button onClick={() => setShowNew(true)}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2 rounded-xl cursor-pointer transition-colors shadow-sm">
          <Plus className="w-3.5 h-3.5" /> New Quote
        </button>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">

        {/* Quotes Section */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-gray-900">Quotes</h2>
              <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">
                {filtered.length} {filterStatus !== "all" ? filterStatus : "total"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {/* Status tabs */}
              <div className="flex bg-gray-100 rounded-lg p-0.5 text-xs">
                {(["active", "all", "archived"] as const).map(s => (
                  <button key={s} onClick={() => setFilterStatus(s)}
                    className={`px-3 py-1 rounded-md capitalize cursor-pointer transition-colors ${filterStatus === s ? "bg-white text-gray-900 shadow-sm font-medium" : "text-gray-500 hover:text-gray-700"}`}>
                    {s}
                  </button>
                ))}
              </div>
              <button onClick={() => setShowFilters(!showFilters)} className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border cursor-pointer transition-colors ${showFilters ? "bg-blue-50 border-blue-200 text-blue-700" : "border-gray-200 text-gray-500 hover:border-gray-300"}`}>
                <Filter className="w-3 h-3" /> Filter {showFilters ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            </div>
          </div>

          {/* Filter bar */}
          {showFilters && (
            <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100 bg-gray-50/50">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search client, quote#, destination…"
                  className="w-full pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-900 focus:outline-none focus:border-blue-400" />
              </div>
              <select value={filterDest} onChange={e => setFilterDest(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-700 focus:outline-none focus:border-blue-400 bg-white">
                <option value="">All Destinations</option>
                {destinations.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              {(search || filterDest) && (
                <button onClick={() => { setSearch(""); setFilterDest(""); }} className="text-xs text-gray-400 hover:text-gray-600 cursor-pointer">Clear</button>
              )}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-sm text-gray-400">
              {quotes.length === 0 ? "No quotes yet. Click \"New Quote\" to generate your first CNF quotation." : "No quotes match the current filters."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Quote #</th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Client</th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Destination</th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Products</th>
                    <th className="text-right px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Total CNF</th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Generated</th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Valid Till</th>
                    <th className="px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide text-center">Brand</th>
                    <th className="px-4 py-3 w-28" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(q => {
                    const totalCNF = q.productsSnapshot.reduce((s, p) => s + p.cnfPerCarton * p.qty, 0);
                    const isArchived = q.status === "archived";
                    return (
                      <tr key={q.id} className={`border-b border-gray-50 hover:bg-gray-50/50 transition-colors ${isArchived ? "opacity-60" : ""}`}>
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">{q.quoteNo}</span>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900 text-xs">{q.clientName}</p>
                          {q.clientContact && <p className="text-[10px] text-gray-400">{q.clientContact}</p>}
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-xs text-gray-900">{q.destination}</p>
                          <p className="text-[10px] text-gray-400">{q.country}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-gray-600">{q.productsSnapshot.length} item{q.productsSnapshot.length !== 1 ? "s" : ""}</span>
                          {q.productsSnapshot.length > 0 && (
                            <p className="text-[10px] text-gray-400 truncate max-w-[140px]">{q.productsSnapshot.map(p => p.productName).join(", ")}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="font-semibold text-blue-700 text-xs">{fmtUSD(totalCNF)}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">{fmtDate(q.generatedAt)}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs ${new Date(q.validTill) < new Date() ? "text-red-500 font-medium" : "text-gray-500"}`}>
                            {fmtDate(q.validTill + "T00:00:00")}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex justify-center gap-1">
                            {q.brandKafi && <span className="text-[9px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-medium">Kafi</span>}
                            {q.brandEssence && <span className="text-[9px] bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded font-medium">Essence</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 justify-end">
                            <button onClick={() => copyShareLink(q.id)} title="Copy share link"
                              className="p-1.5 text-gray-400 hover:text-blue-600 cursor-pointer transition-colors rounded-lg hover:bg-blue-50">
                              {copiedId === q.id ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                            <button onClick={() => window.open(`/cnf/share/${q.id}`, "_blank")} title="Open quote"
                              className="p-1.5 text-gray-400 hover:text-blue-600 cursor-pointer transition-colors rounded-lg hover:bg-blue-50">
                              <Share2 className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => toggleArchive(q)} title={isArchived ? "Unarchive" : "Archive"}
                              className="p-1.5 text-gray-400 hover:text-amber-600 cursor-pointer transition-colors rounded-lg hover:bg-amber-50">
                              {isArchived ? <ArchiveRestore className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                            </button>
                            {isAdmin && (
                              <button onClick={() => deleteQuote(q)} title="Delete permanently (Admin/Accountant only)"
                                className="p-1.5 text-gray-400 hover:text-red-600 cursor-pointer transition-colors rounded-lg hover:bg-red-50">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Master Freight Card */}
        {!loading && (
          <MasterFreightSection cards={freightCards} onUpdate={cards => setFreightCards(cards)} />
        )}
      </div>

      {/* New Quote Modal */}
      {showNew && (
        <NewQuoteModal
          freightCards={freightCards}
          catalogProducts={catalogProducts}
          catalogMaterials={catalogMaterials}
          catalogRecipes={catalogRecipes}
          catalogSettings={catalogSettings}
          createdBy={user}
          onClose={() => setShowNew(false)}
          onCreated={load}
        />
      )}
    </div>
  );
}
