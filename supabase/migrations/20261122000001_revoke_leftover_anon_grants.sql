-- ============================================================================
-- Revoke the anon grants left on the first tables
--
-- The tables created before migration 20260610000003 still carry Supabase's
-- default grants to anon (the public key, no session): SELECT on entities,
-- entity_members, journal_entries, journal_staging, profiles and
-- validation_rulesets; SELECT/INSERT on ingest_batches; full DML on accounts.
-- They never let anything through — every policy on those tables is for
-- `authenticated`, so RLS gives anon zero rows and refuses every write — but a
-- grant is meant to be the first layer, and a policy written `to public` by
-- mistake would have opened them. (Found by supabase/audit/security_audit.sql.)
--
-- After this, anon holds exactly two privileges in the public schema: INSERT
-- on leads and on tour_feedback — the landing's write-only boxes, which nobody
-- can read back through the API. Later tables are already born without anon
-- grants (default privileges, migration 20260610000003).
-- ============================================================================

revoke all on all tables in schema public from anon;

grant insert on public.leads to anon;
grant insert on public.tour_feedback to anon;
