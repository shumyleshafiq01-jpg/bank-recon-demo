-- Export document generator: one MASTER record per shipment drives every
-- printable export document (Commercial Invoice, Packing List, Custom
-- Invoice, Certificate of Origin, Phyto, BL draft, covering letters) —
-- mirrors Kafi's "KAFI-###-SHARJAH" workbook where MASTER DATA auto-fills
-- all the document tabs via formulas. 1:1 with export_shipments.

CREATE TABLE export_doc_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id uuid NOT NULL UNIQUE REFERENCES export_shipments(id) ON DELETE CASCADE,

  -- Invoice identifiers
  pi_number text,
  pi_date date,
  custom_invoice_no text,
  custom_invoice_date date,
  commercial_invoice_no text,
  commercial_invoice_date date,

  -- Parties
  consignee_custom text,        -- CONSIGNEE (CUSTOM) name + address block
  consignee_actual text,        -- CONSIGNEE (ACTUAL) name + address block
  buyer_address text,           -- buyer address block as shown on invoices
  notify_party text,

  -- Shipment / transport
  container_no text,
  form_e_no text,               -- Form "E" # & date
  terms text,                   -- e.g. "100% PAYMENT TO BE RECEIVE ON CAD"
  bl_no text,
  bl_date date,
  vessel text,
  on_board text,                -- e.g. KARACHI-PAKISTAN
  destination text,             -- e.g. KHOR FAKKAN, U.A.E.
  no_of_containers text,        -- e.g. "01X40' FCL"
  no_of_packages text,          -- e.g. "2,530 CARTONS"
  description text,             -- e.g. "21.55 MT - (01X40' FCL, 2,530 CARTONS)"

  -- Weights (stored both as entered strings and numeric where useful)
  net_weight_mt numeric,
  gross_weight_mt numeric,
  net_weight_kgs numeric,
  gross_weight_kgs numeric,

  -- Charges / adjustments shown on the commercial invoice
  freight_label text,           -- e.g. "FREIGHT FOR 40FT"
  freight_amount numeric,
  listing_fee_label text,       -- e.g. "LISTING FEE LESS ..."
  listing_fee_amount numeric,   -- typically negative (a deduction)

  -- Terms / bank
  terms_of_sale text,           -- e.g. "CNF, KHOR FAKKAN, U.A.E."
  bank_name text,
  bank_account_name text,
  bank_account_no text,
  bank_iban text,
  bank_swift text,

  -- Certificate of Origin extras
  coo_exporter text,
  coo_membership_no text,
  coo_reference_no text,

  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Invoice/packing line items. line_type distinguishes real products from
-- FOC (free-of-cost) rows, freight/charge rows, and free-text notes so the
-- one table can render every row on the invoice faithfully.
CREATE TABLE export_doc_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  master_id uuid NOT NULL REFERENCES export_doc_master(id) ON DELETE CASCADE,
  line_no int,
  line_type text NOT NULL DEFAULT 'product',   -- product | foc | charge | note
  product_name text,             -- bold header line, e.g. "ESSECE HIMALAYAN PINK SALT FINE"
  packing_spec text,             -- "500 GMS X 20 FLIPTOP BOTTLE IN MASTER CARTON"
  per_ctn_weight_kg numeric,
  total_cartons numeric,
  total_net_kg numeric,
  hs_code text,
  unit_price numeric,
  unit_basis text DEFAULT 'PER CTN',
  amount numeric,
  note_text text,                -- for note/foc rows
  sort_order int NOT NULL DEFAULT 0
);

CREATE INDEX idx_export_doc_master_shipment ON export_doc_master(shipment_id);
CREATE INDEX idx_export_doc_lines_master ON export_doc_lines(master_id);
