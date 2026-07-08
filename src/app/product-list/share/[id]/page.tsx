"use client";
import { useState, useEffect } from "react";
import { Package } from "lucide-react";

interface Material { id: string; name: string; unit: string; pricePerUnit: number; }
interface Product { id: string; sku: string; name: string; productType: string; fclQty: number; adminPct: number; grossProfitPct: number; whtPct: number; serviceCharges: number; eds: number; courierCharges: number; imageUrl: string; notes: string; }
interface RecipeItem { id: string; productId: string; materialId: string; materialName: string; qty: number; unitType: string; priceOverride?: number | null; }
interface Settings { fcRate: number; currency: string; targetCurrency: string; }

function calcCost(recipe: RecipeItem[], materials: Material[], product: Product, settings: Settings) {
  const matMap = new Map(materials.map(m => [m.id, m]));
  let cogPKR = 0;
  for (const item of recipe) {
    const price = item.priceOverride != null ? item.priceOverride : (matMap.get(item.materialId)?.pricePerUnit ?? 0);
    if (item.unitType === "CONTAINER") cogPKR += price / (product.fclQty || 1500);
    else cogPKR += item.qty * price;
  }
  const adminAmt = cogPKR * (product.adminPct / 100);
  const cogWithAdmin = cogPKR + adminAmt;
  const cogUSD = cogWithAdmin / (settings.fcRate || 275);
  const sellingUSD = cogUSD * (1 + product.grossProfitPct / 100);
  const whtUSD = sellingUSD * (product.whtPct / 100);
  const fobUSD = sellingUSD + whtUSD + product.serviceCharges + product.eds + product.courierCharges;
  return { cogPKR, sellingUSD, fobUSD };
}

export default function SharePage({ params }: { params: { id: string } }) {
  const { id } = params;
  const [product, setProduct] = useState<Product | null>(null);
  const [recipe, setRecipe] = useState<RecipeItem[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [settings, setSettings] = useState<Settings>({ fcRate: 275, currency: "PKR", targetCurrency: "USD" });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/product-list/products").then(r => r.json()),
      fetch(`/api/product-list/recipes?productId=${id}`).then(r => r.json()),
      fetch("/api/product-list/master").then(r => r.json()),
      fetch("/api/product-list/settings").then(r => r.json()),
    ]).then(([p, rec, mat, set]) => {
      const found = (p.products ?? []).find((x: Product) => x.id === id);
      setProduct(found ?? null);
      setRecipe(rec.items ?? []);
      setMaterials(mat.materials ?? []);
      setSettings(set);
      setLoaded(true);
    });
  }, [id]);

  if (!loaded) return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading...</div>;
  if (!product) return <div className="min-h-screen flex items-center justify-center text-gray-400">Product not found.</div>;

  const calc = calcCost(recipe, materials, product, settings);
  const fmt2 = (n: number) => n.toFixed(2);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-4 md:p-8">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-green-100 flex items-center justify-center mx-auto mb-3"><Package className="w-6 h-6 text-green-600" /></div>
          <p className="text-sm text-gray-400">KAFI COMMODITIES (PVT.) LIMITED</p>
        </div>

        {/* Product Card */}
        <div className="bg-white rounded-3xl shadow-xl overflow-hidden">
          {product.imageUrl ? (
            <img src={product.imageUrl} alt={product.name} className="w-full h-64 object-cover" />
          ) : (
            <div className="w-full h-48 bg-gradient-to-br from-green-50 to-green-100 flex items-center justify-center">
              <Package className="w-16 h-16 text-green-300" />
            </div>
          )}
          <div className="p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-xs font-mono text-gray-400">{product.sku}</p>
                <h1 className="text-xl font-bold text-gray-900 mt-0.5">{product.name}</h1>
                <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold">{product.productType}</span>
              </div>
            </div>

            {/* Price */}
            <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-2xl p-5 mb-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-1">FOB Price per Carton</p>
              <p className="text-4xl font-bold text-green-600">USD {fmt2(calc.fobUSD)}</p>
              <p className="text-sm text-gray-400 mt-1">CNF on request · Prices subject to change</p>
            </div>

            {product.notes && <p className="text-sm text-gray-500 mb-4">{product.notes}</p>}

            <div className="border-t border-gray-100 pt-4 text-center">
              <p className="text-xs text-gray-400">Price valid as of {new Date().toLocaleDateString("en-PK", { year: "numeric", month: "long", day: "numeric" })}</p>
              <p className="text-xs text-gray-400 mt-0.5">For enquiries contact: Kafi Commodities (Pvt.) Ltd.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
