-- Sales + Quotation Comparison — historical sales orders/invoices (Kafi's
-- own internal records, not buyer queries), used to suggest a package that
-- blends items from past orders to hit a target CBM fill %.

CREATE TABLE sc_sales_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text,
  buyer_name text,
  country text,
  port text,
  container_type text NOT NULL DEFAULT '20ft',
  order_date date,
  notes text,
  created_by uuid REFERENCES staff(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sc_sales_history_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_history_id uuid NOT NULL REFERENCES sc_sales_history(id) ON DELETE CASCADE,
  product_id uuid REFERENCES sc_products(id),
  product_name text NOT NULL,
  cartons int NOT NULL DEFAULT 0,
  unit_price numeric,
  sort_order int NOT NULL DEFAULT 0
);

CREATE INDEX idx_sc_sales_history_items_sheet ON sc_sales_history_items(sales_history_id);
CREATE INDEX idx_sc_sales_history_country_port ON sc_sales_history(country, port);
