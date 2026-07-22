import { supabase } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { calcRice, type RiceProduct, type RiceMaster, type RiceSettings } from "@/lib/rice-costing";

// Computes Kafi's own FOB selling price for a catalog product on the fly —
// neither pl_products nor rice_products stores a price column, it's always
// derived from cost + gross-profit%/settings (see Product List's calcCost /
// lib/rice-costing.ts calcRice). This mirrors those exact formulas so other
// modules (e.g. Cost/Budgeting's Reverse Costing "Own Price" pull) get the
// real, current FOB price instead of a stale duplicate.

const r2 = (n: number) => Math.round(n * 100) / 100;

async function foodSellingPrice(productId: string) {
  const { data: product } = await supabase.from("pl_products").select("*").eq("id", productId).single();
  if (!product) return null;

  const { data: recipe } = await supabase.from("pl_recipes").select("*").eq("product_id", productId);
  const materialIds = Array.from(new Set((recipe ?? []).map(r => r.material_id).filter(Boolean)));
  const { data: materials } = materialIds.length > 0
    ? await supabase.from("pl_master").select("id, price_per_unit").in("id", materialIds)
    : { data: [] as { id: string; price_per_unit: number }[] };
  const priceMap = new Map((materials ?? []).map(m => [m.id as string, Number(m.price_per_unit || 0)]));

  const { data: settingsRows } = await supabase.from("pl_settings").select("*");
  const settings: Record<string, string> = {};
  for (const row of settingsRows ?? []) if (row.key) settings[row.key] = row.value ?? "";
  const adminPct = parseFloat(settings.adminPct || "5") || 5;
  const fcRate = parseFloat(settings.fcRate || "275") || 275;
  const whtPct = parseFloat(settings.whtPct || "2") || 2;
  const serviceCharges = parseFloat(settings.serviceCharges || "0") || 0;
  const eds = parseFloat(settings.eds || "0") || 0;
  const courierCharges = parseFloat(settings.courierCharges || "0") || 0;

  const fclQty = Number(product.fcl_qty) || 1500;
  const grossProfitPct = Number(product.gross_profit_pct) || 50;

  let pcsCOG = 0;
  let fixedCOG = 0;
  for (const item of recipe ?? []) {
    const price = item.price_override != null ? Number(item.price_override) : (priceMap.get(item.material_id as string) ?? 0);
    const qty = Number(item.qty || 0);
    if (item.unit_type === "CONTAINER") fixedCOG += price / fclQty;
    else if (item.unit_type === "FIXED") fixedCOG += qty * price;
    else pcsCOG += qty * price;
  }

  const quoteQty = 1; // per-carton price
  const cogTotal = r2(pcsCOG * quoteQty + fixedCOG);
  const adminAmt = r2(cogTotal * (adminPct / 100));
  const cogWithAdmin = r2(cogTotal + adminAmt);
  const cogUSD = r2(cogWithAdmin / (fcRate || 275));
  const sellingUSD = r2(cogUSD * (1 + grossProfitPct / 100));
  const whtUSD = r2(sellingUSD * (whtPct / 100));
  const serviceChargesAmt = r2(sellingUSD * (serviceCharges / 100));
  const edsAmt = r2(sellingUSD * (eds / 100));
  const courierChargesAmt = r2(sellingUSD * (courierCharges / 100));
  const fobPerCarton = r2(sellingUSD + whtUSD + serviceChargesAmt + edsAmt + courierChargesAmt);

  return { pricePerUnit: fobPerCarton, unit: "carton", currency: "USD" };
}

async function riceSellingPrice(productId: string) {
  const { data: product } = await supabase.from("rice_products").select("*").eq("id", productId).single();
  if (!product) return null;

  // rice_master is one table with a "kind" discriminator ('charge'/'byproduct'/'bag')
  const { data: masterRows } = await supabase.from("rice_master").select("*").eq("kind", "charge");
  const { data: settingsRows } = await supabase.from("rice_settings").select("key, value");
  const settings: Record<string, string> = {};
  for (const row of settingsRows ?? []) if (row.key) settings[row.key] = row.value ?? "";

  // by-products are stored as a JSON column directly on the product row, not a separate table
  const byproducts = Array.isArray(product.byproducts) ? product.byproducts : [];

  const riceProduct: RiceProduct = {
    id: product.id, sku: product.sku ?? "", name: product.name ?? "", brandId: product.brand_id ?? "",
    category: product.category ?? "", imageUrl: product.image_url ?? "", packagingDesc: product.packaging_desc ?? "",
    quantity: Number(product.quantity) || 1000,
    recoveryPct: Number(product.recovery_pct) || 90,
    purchaseRate: Number(product.purchase_rate) || 0,
    freight: Number(product.freight) || 0,
    profit: Number(product.profit ?? 50),
    fcRate: Number(product.fc_rate ?? 0),
    byproducts: byproducts.map((b: { name?: string; percent?: number; rate?: number }) => ({
      name: b.name ?? "", percent: Number(b.percent) || 0, rate: Number(b.rate) || 0,
    })),
    active: product.active !== false,
  };

  const riceMaster: RiceMaster = {
    byproducts: [],
    charges: (masterRows ?? []).map(c => ({ id: c.id, name: c.name ?? "", rate: Number(c.rate) || 0, sortOrder: Number(c.sort_order) || 0 })),
  };

  const num = (k: string, d: number) => (settings[k] !== undefined && settings[k] !== "" ? parseFloat(settings[k]) : d);
  const riceSettings: RiceSettings = {
    fcRate: num("fcRate", 270), whtPct: num("whtPct", 0), servicePct: num("servicePct", 0),
    edsPct: num("edsPct", 0), courierPct: num("courierPct", 0), interestPct: num("interestPct", 0),
    profit: num("profit", 0), packagingMaterial: num("packagingMaterial", 0),
    defaultFreight: num("defaultFreight", 0), bagDollarRate: num("bagDollarRate", 275), bagOverheadPct: num("bagOverheadPct", 15),
  };

  const calc = calcRice(riceProduct, riceMaster, riceSettings);
  return { pricePerUnit: calc.fobPerPmt, unit: "PMT", currency: "USD" };
}

export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const productId = url.searchParams.get("productId");
    const division = url.searchParams.get("division");
    if (!productId || !division) return Response.json({ error: "productId and division required" }, { status: 400 });

    const result = division === "rice" ? await riceSellingPrice(productId) : await foodSellingPrice(productId);
    if (!result) return Response.json({ error: "Product not found" }, { status: 404 });

    return Response.json(result);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
