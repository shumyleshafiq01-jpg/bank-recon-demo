// ════════════════════════════════════════════════════════════════════════
// RICE COSTING ENGINE
// ════════════════════════════════════════════════════════════════════════
// Rice is costed completely differently from Food & Spices (which is a
// carton-based recipe/BOM). Rice is priced PER METRIC TON (PMT) and is built
// up from raw paddy, minus the resale value of milling by-products, plus
// milling/handling charges, finance charges, profit and packaging.
//
// This function reproduces Kafi's ERP "RICE COASTING" sheet to the paisa.
// Verified against the sample export (product 1121 - SELLA - NEW):
//   qty 1000 kg, recovery 90%, purchase 300, fc 270, profit 50, packaging 6
//   → FOB / CNF = 1362.99 USD  (1 PMT)
//
// The model:
//   rawInput      = quantity / (recovery% / 100)          // paddy needed
//   rawCost       = rawInput * purchaseRate               // PKR
//   byproductCred = Σ (percent% * rawInput * byproductRate)// PKR (resale value)
//   netHead       = rawCost - byproductCred               // PKR
//   netHeadPerKg  = netHead / quantity                     // PKR/kg finished
//   chargePerKg   = Σ milling/handling charges (PKR/kg)
//   totalPerKg    = netHeadPerKg + chargePerKg             // PKR/kg
//   usdTotal      = totalPerKg * quantity / fcRate         // USD for the lot
//   bankCharges   = usdTotal * (finance% total / 100)      // USD
//   fob           = usdTotal + bankCharges + profit + packagingMaterial
//   cnf           = fob + freight
//   perPmt        = fob / (quantity / 1000)                // USD per metric ton

export interface RiceByproductRate { id: string; name: string; rate: number; sortOrder: number; }   // PKR/kg resale value (master)
export interface RiceChargeRate    { id: string; name: string; rate: number; sortOrder: number; }   // PKR/kg milling/handling (master)

export interface RiceMaster {
  byproducts: RiceByproductRate[];
  charges: RiceChargeRate[];
}

export interface RiceSettings {
  fcRate: number;          // PKR → USD
  whtPct: number;          // finance charges (% of USD total)
  servicePct: number;
  edsPct: number;
  courierPct: number;
  interestPct: number;
  profit: number;          // flat USD per shipment
  packagingMaterial: number; // flat USD per shipment
  defaultFreight: number;  // USD, for CNF
}

// A rice product's own by-product breakdown line. By-products vary per product,
// so each line carries its own name, recovery percentage AND resale rate
// (PKR/kg) — there is no shared master by-product table.
export interface RiceProductByproduct { name: string; percent: number; rate: number; }

export interface RiceProduct {
  id: string;
  sku: string;
  name: string;
  brandId: string;
  category: string;
  imageUrl: string;
  packagingDesc: string;
  quantity: number;        // kg basis for the sheet (default 1000 = 1 PMT)
  recoveryPct: number;     // milling yield, e.g. 90
  purchaseRate: number;    // PKR/kg of raw paddy
  freight: number;         // USD (per lot) for CNF; 0 = FOB only
  byproducts: RiceProductByproduct[];
  active: boolean;
}

export interface RiceCalc {
  rawInput: number;         // kg paddy needed
  rawCost: number;          // PKR
  byproductCredit: number;  // PKR
  netHead: number;          // PKR
  netHeadPerKg: number;     // PKR/kg
  chargePerKg: number;      // PKR/kg
  totalPerKg: number;       // PKR/kg
  usdTotal: number;         // USD for the entered quantity
  financePct: number;       // %
  bankCharges: number;      // USD
  fob: number;              // USD (total for the lot)
  cnf: number;              // USD (total for the lot)
  fobPerPmt: number;        // USD per metric ton
  cnfPerPmt: number;        // USD per metric ton
  tons: number;             // quantity / 1000
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function calcRice(product: RiceProduct, master: RiceMaster, settings: RiceSettings): RiceCalc {
  const qty = product.quantity || 1000;
  const recovery = product.recoveryPct || 100;
  const rawInput = qty / (recovery / 100);
  const rawCost = rawInput * (product.purchaseRate || 0);

  let byproductCredit = 0;
  for (const bp of product.byproducts) {
    // The ERP rounds each by-product's input quantity to 2 decimals (as shown
    // in its INPUT QUANTITY column) before multiplying by the rate — replicate
    // that so our totals tie out to the accountant's sheet to the paisa.
    const kg = r2((bp.percent / 100) * rawInput);
    byproductCredit += kg * (bp.rate || 0);
  }

  const netHead = rawCost - byproductCredit;
  const netHeadPerKg = netHead / qty;
  const chargePerKg = master.charges.reduce((s, c) => s + (c.rate || 0), 0);
  const totalPerKg = netHeadPerKg + chargePerKg;

  const fc = settings.fcRate || 270;
  const usdTotal = (totalPerKg * qty) / fc;

  const financePct = (settings.whtPct || 0) + (settings.servicePct || 0) + (settings.edsPct || 0) +
    (settings.courierPct || 0) + (settings.interestPct || 0);
  const bankCharges = usdTotal * (financePct / 100);

  const fob = usdTotal + bankCharges + (settings.profit || 0) + (settings.packagingMaterial || 0);
  const freight = product.freight || 0;
  const cnf = fob + freight;

  const tons = qty / 1000 || 1;

  return {
    rawInput: r2(rawInput),
    rawCost: r2(rawCost),
    byproductCredit: r2(byproductCredit),
    netHead: r2(netHead),
    netHeadPerKg: r2(netHeadPerKg),
    chargePerKg: r2(chargePerKg),
    totalPerKg: r2(totalPerKg),
    usdTotal: r2(usdTotal),
    financePct: r2(financePct),
    bankCharges: r2(bankCharges),
    fob: r2(fob),
    cnf: r2(cnf),
    fobPerPmt: r2(fob / tons),
    cnfPerPmt: r2(cnf / tons),
    tons: r2(tons),
  };
}

// Sensible seed data matching the sample sheet — used to pre-fill a fresh
// Rice division so the accountant has something recognisable to review/adjust.
export const RICE_DEFAULT_BYPRODUCTS: { name: string; rate: number }[] = [
  { name: "BROKEN/B2", rate: 90 },
  { name: "CSR", rate: 140 },
  { name: "PADDY", rate: 80 },
  { name: "PONIA", rate: 110 },
  { name: "CHOBA", rate: 0 },
  { name: "NIKO", rate: 50 },
  { name: "POWDER", rate: 35 },
  { name: "STONE + RICE", rate: 50 },
  { name: "SWEEPING", rate: 145 },
  { name: "SHORT GRAIN", rate: 140 },
  { name: "WEIGHT LOSS", rate: -300 },
];

export const RICE_DEFAULT_CHARGES: { name: string; rate: number }[] = [
  { name: "MILLING", rate: 4.75 },
  { name: "PACKING + PRINTING", rate: 1.00 },
  { name: "CONE", rate: 0.58 },
  { name: "FUMIGATION", rate: 0.23 },
  { name: "INSPECTION", rate: 0.19 },
  { name: "CLEARING", rate: 1.00 },
  { name: "SGS", rate: 6.25 },
  { name: "GODAMI", rate: 0.04 },
  { name: "ADMINISTRATIVE EXPENSE", rate: 0.75 },
];

// Default per-product by-product breakdown from the sample sheet (name, %, rate).
// A fresh rice product is pre-filled with these; the accountant then edits,
// adds or removes lines to match that specific product's actual by-products.
export const RICE_DEFAULT_PRODUCT_BYPRODUCTS: RiceProductByproduct[] = [
  { name: "BROKEN/B2", percent: 1.65, rate: 90 },
  { name: "CSR", percent: 1.50, rate: 140 },
  { name: "PADDY", percent: 0.00, rate: 80 },
  { name: "PONIA", percent: 1.00, rate: 110 },
  { name: "CHOBA", percent: 0.00, rate: 0 },
  { name: "NIKO", percent: 0.05, rate: 50 },
  { name: "POWDER", percent: 2.04, rate: 35 },
  { name: "STONE + RICE", percent: 0.05, rate: 50 },
  { name: "SWEEPING", percent: 1.67, rate: 145 },
  { name: "SHORT GRAIN", percent: 1.49, rate: 140 },
  { name: "WEIGHT LOSS", percent: 0.55, rate: -300 },
];

export const RICE_DEFAULT_SETTINGS: RiceSettings = {
  fcRate: 270,
  whtPct: 2.00,
  servicePct: 0.16,
  edsPct: 0.25,
  courierPct: 0.02,
  interestPct: 1.70,
  profit: 50,
  packagingMaterial: 6,
  defaultFreight: 0,
};
