-- ============================================================================
-- seed.sql — LOCAL demo data (run by `supabase db reset` / `supabase start`)
--
-- ⚠️  LOCAL ONLY. This file is wired via config.toml [db.seed] and runs only on a
--     local `db reset`/`start`. `supabase db push` ships ONLY migrations/, never
--     this file — so these demo users (shared password) never reach remote.
--     Do NOT run this against a production database.
--
-- Demo login (password is the same for everyone): ......  demo123456
--
--   email                | role        | sees entities
--   ---------------------+-------------+--------------------------------------
--   super@demo.local     | super_admin | all 4 (and may assign membership)
--   admin@demo.local     | admin       | all 4
--   manager@demo.local   | manager     | Office + Retail SPV (2, via membership)
--   viewer@demo.local    | viewer      | Office SPV (1, via membership)
--
-- Entities: a small property group — four SPVs, one building each:
--   Danube Office Park, Riverside Retail Park, Lindenhof Residences,
--   Westgate Logistics Hub (slugs northwind/acme/globex/initech are kept as
--   stable internal keys). Their books — rent roll, AR/AP invoices, a balanced
--   double-entry journal with document numbers, P&L and cash budgets, and one
--   live upload at 'awaiting_review' with a real Utilities spike — are generated
--   by private.load_reporting_demo() (migration 38), deterministic, no random().
-- ============================================================================

-- Fixed UUIDs so the data is stable across resets (and referenceable below).
--   users    d0000000-…-000000000001..4
--   entities e0000000-…-000000000001..4
--   live batch f0000000-…-000000000001

-- ----------------------------------------------------------------------------
-- 1. Demo auth users (+ identities). The on_auth_user_created trigger creates
--    the matching public.profiles rows (all as 'viewer'); roles are promoted
--    below. Token columns set to '' to avoid GoTrue's NULL-scan login error.
-- ----------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  is_sso_user, is_anonymous
)
select
  '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated',
  u.email, crypt('demo123456', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', u.full_name),
  now(), now(), '', '', '', '', false, false
from (values
  ('d0000000-0000-4000-8000-000000000001'::uuid, 'super@demo.local',   'Sasha Super'),
  ('d0000000-0000-4000-8000-000000000002'::uuid, 'admin@demo.local',   'Adam Admin'),
  ('d0000000-0000-4000-8000-000000000003'::uuid, 'manager@demo.local', 'Mira Manager'),
  ('d0000000-0000-4000-8000-000000000004'::uuid, 'viewer@demo.local',  'Vera Viewer'),
  -- The anonymous "Explore demo" identity: VIEWER role (server-side read-only —
  -- submit_batch/approve_batch reject non-managers), but member of all 4 entities
  -- so the demo shows rich data. Read-only is enforced by role, not by the UI.
  ('d0000000-0000-4000-8000-000000000005'::uuid, 'demo@demo.local',    'Dana Demo')
) as u(id, email, full_name);

insert into auth.identities (
  id, user_id, provider_id, provider, identity_data,
  last_sign_in_at, created_at, updated_at
)
select gen_random_uuid(), u.id, u.id::text, 'email',
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  now(), now(), now()
from auth.users u
where u.email like '%@demo.local';

-- Promote roles. role/is_active are FROZEN columns — the trigger needs the
-- transaction-local opt-in flag (same gate the admin RPC will use later).
begin;
  set local app.allow_privileged_profile_change = 'on';
  update public.profiles set role = 'super_admin' where id = 'd0000000-0000-4000-8000-000000000001';
  update public.profiles set role = 'admin'       where id = 'd0000000-0000-4000-8000-000000000002';
  update public.profiles set role = 'manager'     where id = 'd0000000-0000-4000-8000-000000000003';
  -- viewer keeps the default 'viewer' role.
  -- The same flags migration 34 sets on remote (it runs before these rows exist
  -- locally): every @demo.local account is the shared, read-only demo.
  update public.profiles set is_demo = true where lower(email) like '%@demo.local';
  update public.profiles set is_platform_staff = true
    where lower(email) like '%@demo.local' and role in ('super_admin', 'admin');
commit;

-- ----------------------------------------------------------------------------
-- 2. Entities + memberships (admin/super_admin need no rows — they see all).
-- ----------------------------------------------------------------------------
insert into public.entities (id, name, slug, base_currency) values
  ('e0000000-0000-4000-8000-000000000001', 'Danube Office Park s.r.o.',     'northwind', 'EUR'),
  ('e0000000-0000-4000-8000-000000000002', 'Riverside Retail Park s.r.o.',  'acme',      'EUR'),
  ('e0000000-0000-4000-8000-000000000003', 'Lindenhof Residences s.r.o.',   'globex',    'EUR'),
  ('e0000000-0000-4000-8000-000000000004', 'Westgate Logistics Hub s.r.o.', 'initech',   'EUR');

insert into public.entity_members (entity_id, user_id, granted_by) values
  -- viewer → office SPV only
  ('e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-000000000001'),
  -- manager → office + retail SPV
  ('e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000001'),
  ('e0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000001'),
  -- demo (read-only explorer) → all four entities, so anon sees rich data
  ('e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000005', 'd0000000-0000-4000-8000-000000000001'),
  ('e0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000005', 'd0000000-0000-4000-8000-000000000001'),
  ('e0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000005', 'd0000000-0000-4000-8000-000000000001'),
  ('e0000000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-000000000005', 'd0000000-0000-4000-8000-000000000001');

-- ----------------------------------------------------------------------------
-- 4. A per-entity ruleset override for the residential SPV (tighter z-threshold + CZK),
--    to demonstrate that transform_batch prefers an entity override over the
--    global default seeded in migration 6.
-- ----------------------------------------------------------------------------
insert into public.validation_rulesets (entity_id, version, rules)
values (
  'e0000000-0000-4000-8000-000000000003', 1,
  jsonb_build_object(
    'required_columns',   jsonb_build_array('account_code', 'txn_date'),
    'header_aliases', jsonb_build_object(
      'account_code', jsonb_build_array('account', 'acct', 'account code'),
      'txn_date',     jsonb_build_array('date', 'posting date'),
      'debit',        jsonb_build_array('dr', 'debit'),
      'credit',       jsonb_build_array('cr', 'credit'),
      'currency',     jsonb_build_array('ccy', 'currency'),
      'description',  jsonb_build_array('memo', 'narrative')
    ),
    'date_formats',       jsonb_build_array('YYYY-MM-DD', 'DD.MM.YYYY'),
    'allowed_currencies', jsonb_build_array('EUR', 'CZK'),
    'amount_mode',        'split',
    'zscore', jsonb_build_object('threshold', 2.5, 'min_history_periods', 3, 'trailing_months', 12)
  )
);

-- ----------------------------------------------------------------------------
-- 5. The books. All four demo entities ARE the shared read-only sample sandbox
--    (new registrants get membership to is_sample entities via migration 20).
--    load_reporting_demo() generates 24 months of actuals up to the last closed
--    month + 12 months of plan, for every SPV: chart of accounts, rent roll,
--    invoices + payments, the journal, budgets, cash budget, and the live
--    review batch on the office SPV (real transform_batch + detect_anomalies).
-- ----------------------------------------------------------------------------
update public.entities set is_sample = true;

select private.load_reporting_demo();

-- The shared spreadsheet-link connector on the office SPV (migration 41).
select private.ensure_showcase_connector();

-- ----------------------------------------------------------------------------
-- 8. notify-review endpoint config (LOCAL ONLY) — the local half of the
--    local≠remote Vault guard for migration 17's pg_net trigger.
--
--    These are the standard, PUBLIC, fixed local demo values:
--      * URL  : the internal Kong gateway hostname, reachable from the db
--               container (verified: db resolves `kong`), routing to the bundled
--               edge runtime that serves supabase/functions/.
--      * key  : the well-known local demo service_role JWT (iss=supabase-demo,
--               signed with the default local JWT secret). This is NOT a real
--               secret and NOT the remote key — it is identical on every local
--               Supabase install, hence safe to commit here. The REAL remote
--               service_role key is set on remote via vault.create_secret and is
--               NEVER committed (migration 17 header).
--
--    Placed at the END of seed (after transform/detect above): on `db reset`
--    those calls run BEFORE these secrets exist, so the notify_review trigger
--    fail-soft skips during seeding — db reset performs no network I/O and the
--    net queue / pipeline_events stay clean. The secrets are then available for
--    the app and for manual round-trip testing.
--
--    Idempotent: create only if absent, so a re-seed without a reset won't error.
-- ----------------------------------------------------------------------------
select vault.create_secret(
  'http://kong:8000/functions/v1/notify-review',
  'edge_notify_review_url',
  'LOCAL notify-review endpoint (internal Kong gateway)'
)
where not exists (select 1 from vault.secrets where name = 'edge_notify_review_url');

select vault.create_secret(
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU',
  'edge_service_role_key',
  'LOCAL demo service_role JWT (public, fixed, NOT the remote key)'
)
where not exists (select 1 from vault.secrets where name = 'edge_service_role_key');
