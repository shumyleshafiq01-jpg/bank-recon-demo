-- Export Department AI Agent — shipment-file tracker + document checklist.
-- One row per export order in export_shipments; its checklist is seeded
-- from a reusable per-country/buyer template (export_doc_templates).
-- Google Drive folder per shipment: accountant uploads docs there, the
-- agent scans for new files, has AI identify + credibility-check each one
-- against the still-pending checklist items (export_processed_files logs
-- every file it has already looked at so nothing gets re-analyzed).

CREATE TABLE export_doc_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,                          -- e.g. "Saudi Arabia — Courier SOP"
  country text,
  buyer_name text,                               -- optional buyer-specific override
  sop_method text NOT NULL DEFAULT 'courier',    -- 'courier' | 'email'
  document_types jsonb NOT NULL DEFAULT '[]',    -- ["Commercial Invoice","Packing List",...]
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE export_shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_ref text,
  buyer_name text NOT NULL,
  country text,
  pi_number text,
  advance_payment_pct numeric,                   -- 100 = no bank-to-bank collection needed
  sop_method text NOT NULL DEFAULT 'courier',
  template_id uuid REFERENCES export_doc_templates(id),
  stage text NOT NULL DEFAULT 'pi',              -- pi | freight | fi_cpd | aflatoxin | cro_docs | checklist | courier | done
  accountant_email text,                         -- shared as Editor on the Drive folder
  drive_folder_id text,
  drive_folder_link text,
  notes text,
  created_by uuid REFERENCES staff(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE export_shipment_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id uuid NOT NULL REFERENCES export_shipments(id) ON DELETE CASCADE,
  document_type text NOT NULL,
  status text NOT NULL DEFAULT 'pending',        -- pending | in_review | done
  matched_file_id text,
  matched_file_name text,
  matched_file_link text,
  ai_confidence numeric,
  ai_notes text,
  notes text,
  sort_order int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- AI review is assistive, not authoritative: a match sets status to
-- 'in_review' with the file attached, never straight to 'done' — a human
-- still confirms before it counts as complete, given the stakes on customs/
-- bank documents.
CREATE TABLE export_processed_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id uuid NOT NULL REFERENCES export_shipments(id) ON DELETE CASCADE,
  drive_file_id text NOT NULL,
  file_name text,
  checked_at timestamptz NOT NULL DEFAULT now(),
  matched_document_type text,
  confidence numeric,
  verdict text,                                  -- matched | irrelevant | suspicious | unclear
  notes text,
  UNIQUE(shipment_id, drive_file_id)
);

CREATE INDEX idx_export_checklist_shipment ON export_shipment_checklist_items(shipment_id);
CREATE INDEX idx_export_processed_shipment ON export_processed_files(shipment_id);
CREATE INDEX idx_export_shipments_stage ON export_shipments(stage);
