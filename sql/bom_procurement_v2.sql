-- BOM procurement redesign: per-material Order Direct / Ask for Quotes flow,
-- inline PO sending, and a new Quotation Comparison module.

ALTER TABLE sc_bom_materials
  ADD COLUMN rate numeric NOT NULL DEFAULT 0,
  ADD COLUMN vendor_id text REFERENCES vb_vendors(id),
  ADD COLUMN vendor_name text,
  ADD COLUMN procurement_mode text CHECK (procurement_mode IN ('direct', 'query')),
  ADD COLUMN po_id uuid REFERENCES sc_purchase_orders(id),
  ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE sc_material_quotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bom_material_id uuid NOT NULL REFERENCES sc_bom_materials(id) ON DELETE CASCADE,
  vendor_id text REFERENCES vb_vendors(id),
  vendor_name text NOT NULL,
  rate numeric NOT NULL DEFAULT 0,
  note text,
  is_winner boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES staff(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sc_material_quotations_bom_material ON sc_material_quotations(bom_material_id);

ALTER TABLE sc_po_items ADD COLUMN rate numeric NOT NULL DEFAULT 0;
