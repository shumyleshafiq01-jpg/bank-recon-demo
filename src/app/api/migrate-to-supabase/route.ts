import { readSheet } from "@/lib/google-sheets";
import { supabase } from "@/lib/supabase";

// One-time migration: reads all Google Sheets data and inserts into Supabase.
// Hit GET /api/migrate-to-supabase once, then delete this file.

interface SheetMapping {
  sheet: string;
  table: string;
  headers: string[];
  dbCols: string[];
  transform?: (row: Record<string, string>) => Record<string, unknown>;
}

function boolVal(v: string | undefined, fallback = false): boolean {
  if (!v) return fallback;
  if (v === "true") return true;
  if (v === "false") return false;
  return fallback;
}
function numVal(v: string | undefined, fallback = 0): number {
  if (!v || v === "") return fallback;
  const n = parseFloat(v);
  return isNaN(n) ? fallback : n;
}
function numOrNull(v: string | undefined): number | null {
  if (!v || v === "") return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}
function jsonVal(v: string | undefined, fallback: unknown = []): unknown {
  if (!v || v === "") return fallback;
  try { return JSON.parse(v); } catch { return fallback; }
}

const MAPPINGS: SheetMapping[] = [
  {
    sheet: "PL_Brands", table: "pl_brands",
    headers: ["id", "name", "address", "city", "country", "logoUrl", "createdAt", "contactPerson", "website", "email"],
    dbCols: ["id", "name", "address", "city", "country", "logo_url", "created_at", "contact_person", "website", "email"],
  },
  {
    sheet: "PL_Categories", table: "pl_categories",
    headers: ["id", "name", "createdAt"],
    dbCols: ["id", "name", "created_at"],
  },
  {
    sheet: "PL_Master", table: "pl_master",
    headers: ["id", "name", "unit", "category", "pricePerUnit", "updatedAt", "defaultUnitType"],
    dbCols: ["id", "name", "unit", "category", "price_per_unit", "updated_at", "default_unit_type"],
    transform: (r) => ({
      id: r.id, name: r.name, unit: r.unit, category: r.category,
      price_per_unit: numVal(r.pricePerUnit), updated_at: r.updatedAt || "", default_unit_type: r.defaultUnitType || "PCS",
    }),
  },
  {
    sheet: "PL_Products", table: "pl_products",
    headers: ["id", "sku", "name", "productType", "fclQty", "grossProfitPct", "imageUrl", "notes", "active", "specs", "packagingDesc", "brandId", "category"],
    dbCols: ["id", "sku", "name", "product_type", "fcl_qty", "gross_profit_pct", "image_url", "notes", "active", "specs", "packaging_desc", "brand_id", "category"],
    transform: (r) => ({
      id: r.id, sku: r.sku || "", name: r.name || "", product_type: r.productType || "FINISH GOODS",
      fcl_qty: numVal(r.fclQty, 1500), gross_profit_pct: numVal(r.grossProfitPct, 50),
      image_url: r.imageUrl || "", notes: r.notes || "", active: boolVal(r.active, true),
      specs: r.specs || "", packaging_desc: r.packagingDesc || "", brand_id: r.brandId || "", category: r.category || "",
    }),
  },
  {
    sheet: "PL_Recipes", table: "pl_recipes",
    headers: ["id", "productId", "materialId", "materialName", "qty", "unitType", "sortOrder", "priceOverride"],
    dbCols: ["id", "product_id", "material_id", "material_name", "qty", "unit_type", "sort_order", "price_override"],
    transform: (r) => ({
      id: r.id, product_id: r.productId || "", material_id: r.materialId || "",
      material_name: r.materialName || "", qty: numVal(r.qty), unit_type: r.unitType || "PCS",
      sort_order: numVal(r.sortOrder), price_override: numOrNull(r.priceOverride),
    }),
  },
  {
    sheet: "PL_MaterialLists", table: "pl_material_lists",
    headers: ["id", "type", "name", "createdAt"],
    dbCols: ["id", "type", "name", "created_at"],
  },
  {
    sheet: "PL_Settings", table: "pl_settings",
    headers: ["key", "value"],
    dbCols: ["key", "value"],
  },
  {
    sheet: "RICE_Brands", table: "rice_brands",
    headers: ["id", "name", "address", "city", "country", "logoUrl", "createdAt", "contactPerson", "website", "email"],
    dbCols: ["id", "name", "address", "city", "country", "logo_url", "created_at", "contact_person", "website", "email"],
  },
  {
    sheet: "RICE_Categories", table: "rice_categories",
    headers: ["id", "name", "createdAt"],
    dbCols: ["id", "name", "created_at"],
  },
  {
    sheet: "RICE_Products", table: "rice_products",
    headers: ["id", "sku", "name", "brandId", "category", "imageUrl", "packagingDesc", "quantity", "recoveryPct", "purchaseRate", "freight", "byproducts", "active"],
    dbCols: ["id", "sku", "name", "brand_id", "category", "image_url", "packaging_desc", "quantity", "recovery_pct", "purchase_rate", "freight", "byproducts", "active"],
    transform: (r) => ({
      id: r.id, sku: r.sku || "", name: r.name || "", brand_id: r.brandId || "", category: r.category || "",
      image_url: r.imageUrl || "", packaging_desc: r.packagingDesc || "",
      quantity: numVal(r.quantity, 1000), recovery_pct: numVal(r.recoveryPct, 90),
      purchase_rate: numVal(r.purchaseRate), freight: numVal(r.freight),
      byproducts: jsonVal(r.byproducts, []), active: boolVal(r.active, true),
    }),
  },
  {
    sheet: "RICE_Master", table: "rice_master",
    headers: ["id", "kind", "name", "rate", "sortOrder"],
    dbCols: ["id", "kind", "name", "rate", "sort_order"],
    transform: (r) => ({
      id: r.id, kind: r.kind || "charge", name: r.name || "",
      rate: numVal(r.rate), sort_order: numVal(r.sortOrder),
    }),
  },
  {
    sheet: "RICE_Settings", table: "rice_settings",
    headers: ["key", "value"],
    dbCols: ["key", "value"],
  },
  {
    sheet: "RICE_Bags", table: "rice_bags",
    headers: ["id", "type", "sizeLabel", "outerQty", "outerPKR", "innerQty", "innerPKR", "masterQty", "masterPKR", "labourPKR", "sortOrder"],
    dbCols: ["id", "type", "size_label", "outer_qty", "outer_pkr", "inner_qty", "inner_pkr", "master_qty", "master_pkr", "labour_pkr", "sort_order"],
    transform: (r) => ({
      id: r.id, type: r.type || "", size_label: r.sizeLabel || "",
      outer_qty: numVal(r.outerQty), outer_pkr: numVal(r.outerPKR),
      inner_qty: numVal(r.innerQty), inner_pkr: numVal(r.innerPKR),
      master_qty: numVal(r.masterQty), master_pkr: numVal(r.masterPKR),
      labour_pkr: numVal(r.labourPKR), sort_order: numVal(r.sortOrder),
    }),
  },
  {
    sheet: "CNF_Quotes", table: "cnf_quotes",
    headers: ["id", "quoteNo", "clientName", "clientContact", "destination", "country", "generatedAt", "validTill", "status", "createdBy", "brandKafi", "brandEssence", "notes", "productsSnapshot", "quoteType", "discountType", "discountScope", "discountValue", "discountAmount", "discountProductIds", "shipmentPort", "shippingMode", "leadTime"],
    dbCols: ["id", "quote_no", "client_name", "client_contact", "destination", "country", "generated_at", "valid_till", "status", "created_by", "brand_kafi", "brand_essence", "notes", "products_snapshot", "quote_type", "discount_type", "discount_scope", "discount_value", "discount_amount", "discount_product_ids", "shipment_port", "shipping_mode", "lead_time"],
    transform: (r) => ({
      id: r.id, quote_no: r.quoteNo || "", client_name: r.clientName || "",
      client_contact: r.clientContact || "", destination: r.destination || "",
      country: r.country || "", generated_at: r.generatedAt || "", valid_till: r.validTill || "",
      status: r.status || "active", created_by: r.createdBy || "",
      brand_kafi: boolVal(r.brandKafi, true), brand_essence: boolVal(r.brandEssence, false),
      notes: r.notes || "", products_snapshot: jsonVal(r.productsSnapshot, []),
      quote_type: r.quoteType || "CNF", discount_type: r.discountType || "none",
      discount_scope: r.discountScope || "all", discount_value: numVal(r.discountValue),
      discount_amount: numVal(r.discountAmount), discount_product_ids: jsonVal(r.discountProductIds, []),
      shipment_port: r.shipmentPort || "Karachi Port", shipping_mode: r.shippingMode || "By Sea",
      lead_time: r.leadTime || "30 to 35 Working Days",
    }),
  },
  {
    sheet: "CNF_MasterFreight", table: "cnf_master_freight",
    headers: ["id", "destination", "country", "freightPerCarton", "currency", "updatedAt"],
    dbCols: ["id", "destination", "country", "freight_per_carton", "currency", "updated_at"],
    transform: (r) => ({
      id: r.id, destination: r.destination || "", country: r.country || "",
      freight_per_carton: numVal(r.freightPerCarton), currency: r.currency || "USD", updated_at: r.updatedAt || "",
    }),
  },
  {
    sheet: "FE_Banks", table: "fe_banks",
    headers: ["id", "bankName", "branch", "acTitle", "accountNo", "iban", "accountType", "branchCode", "notes", "internetBanking", "stamp", "signatureAuthority", "mandateHolder", "maintainBalance", "openingBalance", "openingDate"],
    dbCols: ["id", "bank_name", "branch", "ac_title", "account_no", "iban", "account_type", "branch_code", "notes", "internet_banking", "stamp", "signature_authority", "mandate_holder", "maintain_balance", "opening_balance", "opening_date"],
    transform: (r) => ({
      id: r.id, bank_name: r.bankName || "", branch: r.branch || "",
      ac_title: r.acTitle || "", account_no: r.accountNo || "", iban: r.iban || "",
      account_type: r.accountType || "", branch_code: r.branchCode || "", notes: r.notes || "",
      internet_banking: r.internetBanking || "", stamp: r.stamp || "",
      signature_authority: r.signatureAuthority || "", mandate_holder: r.mandateHolder || "",
      maintain_balance: r.maintainBalance || "", opening_balance: numVal(r.openingBalance),
      opening_date: r.openingDate || "",
    }),
  },
  {
    sheet: "FE_Ledger", table: "fe_ledger",
    headers: ["accountId", "id", "date", "pdcDate", "ibftNo", "chequeNo", "description", "debit", "credit", "aa1Tick", "aa1At", "aa2Tick", "aa2At"],
    dbCols: ["account_id", "id", "date", "pdc_date", "ibft_no", "cheque_no", "description", "debit", "credit", "aa1_tick", "aa1_at", "aa2_tick", "aa2_at"],
    transform: (r) => ({
      account_id: r.accountId || "", id: r.id, date: r.date || "", pdc_date: r.pdcDate || "",
      ibft_no: r.ibftNo || "", cheque_no: r.chequeNo || "", description: r.description || "",
      debit: numOrNull(r.debit), credit: numOrNull(r.credit),
      aa1_tick: boolVal(r.aa1Tick), aa1_at: r.aa1At || "",
      aa2_tick: boolVal(r.aa2Tick), aa2_at: r.aa2At || "",
    }),
  },
  {
    sheet: "FE_Notifications", table: "fe_notifications",
    headers: ["id", "message", "target", "createdAt", "active"],
    dbCols: ["id", "message", "target", "created_at", "active"],
    transform: (r) => ({
      id: r.id, message: r.message || "", target: r.target || "both",
      created_at: r.createdAt || "", active: boolVal(r.active, true),
    }),
  },
  {
    sheet: "FE_NotifDone", table: "fe_notif_done",
    headers: ["notifId", "role", "markedAt"],
    dbCols: ["notif_id", "role", "marked_at"],
    transform: (r) => ({ notif_id: r.notifId || "", role: r.role || "", marked_at: r.markedAt || "" }),
  },
  {
    sheet: "PC_Ledger", table: "pc_ledger",
    headers: ["id", "date", "acHead", "txnNo", "purpose", "approvedBy", "cashOut", "cashIn", "holder"],
    dbCols: ["id", "date", "ac_head", "txn_no", "purpose", "approved_by", "cash_out", "cash_in", "holder"],
    transform: (r) => ({
      id: r.id, date: r.date || "", ac_head: r.acHead || "", txn_no: r.txnNo || "",
      purpose: r.purpose || "", approved_by: r.approvedBy || "",
      cash_out: numOrNull(r.cashOut), cash_in: numOrNull(r.cashIn), holder: r.holder || "main",
    }),
  },
  {
    sheet: "PC_Config", table: "pc_config",
    headers: ["key", "value"],
    dbCols: ["key", "value"],
  },
  {
    sheet: "PC_Denominations", table: "pc_denominations",
    headers: ["id", "date", "holder", "denominationsJson", "total", "countedBy", "createdAt"],
    dbCols: ["id", "date", "holder", "denominations_json", "total", "counted_by", "created_at"],
    transform: (r) => ({
      id: r.id, date: r.date || "", holder: r.holder || "",
      denominations_json: jsonVal(r.denominationsJson, {}), total: numVal(r.total),
      counted_by: r.countedBy || "", created_at: r.createdAt || "",
    }),
  },
  {
    sheet: "PC_Handovers", table: "pc_handovers",
    headers: ["id", "date", "holder", "amount", "notes", "givenBy", "createdAt"],
    dbCols: ["id", "date", "holder", "amount", "notes", "given_by", "created_at"],
    transform: (r) => ({
      id: r.id, date: r.date || "", holder: r.holder || "",
      amount: numVal(r.amount), notes: r.notes || "", given_by: r.givenBy || "", created_at: r.createdAt || "",
    }),
  },
  {
    sheet: "VB_Vendors", table: "vb_vendors",
    headers: ["id", "vendorName", "contactPerson", "commodity", "phone", "bank", "acTitle", "acNo", "branchCode", "notes"],
    dbCols: ["id", "vendor_name", "contact_person", "commodity", "phone", "bank", "ac_title", "ac_no", "branch_code", "notes"],
  },
  {
    sheet: "SC_Suppliers", table: "sc_suppliers",
    headers: ["id", "category", "companyName", "contactPerson", "jobTitle", "phone", "service", "address", "city", "product", "visitStatus", "grading", "notes"],
    dbCols: ["id", "category", "company_name", "contact_person", "job_title", "phone", "service", "address", "city", "product", "visit_status", "grading", "notes"],
  },
  {
    sheet: "EmpBankDetails", table: "emp_bank_details",
    headers: ["id", "name", "designation", "phone", "bank", "acTitle", "acNo", "branchCode", "notes"],
    dbCols: ["id", "name", "designation", "phone", "bank", "ac_title", "ac_no", "branch_code", "notes"],
  },
  {
    sheet: "BankContacts", table: "bank_contacts",
    headers: ["id", "name", "designation", "phone", "ptcl", "email", "bankBranch", "notes"],
    dbCols: ["id", "name", "designation", "phone", "ptcl", "email", "bank_branch", "notes"],
  },
  {
    sheet: "Reminders", table: "reminders",
    headers: ["id", "message", "target", "dueDate", "frequency", "createdAt", "active"],
    dbCols: ["id", "message", "target", "due_date", "frequency", "created_at", "active"],
    transform: (r) => ({
      id: r.id, message: r.message || "", target: r.target || "all",
      due_date: r.dueDate || "", frequency: r.frequency || "one-time",
      created_at: r.createdAt || "", active: boolVal(r.active, true),
    }),
  },
  {
    sheet: "RemindersDone", table: "reminders_done",
    headers: ["reminderId", "role", "markedAt"],
    dbCols: ["reminder_id", "role", "marked_at"],
    transform: (r) => ({ reminder_id: r.reminderId || "", role: r.role || "", marked_at: r.markedAt || "" }),
  },
  {
    sheet: "DeptAPIKeys", table: "dept_api_keys",
    headers: ["id", "deptName", "apiKey", "createdAt", "active"],
    dbCols: ["id", "dept_name", "api_key", "created_at", "active"],
    transform: (r) => ({
      id: r.id, dept_name: r.deptName || "", api_key: r.apiKey || "",
      created_at: r.createdAt || "", active: boolVal(r.active, true),
    }),
  },
  {
    sheet: "APIUsageLogs", table: "api_usage_logs",
    headers: ["timestamp", "deptId", "deptName", "module", "model", "inputTokens", "outputTokens", "costUSD"],
    dbCols: ["timestamp", "dept_id", "dept_name", "module", "model", "input_tokens", "output_tokens", "cost_usd"],
    transform: (r) => ({
      timestamp: r.timestamp || "", dept_id: r.deptId || "", dept_name: r.deptName || "",
      module: r.module || "", model: r.model || "",
      input_tokens: numVal(r.inputTokens), output_tokens: numVal(r.outputTokens), cost_usd: numVal(r.costUSD),
    }),
  },
  {
    sheet: "DashboardConfig", table: "dashboard_config",
    headers: ["key", "value"],
    dbCols: ["key", "value"],
  },
  {
    sheet: "DirectoryConfig", table: "directory_config",
    headers: ["key", "value"],
    dbCols: ["key", "value"],
  },
];

async function migrateSheet(m: SheetMapping): Promise<{ sheet: string; rows: number; error?: string }> {
  try {
    const raw = await readSheet(m.sheet);
    if (raw.length <= 1) return { sheet: m.sheet, rows: 0 };

    const dataRows = raw.slice(1).filter(r => r.some(c => c && c.trim()));
    if (dataRows.length === 0) return { sheet: m.sheet, rows: 0 };

    const records = dataRows.map(row => {
      const obj: Record<string, string> = {};
      m.headers.forEach((h, i) => { obj[h] = row[i] ?? ""; });

      if (m.transform) return m.transform(obj);

      const dbObj: Record<string, string> = {};
      m.headers.forEach((h, i) => { dbObj[m.dbCols[i]] = row[i] ?? ""; });
      return dbObj;
    }).filter(r => {
      const pk = Object.values(r)[0];
      return pk && String(pk).trim();
    });

    if (records.length === 0) return { sheet: m.sheet, rows: 0 };

    const batchSize = 500;
    let inserted = 0;
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      const { error } = await supabase.from(m.table).upsert(batch as Record<string, unknown>[], { onConflict: m.dbCols[0] === "account_id" ? "account_id,id" : m.table === "api_usage_logs" ? "id" : m.dbCols[0] });
      if (error) return { sheet: m.sheet, rows: inserted, error: error.message };
      inserted += batch.length;
    }

    return { sheet: m.sheet, rows: inserted };
  } catch (err) {
    return { sheet: m.sheet, rows: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function GET() {
  const results = [];
  for (const m of MAPPINGS) {
    const r = await migrateSheet(m);
    results.push(r);
  }
  const totalRows = results.reduce((s, r) => s + r.rows, 0);
  const errors = results.filter(r => r.error);
  return Response.json({ totalRows, totalSheets: results.length, errors: errors.length, results });
}
