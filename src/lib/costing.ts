export interface CostMaterial { id: string; name: string; unit: string; category: string; pricePerUnit: number; updatedAt: string; }
export interface CostProduct { id: string; sku: string; name: string; productType: string; fclQty: number; grossProfitPct: number; imageUrl: string; notes: string; active: boolean; specs?: string; packagingDesc?: string; }
export interface CostRecipeItem { id: string; productId: string; materialId: string; materialName: string; qty: number; unitType: "PCS" | "CONTAINER" | "FIXED"; sortOrder: number; }
export interface CostSettings { fcRate: number; currency: string; targetCurrency: string; adminPct: number; whtPct: number; serviceCharges: number; eds: number; courierCharges: number; }

export function calcCost(recipe: CostRecipeItem[], materials: CostMaterial[], product: CostProduct, settings: CostSettings, quoteQty = 1) {
  const matMap = new Map(materials.map(m => [m.id, m]));
  let pcsCOG = 0;   // scales with quoteQty
  let fixedCOG = 0; // stays same regardless of qty
  for (const item of recipe) {
    const price = matMap.get(item.materialId)?.pricePerUnit ?? 0;
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
  const fobTotal    = r(sellingUSD + whtUSD + settings.serviceCharges + settings.eds + settings.courierCharges);
  const fobPerCarton = r(fobTotal / quoteQty);
  return { cogPerCarton, cogTotal, adminAmt, cogWithAdmin, cogUSD, sellingUSD, sellingPerCarton, whtUSD, fobTotal, fobPerCarton };
}
