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

// A bag-packaging option. Its $/PMT surcharge is CALCULATED from component costs
// (outer bag + inner bag + master outer + labour, + overhead%) — see
// calcBagRate. Added at CNF time on top of freight. Bag types (NON WOVEN, PP,
// PLASTIC, BOPP…) and sizes are all maintained in the bag calculator; new types
// can be added freely.
export interface RiceBag {
  id: string;
  type: string;        // NON WOVEN, PP, PLASTIC, BOPP…
  sizeLabel: string;   // e.g. "5 KG X 4"
  outerQty: number;    // outer bags per PMT
  outerPKR: number;    // PKR per outer bag
  innerQty: number;    // inner bags per PMT
  innerPKR: number;    // PKR per inner bag
  masterQty: number;   // master-outer bags per PMT
  masterPKR: number;   // PKR per master-outer bag
  labourPKR: number;   // PKR labour per master-outer bag
  sortOrder: number;
}

export interface RiceBagCalc { material: number; labour: number; overhead: number; finalPmt: number; }

// Reproduces Hafeez's "Rice Bags Rates" sheet exactly:
//   material = (outerQty·outerPKR + innerQty·innerPKR + masterQty·masterPKR) / $rate
//   labour   = labourPKR · masterQty / $rate
//   overhead = material · overhead%
//   FINAL $/PMT = material + overhead + labour
export function calcBagRate(bag: RiceBag, dollarRate: number, overheadPct: number): RiceBagCalc {
  const dr = dollarRate || 275;
  const material = (bag.outerQty * bag.outerPKR + bag.innerQty * bag.innerPKR + bag.masterQty * bag.masterPKR) / dr;
  const labour = (bag.labourPKR * bag.masterQty) / dr;
  const overhead = material * ((overheadPct || 0) / 100);
  const r = (n: number) => Math.round(n * 100) / 100;
  return { material: r(material), labour: r(labour), overhead: r(overhead), finalPmt: r(material + overhead + labour) };
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
  bagDollarRate: number;   // PKR→USD used in the bag calculator (editable; ~280 today)
  bagOverheadPct: number;  // overhead % applied to bag material cost (15% on the sheet)
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
  profit: number;          // USD per shipment (was global, now per-product)
  fcRate: number;           // PKR→USD conversion rate (was global, now per-product)
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

  const fc = (product.fcRate !== undefined && product.fcRate !== null && product.fcRate > 0) ? product.fcRate : (settings.fcRate || 270);
  const usdTotal = (totalPerKg * qty) / fc;

  const financePct = (settings.whtPct || 0) + (settings.servicePct || 0) + (settings.edsPct || 0) +
    (settings.courierPct || 0) + (settings.interestPct || 0);
  const bankCharges = usdTotal * (financePct / 100);

  const profit = product.profit !== undefined && product.profit !== null ? product.profit : (settings.profit || 0);
  const fob = usdTotal + bankCharges + profit + (settings.packagingMaterial || 0);
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

// Bag component prices — seeded from Hafeez's "Rice Bags Rates" sheet (NON WOVEN,
// all 8 sizes). The accountant maintains these and adds other types (PP/PLASTIC/
// BOPP) later; the $/PMT is computed from them via calcBagRate.
export const RICE_DEFAULT_BAGS: Omit<RiceBag, "id" | "sortOrder">[] = [
  { type: "NON WOVEN", sizeLabel: "40 KG X 1", outerQty: 25,  outerPKR: 120, innerQty: 25,  innerPKR: 25,    masterQty: 25, masterPKR: 35,   labourPKR: 30 },
  { type: "NON WOVEN", sizeLabel: "35 KG X 1", outerQty: 29,  outerPKR: 104, innerQty: 25,  innerPKR: 22.5,  masterQty: 25, masterPKR: 33,   labourPKR: 30 },
  { type: "NON WOVEN", sizeLabel: "30 KG X 1", outerQty: 34,  outerPKR: 92,  innerQty: 34,  innerPKR: 20,    masterQty: 34, masterPKR: 28.5, labourPKR: 30 },
  { type: "NON WOVEN", sizeLabel: "25 KG X 1", outerQty: 40,  outerPKR: 85,  innerQty: 40,  innerPKR: 20,    masterQty: 34, masterPKR: 28.5, labourPKR: 30 },
  { type: "NON WOVEN", sizeLabel: "20 KG X 1", outerQty: 50,  outerPKR: 80,  innerQty: 50,  innerPKR: 19.55, masterQty: 50, masterPKR: 25,   labourPKR: 30 },
  { type: "NON WOVEN", sizeLabel: "10 KG X 2", outerQty: 100, outerPKR: 70,  innerQty: 100, innerPKR: 15.52, masterQty: 50, masterPKR: 25,   labourPKR: 30 },
  { type: "NON WOVEN", sizeLabel: "5 KG X 4",  outerQty: 200, outerPKR: 45,  innerQty: 200, innerPKR: 14.37, masterQty: 50, masterPKR: 25,   labourPKR: 30 },
  { type: "NON WOVEN", sizeLabel: "2.5 KG X 8", outerQty: 400, outerPKR: 35, innerQty: 400, innerPKR: 8.5,   masterQty: 25, masterPKR: 35,   labourPKR: 30 },
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
  bagDollarRate: 280,
  bagOverheadPct: 15,
};
