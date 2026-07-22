-- Shipment Tracking — the step after Packing & Loading: booking, BL,
-- vessel/carrier details, and delivery confirmation.
CREATE TABLE sc_shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_number text NOT NULL,
  packing_session_id uuid REFERENCES sc_packing_sessions(id) ON DELETE SET NULL,
  bom_id uuid REFERENCES sc_boms(id) ON DELETE SET NULL,
  buyer_name text,
  container_type text NOT NULL DEFAULT '20ft',
  carrier text,
  vessel_name text,
  booking_number text,
  bl_number text,
  bl_date date,
  port_of_loading text,
  port_of_discharge text,
  etd date,
  eta date,
  actual_delivery_date date,
  status text NOT NULL DEFAULT 'booked' CHECK (status IN ('booked', 'in_transit', 'arrived', 'delivered')),
  notes text,
  created_by uuid REFERENCES staff(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sc_shipments_packing_session ON sc_shipments(packing_session_id);
