-- ============================================================================
-- Migration 40 — a new connector kind: a link to a spreadsheet (CSV)
--
-- Enum values must be committed before they can be used, so this file only
-- adds them; migration 41 builds the connector on top. (Google Drive stays in
-- the enum for old rows, but is retired — see migration 41.)
-- ============================================================================
alter type public.connector_kind add value if not exists 'url';
alter type public.ingest_source  add value if not exists 'url';
