-- AI Agent Cost / Budgeting — Reverse Costing & Forward Costing.
-- Reverse: observed competitor retail price -> implied cost at assumed
--   retail margins, optionally broken all the way back to estimated FOB.
-- Forward: Kafi's own known cost -> suggested selling price at target markups.

CREATE TABLE cb_reverse_sheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  category text,
  margin_scenarios jsonb NOT NULL DEFAULT '[40,50,60]',
  show_fob_breakdown boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES staff(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE cb_reverse_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_id uuid NOT NULL REFERENCES cb_reverse_sheets(id) ON DELETE CASCADE,
  item_name text NOT NULL,
  packaging text,
  weight_desc text,
  forum text,
  country text,
  price_local numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  fx_rate numeric NOT NULL DEFAULT 1,
  is_own_price boolean NOT NULL DEFAULT false,
  freight_usd numeric NOT NULL DEFAULT 0,
  duty_pct numeric NOT NULL DEFAULT 0,
  clearance_usd numeric NOT NULL DEFAULT 0,
  sort_order int NOT NULL DEFAULT 0
);

CREATE TABLE cb_forward_sheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  category text,
  markup_scenarios jsonb NOT NULL DEFAULT '[40,75,100]',
  created_by uuid REFERENCES staff(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE cb_forward_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_id uuid NOT NULL REFERENCES cb_forward_sheets(id) ON DELETE CASCADE,
  item_name text NOT NULL,
  packaging text,
  weight_desc text,
  our_cost_usd numeric NOT NULL DEFAULT 0,
  sort_order int NOT NULL DEFAULT 0
);

CREATE INDEX idx_cb_reverse_entries_sheet ON cb_reverse_entries(sheet_id);
CREATE INDEX idx_cb_forward_entries_sheet ON cb_forward_entries(sheet_id);
