// Knowledge base for the platform-wide "Kafi Assistant" help chatbot.
// This is a HELP assistant: it explains how to use the platform's modules
// and answers export/costing/supply-chain process questions. It does not
// take actions on the user's behalf (yet) — it guides.
//
// Each module entry is keyed by a route prefix so the assistant can give
// answers scoped to wherever the user currently is.

export interface ModuleDoc {
  routePrefix: string;
  name: string;
  summary: string;
  howTo: string[];
}

export const MODULES: ModuleDoc[] = [
  {
    routePrefix: "/dashboard",
    name: "AI Agent Finance",
    summary: "Bank reconciliation, credit-card verification, expense analysis, and quotation comparison.",
    howTo: [
      "Upload a bank statement and a journal ledger, then run the reconciliation to see matched entries, missing entries on either side, and suggested corrective journal entries.",
      "The credit-card, expense-analyzer, and quotation-comparison tools each take an uploaded file and return a structured AI analysis.",
    ],
  },
  {
    routePrefix: "/product-list",
    name: "Product List / Recipes / Price List",
    summary: "Product catalogue, recipe/BOM management, live costing, and price-list generation. Split into a Food division and a Rice division via the division dropdown.",
    howTo: [
      "Selling price is always COMPUTED from cost + gross-profit% / settings — there is no stored price column. Food uses the recipe + settings costing; Rice uses the per-PMT rice costing engine.",
      "Use the division dropdown at the top to switch between Food and Rice. Rice products carry per-product by-products and bag packaging ($/PMT).",
    ],
  },
  {
    routePrefix: "/cost-budgeting",
    name: "Cost / Budgeting",
    summary: "Reverse Costing (competitor price → implied cost) and Forward Costing (our cost → suggested price).",
    howTo: [
      "Reverse Costing: create a comparison sheet, then add a row per competitor price you found. Margin is a % of the SELLING price (not markup-on-cost): implied cost = price × (1 − margin%). Toggle 'Go all the way to FOB' to also strip freight/duty/clearance.",
      "Use 'Find Prices' to auto-fetch: paste product-page URLs under 'Target Links' and the AI reads the price off each page, or use 'Google Search' (needs the Google Custom Search key configured) to discover candidate pages by country/category.",
      "Tick 'Own' on a row for Kafi's own listed price, and use the magnifying-glass to pull it live from the Product List.",
      "Forward Costing: enter Kafi's own cost and it suggests a selling price at each target markup.",
    ],
  },
  {
    routePrefix: "/supply-chain",
    name: "Supply Chain Agent",
    summary: "CBM calculator, packing plans, BOM, purchase orders, GRN, shipment tracking, sales-history suggestions, and low-stock alerts.",
    howTo: [
      "The CBM Calculator plans how to fill a container; 'Suggest from Sales History' proposes products to reach a target fill % based on past orders.",
      "The workflow runs Query → CBM → BOM → PO → GRN → Packing → Shipment, with notifications firing at each stage to subscribed recipients.",
      "Set who receives which notification (and who approves gated steps like GRN) in the Supply Chain settings/recipients area.",
    ],
  },
  {
    routePrefix: "/export",
    name: "Export Department Agent",
    summary: "One shipment-file record per export order, with a per-country/buyer document checklist and AI review of documents uploaded to the shipment's Google Drive folder.",
    howTo: [
      "First build Document Templates (per country/buyer, courier vs email SOP) listing which documents are required. New shipments auto-load the matching template's checklist.",
      "Create a New Shipment: it auto-creates a Google Drive folder and shares it with the accountant's email so they can upload documents there.",
      "On the shipment page, click 'Scan Drive for New Documents' — the AI identifies each uploaded file, checks it looks genuine and relevant to this shipment, and flags matches as 'Needs Confirmation'. A human always confirms before a checklist item counts as done.",
      "The stage stepper (PI → Freight → FI/CPD → Aflatoxin → CRO/Docs → Checklist → Courier → Done) tracks where the shipment is.",
      "Aflatoxin rule: aflatoxin testing/certificate is required for all EDIBLE items EXCEPT salt. Salt does not require aflatoxin. Sports goods do not require aflatoxin either.",
    ],
  },
  {
    routePrefix: "/settings",
    name: "Settings",
    summary: "Department API keys and the AI usage/cost dashboard (super-admin only).",
    howTo: [
      "Add a department's own Anthropic API key so its AI usage is billed and tracked separately; the usage dashboard breaks cost down by department and by module.",
      "Never paste API keys anywhere except this Settings panel.",
    ],
  },
];

export const EXPORT_PROCESS_NOTES = `Kafi's export process (reference for questions):
- Starts when a Sales Order is confirmed; a Proforma Invoice (PI) is prepared and CBM is calculated from it.
- ~2-3 days from SO confirmation for the ship to reach the local port, during which the container (material + documents) must be made ready.
- Freight comparison across forwarders/shipping lines, weighing cost plus key dates (cut-off date, sailing date).
- FI (Foreign Inward remittance) and CPD are required before/around shipping.
- Payment is usually part-advance, part-on-arrival, so the two banks coordinate; the bank issues an FI# which is checked on PSW (Pakistan Single Window).
- Aflatoxin (for applicable edible items, NOT salt, NOT sports goods): sample sent to a lab → report issued → given to the clearing agent → uploaded to PSW → PSW doctor approves → certificate downloadable from PSW.
- CRO (Container Release Order) process: master document plus customs, phyto, BL, GD (Goods Declaration); some documents are needed specifically at loading time.
- A per-buyer/per-bank document checklist is completed; documents are sent by courier (physically flown ahead of the ship so the buyer can start SWIFT early) or by email/soft copy depending on that country's SOP.
- If a trusted buyer pays 100% in advance, the bank-to-bank collection step is skipped and the document list to the bank changes accordingly.`;

export function buildSystemPrompt(currentPath: string): string {
  const current = MODULES.find(m => currentPath.startsWith(m.routePrefix));
  const moduleList = MODULES.map(m =>
    `### ${m.name} (${m.routePrefix})\n${m.summary}\n${m.howTo.map(h => `- ${h}`).join("\n")}`
  ).join("\n\n");

  return `You are the Kafi Assistant, an in-app help guide for the Kafi Commodities AI Agent platform. You help staff understand how to use the platform and answer questions about Kafi's export, costing, and supply-chain processes.

You EXPLAIN and GUIDE — you do not take actions, change data, or click buttons for the user. When they ask "how do I…", walk them through the steps and tell them which page/button to use. Keep answers short, concrete, and practical. Plain text, no markdown symbols like * or #. If you genuinely don't know something specific to Kafi, say so rather than inventing details.

${current ? `The user is currently on the "${current.name}" page (${currentPath}). Bias your help toward this module unless they ask about something else.` : `The user is on ${currentPath}.`}

PLATFORM MODULES:

${moduleList}

${EXPORT_PROCESS_NOTES}`;
}
