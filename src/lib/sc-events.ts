// Supply Chain workflow events — the A→Z notification timeline.
// Pure data (safe to import from client and server).
// Each recipient subscribes to events (notify) and can be an approver
// where a step has an approval gate.

export type ScEventKey =
  | "query_received"
  | "cbm_plan_saved"
  | "bom_generated"
  | "po_sent"
  | "grn_created"
  | "grn_approved"
  | "packing_done"
  | "shipment_booked"
  | "shipment_delivered"
  | "low_stock_alert";

export const SC_EVENTS: { key: ScEventKey; label: string; stage: string; gate?: boolean; future?: boolean }[] = [
  { key: "query_received", label: "Query Received", stage: "1 · Query" },
  { key: "cbm_plan_saved", label: "CBM Plan Saved", stage: "2 · CBM" },
  { key: "bom_generated", label: "BOM Generated", stage: "3 · BOM" },
  { key: "po_sent", label: "PO Sent to Vendor", stage: "4 · PO" },
  { key: "grn_created", label: "Goods Arrived (GRN)", stage: "5 · GRN" },
  { key: "grn_approved", label: "GRN Approved", stage: "5 · GRN", gate: true },
  { key: "packing_done", label: "Packing Complete", stage: "6 · Packing" },
  { key: "shipment_booked", label: "Shipment Booked", stage: "7 · Shipment" },
  { key: "shipment_delivered", label: "Shipment Delivered", stage: "7 · Shipment" },
  { key: "low_stock_alert", label: "Low Stock Alert", stage: "Inventory" },
];
