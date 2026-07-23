-- Reverse Costing: targeted-link price fetching + Google-based discovery.
-- target_links: sheet-level list of URLs the user wants checked, e.g.
--   [{"url":"https://noon.com/...","label":"noon.com"}]
-- target_country / target_category: default context passed to both the
--   AI price-extraction prompt and the Google Custom Search query.

ALTER TABLE cb_reverse_sheets
  ADD COLUMN IF NOT EXISTS target_links jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS target_country text,
  ADD COLUMN IF NOT EXISTS target_category text;

ALTER TABLE cb_reverse_entries
  ADD COLUMN IF NOT EXISTS source_url text;
