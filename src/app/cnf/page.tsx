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
  category: string; imageUrl: string; brandName: string;
};

type QuoteBrand = { id: string; name: string };

type QuoteType = "CNF" | "FOB";
type DiscountType = "none" | "percent" | "amount";
type DiscountScope = "all" | "specific";

type Quote = {
  id: string; quoteNo: string; clientName: string; clientContact: string;
  destination: string; country: string; generatedAt: string; validTill: string;
  status: string; createdBy: string; brandKafi: boolean; brandEssence: boolean;
  notes: string; productsSnapshot: QuoteProduct[];
  quoteType: QuoteType;
  discountType: DiscountType; discountScope: DiscountScope; discountValue: number;
  discountAmount: number; discountProductIds: string[];
  shipmentPort: string; shippingMode: string; leadTime: string;
};

// Discount is computed on the (already CNF/FOB-appropriate) line totals —
// scoped to either every product or just the ones the quote-maker picked.
function computeDiscount(
  products: QuoteProduct[], discountType: DiscountType, discountScope: DiscountScope,
  discountValue: number, discountProductIds: string[],
): number {
  if (discountType === "none" || discountValue <= 0) return 0;
  const scoped = discountScope === "all" ? products : products.filter(p => discountProductIds.includes(p.productId));
  const scopedSubtotal = scoped.reduce((s, p) => s + p.cnfPerCarton * p.qty, 0);
  if (scopedSubtotal <= 0) return 0;
  const raw = discountType === "percent" ? scopedSubtotal * (discountValue / 100) : discountValue;
  return Math.round(Math.min(raw, scopedSubtotal) * 100) / 100;
}

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
  catalogBrands: QuoteBrand[];
  createdBy: string;
  onClose: () => void;
  onCreated: () => void;
};

function NewQuoteModal({ freightCards, catalogProducts, catalogMaterials, catalogRecipes, catalogSettings, catalogBrands, createdBy, onClose, onCreated }: NewQuoteModalProps) {
  const brandName = (productBrandId?: string) => catalogBrands.find(b => b.id === productBrandId)?.name ?? "";
  const [clientName, setClientName] = useState("");
  const [clientContact, setClientContact] = useState("");
  const [destination, setDestination] = useState("");
  const [country, setCountry] = useState("");
  const [freightPerCarton, setFreightPerCarton] = useState(0);
  const [validTill, setValidTill] = useState(defaultValidTill());
  const [notes, setNotes] = useState("");
  // Brand is always Kafi Commodities on the quote — no toggle shown to the quote-maker.
  const brandKafi = true;
  const brandEssence = false;
  const [quoteType, setQuoteType] = useState<QuoteType>("CNF");
  const [products, setProducts] = useState<QuoteProduct[]>([
    { productId: "", productName: "", sku: "", specs: "", packagingDesc: "", qty: 1, fobPerCarton: 0, freightPerCarton: 0, cnfPerCarton: 0, category: "", imageUrl: "", brandName: "" },
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Add-by-category picker
  const [showCatPicker, setShowCatPicker] = useState(false);
  const [catPickerCategory, setCatPickerCategory] = useState("");
  const [catPickerSelected, setCatPickerSelected] = useState<Set<string>>(new Set());

  // Terms & Conditions — fixed defaults for now; will be sourced per-brand later
  const [shipmentPort, setShipmentPort] = useState("Karachi Port");
  const [shippingMode, setShippingMode] = useState("By Sea");
  const [leadTime, setLeadTime] = useState("30 to 35 Working Days");

  // Discount
  const [discountEnabled, setDiscountEnabled] = useState(false);
  const [discountType, setDiscountType] = useState<DiscountType>("percent");
  const [discountScope, setDiscountScope] = useState<DiscountScope>("all");
  const [discountValue, setDiscountValue] = useState(0);
  const [discountProductIds, setDiscountProductIds] = useState<string[]>([]);

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
    // Recompute each product's own per-carton freight using its own FCL Container Qty.
    // In FOB mode the freight card is frozen — it's kept selected for record-keeping
    // but never actually added to the quote.
    setProducts(prev => prev.map(p => {
      const freight = (quoteType === "CNF" && p.productId) ? freightFor(p.productId, card.freightPerCarton) : 0;
      return { ...p, freightPerCarton: freight, cnfPerCarton: p.fobPerCarton + freight };
    }));
  }

  function changeQuoteType(next: QuoteType) {
    setQuoteType(next);
    setProducts(prev => prev.map(p => {
      const freight = (next === "CNF" && p.productId) ? freightFor(p.productId, freightPerCarton) : 0;
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
        // Specs/Packaging are no longer collected as separate fields in Product List —
        // "Product Packaging" (notes) now carries this combined description.
        p.specs = product?.specs || product?.notes || "";
        p.packagingDesc = product?.packagingDesc ?? "";
        p.category = product?.category ?? "";
        p.imageUrl = product?.imageUrl ?? "";
        p.brandName = brandName(product?.brandId);
        p.fobPerCarton = fobFor(String(value), p.qty);
        p.freightPerCarton = (quoteType === "CNF") ? freightFor(String(value), freightPerCarton) : 0;
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
      category: "", imageUrl: "", brandName: "",
    }]);
  }

  // Build a fully-computed quote line from a catalog product id (same logic as
  // selecting it in a row) — used for bulk add-by-category.
  function buildQuoteProduct(productId: string): QuoteProduct {
    const product = catalogProducts.find(cp => cp.id === productId);
    const fob = fobFor(productId, 1);
    const freight = (quoteType === "CNF") ? freightFor(productId, freightPerCarton) : 0;
    return {
      productId, productName: product?.name ?? "", sku: product?.sku ?? "",
      specs: product?.specs || product?.notes || "", packagingDesc: product?.packagingDesc ?? "",
      category: product?.category ?? "", imageUrl: product?.imageUrl ?? "", brandName: brandName(product?.brandId),
      qty: 1, fobPerCarton: fob, freightPerCarton: freight, cnfPerCarton: fob + freight,
    };
  }

  function addProductsByIds(ids: string[]) {
    setProducts(prev => {
      const existing = new Set(prev.map(p => p.productId).filter(Boolean));
      const toAdd = ids.filter(id => !existing.has(id)).map(buildQuoteProduct);
      if (toAdd.length === 0) return prev;
      // drop leftover empty placeholder rows once we're adding real products
      const kept = prev.filter(p => p.productId);
      return [...kept, ...toAdd];
    });
  }

  function removeProduct(i: number) {
    setProducts(prev => prev.filter((_, idx) => idx !== i));
  }

  async function generate() {
    setSaving(true);
    setError("");
    try {
      const finalProducts = products.filter(p => p.productName.trim());
      const finalDiscountType = discountEnabled ? discountType : "none";
      const discountAmount = computeDiscount(finalProducts, finalDiscountType, discountScope, discountValue, discountProductIds);
      const res = await fetch("/api/cnf/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          quote: {
            clientName, clientContact, destination, country,
            validTill, notes, brandKafi, brandEssence, createdBy,
            quoteType,
            discountType: finalDiscountType, discountScope, discountValue,
            discountAmount, discountProductIds: finalDiscountType === "none" ? [] : discountProductIds,
            productsSnapshot: finalProducts,
            shipmentPort, shippingMode, leadTime,
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

  const validProductsList = products.filter(p => p.productName.trim());
  const validProducts = validProductsList.length;
  const subtotal = validProductsList.reduce((s, p) => s + p.cnfPerCarton * p.qty, 0);
  const activeDiscountType: DiscountType = discountEnabled ? discountType : "none";
  const discountAmount = computeDiscount(validProductsList, activeDiscountType, discountScope, discountValue, discountProductIds);
  const grandTotal = subtotal - discountAmount;

  function toggleDiscountProduct(productId: string) {
    setDiscountProductIds(prev => prev.includes(productId) ? prev.filter(id => id !== productId) : [...prev, productId]);
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-5 border-b border-gray-100">
          <h2 className="text-xl font-semibold text-gray-900">New CNF Quotation</h2>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 cursor-pointer"><X className="w-5 h-5" /></button>
        </div>

        {/* Body — single page */}
        <div className="flex-1 overflow-y-auto px-8 py-5 text-base space-y-6">

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
            <label className="block text-sm font-medium text-gray-600 mb-2.5">Quote Type</label>
            <div className="flex gap-3">
              {(["CNF", "FOB"] as const).map(t => (
                <button key={t} onClick={() => changeQuoteType(t)}
                  className={`flex-1 border rounded-xl px-5 py-3 text-base font-medium cursor-pointer transition-all ${quoteType === t ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-500 hover:border-gray-300"}`}>
                  {t === "CNF" ? "CNF (with freight)" : "FOB (no freight)"}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-1.5">
              {quoteType === "CNF" ? "Freight is added automatically per product below." : "Freight is frozen — the destination can still be selected for reference, but its cost is not added to this quote."}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 mb-2.5">
              Destination {quoteType === "FOB" && <span className="text-xs font-normal text-amber-600">(frozen — not applied to price)</span>}
            </label>
            {freightCards.length === 0 ? (
              <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                No freight destinations set up yet — add one in the Master Freight Card section below first.
              </p>
            ) : (
              <select
                value={freightCards.find(c => c.destination === destination)?.id ?? ""}
                disabled={quoteType === "FOB"}
                onChange={e => { const card = freightCards.find(c => c.id === e.target.value); if (card) pickDestination(card); }}
                className="w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-base text-gray-900 focus:outline-none focus:border-blue-400 bg-white cursor-pointer disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed">
                <option value="">— Choose a destination —</option>
                {freightCards.map(c => (
                  <option key={c.id} value={c.id}>{c.destination}, {c.country}</option>
                ))}
              </select>
            )}
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

          <div>
            <label className="block text-sm font-medium text-gray-600 mb-2.5">Terms &amp; Conditions</label>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Shipment Port</label>
                <input value={shipmentPort} onChange={e => setShipmentPort(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-400" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Shipping</label>
                <input value={shippingMode} onChange={e => setShippingMode(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-400" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Lead Time</label>
                <input value={leadTime} onChange={e => setLeadTime(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-400" />
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-1.5">Pre-filled with standard defaults — edit if this quote needs different terms.</p>
          </div>

          <div className="border-t border-gray-100 pt-5">
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-medium text-gray-600">Products</label>
              <div className="flex items-center gap-2">
                <button onClick={() => {
                  const cats = [...new Set(catalogProducts.map(p => p.category).filter(Boolean))] as string[];
                  const firstCat = cats[0] ?? "";
                  setCatPickerCategory(firstCat);
                  const inQuote = new Set(products.map(p => p.productId).filter(Boolean));
                  setCatPickerSelected(new Set(catalogProducts.filter(p => p.category === firstCat && !inQuote.has(p.id)).map(p => p.id)));
                  setShowCatPicker(true);
                }} className="flex items-center gap-1.5 text-sm border border-blue-600 text-blue-700 px-4 py-2 rounded-lg hover:bg-blue-50 cursor-pointer transition-colors">
                  <Plus className="w-4 h-4" /> Add by Category
                </button>
                <button onClick={addProduct} className="flex items-center gap-1.5 text-sm bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 cursor-pointer transition-colors">
                  <Plus className="w-4 h-4" /> Add Product
                </button>
              </div>
            </div>

            {sortedProducts.length === 0 && (
              <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-3">
                No products found in the Product List. Add products (with recipes) there first — CNF quotes pull FOB pricing directly from the Product List.
              </p>
            )}

            <div className="space-y-3">
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
                  <div className={`grid ${quoteType === "CNF" ? "grid-cols-4" : "grid-cols-3"} gap-3`}>
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
                    {quoteType === "CNF" && (
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Freight/Carton ($) — auto</label>
                        <div className="w-full border border-gray-200 bg-gray-100 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 text-right">
                          {fmtUSD(p.freightPerCarton)}
                        </div>
                      </div>
                    )}
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">{quoteType === "CNF" ? "CNF/Carton ($)" : "Price/Carton ($)"}</label>
                      <div className="w-full border border-blue-200 bg-blue-50 rounded-lg px-3 py-2 text-sm font-semibold text-blue-700 text-right">
                        {fmtUSD(p.cnfPerCarton)}
                      </div>
                    </div>
                  </div>
                  {discountEnabled && discountScope === "specific" && p.productId && (
                    <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer pt-1">
                      <input type="checkbox" checked={discountProductIds.includes(p.productId)} onChange={() => toggleDiscountProduct(p.productId)}
                        className="cursor-pointer accent-blue-600" />
                      Apply discount to this item
                    </label>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Discount */}
          <div className="border-t border-gray-100 pt-5">
            <label className="flex items-center gap-2.5 text-sm font-medium text-gray-600 cursor-pointer mb-3">
              <input type="checkbox" checked={discountEnabled} onChange={e => setDiscountEnabled(e.target.checked)} className="cursor-pointer accent-blue-600 w-4 h-4" />
              Add Discount
            </label>
            {discountEnabled && (
              <div className="grid grid-cols-3 gap-3 bg-gray-50 border border-gray-200 rounded-xl p-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Discount Type</label>
                  <div className="flex gap-2">
                    {(["percent", "amount"] as const).map(t => (
                      <button key={t} onClick={() => setDiscountType(t)}
                        className={`flex-1 border rounded-lg px-3 py-2 text-sm cursor-pointer transition-all ${discountType === t ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-500"}`}>
                        {t === "percent" ? "%" : "$ Amount"}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Applies To</label>
                  <div className="flex gap-2">
                    {(["all", "specific"] as const).map(s => (
                      <button key={s} onClick={() => setDiscountScope(s)}
                        className={`flex-1 border rounded-lg px-3 py-2 text-sm cursor-pointer transition-all ${discountScope === s ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-500"}`}>
                        {s === "all" ? "All Items" : "Specific Items"}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">{discountType === "percent" ? "Discount %" : "Discount Amount ($)"}</label>
                  <input type="number" min={0} value={discountValue || ""} onChange={e => setDiscountValue(Math.max(0, parseFloat(e.target.value) || 0))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-400 bg-white" />
                </div>
                {discountScope === "specific" && (
                  <p className="col-span-3 text-xs text-gray-500">Check &quot;Apply discount to this item&quot; under each product above to choose which ones it applies to.</p>
                )}
              </div>
            )}
          </div>

          {/* Quote Summary — always visible, updates live */}
          <div className="border border-gray-200 rounded-xl p-5 bg-gray-50 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Quote Summary</span>
              <span className="text-sm text-gray-400">Auto-numbered on save</span>
            </div>
            <div className="grid grid-cols-2 gap-y-2.5 text-base">
              <span className="text-gray-500">Client</span><span className="font-medium text-gray-900">{clientName || "—"}</span>
              <span className="text-gray-500">Quote Type</span><span className="font-medium text-gray-900">{quoteType}</span>
              <span className="text-gray-500">Destination</span><span className="font-medium text-gray-900">{destination || "—"}{country ? `, ${country}` : ""}</span>
              <span className="text-gray-500">Valid Until</span><span className="font-medium text-gray-900">{validTill ? fmtDate(validTill + "T00:00:00") : "—"}</span>
              <span className="text-gray-500">Products</span><span className="font-medium text-gray-900">{validProducts} item{validProducts !== 1 ? "s" : ""}</span>
              <span className="text-gray-500">Subtotal</span><span className="font-medium text-gray-900">{fmtUSD(subtotal)}</span>
              {discountAmount > 0 && (
                <>
                  <span className="text-gray-500">Discount</span><span className="font-medium text-red-500">−{fmtUSD(discountAmount)}</span>
                </>
              )}
              <span className="text-gray-500">Grand Total</span><span className="font-bold text-blue-700 text-lg">{fmtUSD(grandTotal)}</span>
            </div>
            {notes && <p className="text-sm text-gray-500 italic border-t border-gray-200 pt-2.5">{notes}</p>}
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-3.5">
            <p className="text-sm text-amber-700 font-medium">Once generated, this quote is immutable and cannot be edited.</p>
            <p className="text-xs text-amber-600 mt-1">A unique quote number will be assigned automatically.</p>
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-8 py-5 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2.5 text-base text-gray-500 hover:text-gray-700 cursor-pointer transition-colors">
            Cancel
          </button>
          <button onClick={generate} disabled={saving || validProducts === 0 || !clientName.trim()}
            className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 text-white text-base font-semibold rounded-lg cursor-pointer disabled:cursor-not-allowed transition-colors">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ship className="w-4 h-4" />}
            Generate Quote
          </button>
        </div>
      </div>

      {/* Add-by-category picker */}
      {showCatPicker && (
        <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4" onClick={() => setShowCatPicker(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-900">Add Products by Category</h3>
              <button onClick={() => setShowCatPicker(false)} className="p-1.5 text-gray-400 hover:text-gray-600 cursor-pointer"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-6 py-4 space-y-3 flex-1 overflow-y-auto">
              {(() => {
                const cats = [...new Set(catalogProducts.map(p => p.category).filter(Boolean))] as string[];
                if (cats.length === 0) return <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">No product categories yet. Assign a category to products in Product List → Products first (e.g. tag all pink-salt items as "PINK SALT").</p>;
                const inQuote = new Set(products.map(p => p.productId).filter(Boolean));
                const catProducts = catalogProducts.filter(p => p.category === catPickerCategory);
                const selectableIds = catProducts.filter(p => !inQuote.has(p.id)).map(p => p.id);
                const allSelected = selectableIds.length > 0 && selectableIds.every(id => catPickerSelected.has(id));
                return (
                  <>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Category</label>
                      <select value={catPickerCategory} onChange={e => {
                        const c = e.target.value; setCatPickerCategory(c);
                        setCatPickerSelected(new Set(catalogProducts.filter(p => p.category === c && !inQuote.has(p.id)).map(p => p.id)));
                      }} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-400 cursor-pointer">
                        {cats.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">{catProducts.length} product{catProducts.length !== 1 ? "s" : ""} in {catPickerCategory}</span>
                      <button onClick={() => setCatPickerSelected(allSelected ? new Set() : new Set(selectableIds))} className="text-xs text-blue-600 hover:text-blue-700 cursor-pointer">
                        {allSelected ? "Deselect all" : "Select all"}
                      </button>
                    </div>
                    <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 max-h-[45vh] overflow-y-auto">
                      {catProducts.map(p => {
                        const already = inQuote.has(p.id);
                        const fob = fobFor(p.id, 1);
                        const cnf = fob + (quoteType === "CNF" ? freightFor(p.id, freightPerCarton) : 0);
                        const checked = catPickerSelected.has(p.id);
                        return (
                          <label key={p.id} className={`flex items-center gap-3 px-3 py-2.5 ${already ? "opacity-50" : "cursor-pointer hover:bg-gray-50"}`}>
                            <input type="checkbox" disabled={already} checked={already ? false : checked}
                              onChange={() => setCatPickerSelected(prev => { const n = new Set(prev); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })}
                              className="accent-blue-600 w-4 h-4 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                              {p.sku && <p className="text-[11px] text-gray-400">{p.sku}</p>}
                            </div>
                            {already
                              ? <span className="text-[11px] text-gray-400 whitespace-nowrap">already added</span>
                              : <span className="text-sm font-semibold text-blue-700 whitespace-nowrap">${cnf.toFixed(2)}</span>}
                          </label>
                        );
                      })}
                      {catProducts.length === 0 && <p className="px-3 py-4 text-sm text-gray-400 text-center">No products in this category.</p>}
                    </div>
                  </>
                );
              })()}
            </div>
            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
              <button onClick={() => setShowCatPicker(false)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 cursor-pointer">Cancel</button>
              <button onClick={() => { addProductsByIds([...catPickerSelected]); setShowCatPicker(false); }} disabled={catPickerSelected.size === 0}
                className="flex items-center gap-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm font-semibold rounded-lg cursor-pointer disabled:cursor-not-allowed">
                <Plus className="w-4 h-4" /> Add Selected ({catPickerSelected.size})
              </button>
            </div>
          </div>
        </div>
      )}
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
  const [catalogBrands, setCatalogBrands] = useState<QuoteBrand[]>([]);
  const [catalogSettings, setCatalogSettings] = useState<CostSettings>({ fcRate: 275, currency: "PKR", targetCurrency: "USD", adminPct: 5, whtPct: 2, serviceCharges: 0, eds: 0, courierCharges: 0 });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showNew, setShowNew] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "expired" | "archived">("active");
  const [filterDest, setFilterDest] = useState("");
  const [filterBrand, setFilterBrand] = useState<"" | "Kafi" | "Essence">("");
  const [sortBy, setSortBy] = useState<"date-desc" | "date-asc" | "price-desc" | "price-asc">("date-desc");
  const [showFilters, setShowFilters] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  // Bulk-delete selection (accountant/admin only)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // A failed/empty-looking load should never be silently indistinguishable
  // from "there really are zero quotes" — that's what caused real panic when
  // a transient fetch hiccup made an intact quote list look wiped.
  async function fetchJsonSafe<T>(url: string, fallback: T): Promise<{ data: T; failed: boolean }> {
    try {
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok || json?.error) return { data: fallback, failed: true };
      return { data: json, failed: false };
    } catch {
      return { data: fallback, failed: true };
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    const [q, f, prod, mat, settings, rec, br] = await Promise.all([
      fetchJsonSafe<{ quotes: Quote[] }>("/api/cnf/quotes", { quotes: [] }),
      fetchJsonSafe<{ freightCards: FreightCard[] }>("/api/cnf/master-freight", { freightCards: [] }),
      fetchJsonSafe<{ products: CostProduct[] }>("/api/product-list/products", { products: [] }),
      fetchJsonSafe<{ materials: CostMaterial[] }>("/api/product-list/master", { materials: [] }),
      fetchJsonSafe<CostSettings>("/api/product-list/settings", { fcRate: 275, currency: "PKR", targetCurrency: "USD", adminPct: 5, whtPct: 2, serviceCharges: 0, eds: 0, courierCharges: 0 }),
      fetchJsonSafe<{ items: CostRecipeItem[] }>("/api/product-list/recipes", { items: [] }),
      fetchJsonSafe<{ brands: QuoteBrand[] }>("/api/product-list/brands", { brands: [] }),
    ]);
    // Only the quotes fetch failing is worth alarming about — the others are
    // supporting data for the New Quote form, not "is my data gone?" panic.
    if (q.failed) setLoadError(true);
    setQuotes(q.data.quotes ?? []);
    setFreightCards(f.data.freightCards ?? []);
    setCatalogProducts((prod.data.products ?? []).filter((p: CostProduct) => p.active !== false));
    setCatalogMaterials(mat.data.materials ?? []);
    setCatalogSettings({
      fcRate: settings.data.fcRate ?? 275, currency: settings.data.currency ?? "PKR", targetCurrency: settings.data.targetCurrency ?? "USD",
      adminPct: settings.data.adminPct ?? 5, whtPct: settings.data.whtPct ?? 2,
      serviceCharges: settings.data.serviceCharges ?? 0, eds: settings.data.eds ?? 0, courierCharges: settings.data.courierCharges ?? 0,
    });
    const recMap = new Map<string, CostRecipeItem[]>();
    for (const item of (rec.data.items ?? []) as CostRecipeItem[]) {
      if (!recMap.has(item.productId)) recMap.set(item.productId, []);
      recMap.get(item.productId)!.push(item);
    }
    setCatalogRecipes(recMap);
    setCatalogBrands(br.data.brands ?? []);
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
    setSelectedIds(prev => { const n = new Set(prev); n.delete(q.id); return n; });
    load();
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function deleteSelected(idsToDelete: string[]) {
    if (idsToDelete.length === 0) return;
    if (!window.confirm(`Permanently delete ${idsToDelete.length} quotation${idsToDelete.length > 1 ? "s" : ""}? This cannot be undone.`)) return;
    setBulkDeleting(true);
    try {
      await fetch("/api/cnf/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "deleteMany", ids: idsToDelete }),
      });
      setSelectedIds(new Set());
      await load();
    } finally {
      setBulkDeleting(false);
    }
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
  const isExpired = (q: Quote) => !!q.validTill && new Date(q.validTill + "T23:59:59") < new Date();
  const quoteTotal = (q: Quote) => q.productsSnapshot.reduce((s, p) => s + p.cnfPerCarton * p.qty, 0) - (q.discountAmount || 0);

  const filtered = quotes.filter(q => {
    if (filterStatus === "archived" && q.status !== "archived") return false;
    if (filterStatus === "active" && (q.status === "archived" || isExpired(q))) return false;
    if (filterStatus === "expired" && !isExpired(q)) return false;
    if (filterDest && q.destination !== filterDest) return false;
    if (filterBrand === "Kafi" && !q.brandKafi) return false;
    if (filterBrand === "Essence" && !q.brandEssence) return false;
    if (search) {
      const s = search.toLowerCase();
      return q.clientName.toLowerCase().includes(s) || q.quoteNo.toLowerCase().includes(s) || q.destination.toLowerCase().includes(s) || q.country.toLowerCase().includes(s);
    }
    return true;
  }).sort((a, b) => {
    if (sortBy === "date-desc") return b.generatedAt.localeCompare(a.generatedAt);
    if (sortBy === "date-asc") return a.generatedAt.localeCompare(b.generatedAt);
    if (sortBy === "price-desc") return quoteTotal(b) - quoteTotal(a);
    return quoteTotal(a) - quoteTotal(b);
  });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-20 shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/product-list")} className="p-1.5 text-gray-400 hover:text-gray-600 cursor-pointer transition-colors">
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
                {(["active", "expired", "all", "archived"] as const).map(s => (
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
              <select value={filterBrand} onChange={e => setFilterBrand(e.target.value as typeof filterBrand)}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-700 focus:outline-none focus:border-blue-400 bg-white">
                <option value="">All Brands</option>
                <option value="Kafi">Kafi</option>
                <option value="Essence">Essence</option>
              </select>
              <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-700 focus:outline-none focus:border-blue-400 bg-white">
                <option value="date-desc">Date: Newest First</option>
                <option value="date-asc">Date: Oldest First</option>
                <option value="price-desc">Price: High to Low</option>
                <option value="price-asc">Price: Low to High</option>
              </select>
              {(search || filterDest || filterBrand) && (
                <button onClick={() => { setSearch(""); setFilterDest(""); setFilterBrand(""); }} className="text-xs text-gray-400 hover:text-gray-600 cursor-pointer">Clear</button>
              )}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
            </div>
          ) : loadError ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <p className="text-sm font-semibold text-red-600">Couldn&apos;t load quotations — your data is safe, this is just a connection hiccup.</p>
              <p className="text-xs text-gray-400">Nothing was deleted. Try again below.</p>
              <button onClick={load} className="flex items-center gap-1.5 text-xs font-semibold px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg cursor-pointer transition-colors">
                <Loader2 className="w-3.5 h-3.5" /> Retry
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-sm text-gray-400">
              {quotes.length === 0 ? "No quotes yet. Click \"New Quote\" to generate your first CNF quotation." : "No quotes match the current filters."}
            </div>
          ) : (
            <>
            {isAdmin && (
              <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-gray-100 bg-gray-50/60">
                <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer select-none">
                  <input type="checkbox"
                    checked={filtered.length > 0 && filtered.every(q => selectedIds.has(q.id))}
                    onChange={e => setSelectedIds(e.target.checked ? new Set(filtered.map(q => q.id)) : new Set())}
                    className="cursor-pointer w-3.5 h-3.5 accent-red-600" />
                  Select all ({filtered.length})
                </label>
                {selectedIds.size > 0 && (
                  <button onClick={() => deleteSelected([...selectedIds])} disabled={bulkDeleting}
                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg cursor-pointer transition-colors">
                    {bulkDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    Delete selected ({selectedIds.size})
                  </button>
                )}
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    {isAdmin && <th className="px-4 py-3 w-8" />}
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Quote #</th>
                    <th className="text-center px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Type</th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Client</th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Destination</th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Products</th>
                    <th className="text-right px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Total</th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Generated</th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Valid Till</th>
                    <th className="px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide text-center">Brand</th>
                    <th className="px-4 py-3 w-28" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(q => {
                    const subtotal = q.productsSnapshot.reduce((s, p) => s + p.cnfPerCarton * p.qty, 0);
                    const total = subtotal - (q.discountAmount || 0);
                    const isArchived = q.status === "archived";
                    return (
                      <tr key={q.id} className={`border-b border-gray-50 hover:bg-gray-50/50 transition-colors ${isArchived ? "opacity-60" : ""} ${selectedIds.has(q.id) ? "bg-red-50/40" : ""}`}>
                        {isAdmin && (
                          <td className="px-4 py-3">
                            <input type="checkbox" checked={selectedIds.has(q.id)} onChange={() => toggleSelect(q.id)} className="cursor-pointer w-3.5 h-3.5 accent-red-600" />
                          </td>
                        )}
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">{q.quoteNo}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${q.quoteType === "FOB" ? "bg-purple-50 text-purple-600" : "bg-blue-50 text-blue-600"}`}>
                            {q.quoteType || "CNF"}
                          </span>
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
                          <span className="font-semibold text-blue-700 text-xs">{fmtUSD(total)}</span>
                          {(q.discountAmount ?? 0) > 0 && <p className="text-[9px] text-red-400">−{fmtUSD(q.discountAmount)} disc.</p>}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">{fmtDate(q.generatedAt)}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs ${isExpired(q) ? "text-red-500 font-medium" : "text-gray-500"}`}>
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
            </>
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
          catalogBrands={catalogBrands}
          createdBy={user}
          onClose={() => setShowNew(false)}
          onCreated={load}
        />
      )}
    </div>
  );
}
