-- pgTAP: a visitor who isn't signed in reads nothing.
--
-- The API's anon role (the public key, no session) must get zero rows — or a
-- permission error — from every table and view that holds business or
-- personal data, must not reach the private schema, and must not be able to
-- list users. And no table in the public schema may ever ship without RLS.
-- Self-contained; rolls back.
begin;
create extension if not exists pgtap;
select plan(28);

-- How many rows can the current role see? A permission error counts as none.
create or replace function pg_temp.visible_rows(p_rel text) returns bigint
language plpgsql as $$
declare n bigint;
begin
  execute format('select count(*) from %s', p_rel) into n;
  return n;
exception when insufficient_privilege then
  return 0;
end;
$$;

-- Can the current role get a user list? An error (no session, no grant) counts as no.
create or replace function pg_temp.listed_members() returns int
language plpgsql as $$
begin
  return jsonb_array_length(public.list_org_members());
exception when others then
  return 0;
end;
$$;

-- --- fixture (as the table owner): a company, its member, a lead, so there is something to hide ---
insert into auth.users (id, email) values
  ('dddd5000-0000-4000-8000-000000000001', 'tap-anon-owner@example.com');
insert into public.entities (id, name, slug) values
  ('eeee5000-0000-4000-8000-000000000001', 'TAP Anon Co', 'tap-anon-co');
insert into public.entity_members (entity_id, user_id) values
  ('eeee5000-0000-4000-8000-000000000001', 'dddd5000-0000-4000-8000-000000000001');
insert into public.leads (email) values ('tap-lead@example.com');

-- 1. No public table without row-level security.
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity),
  0, 'every table in the public schema has RLS enabled');

-- 2. Grants are the first layer: anon holds nothing in the public schema but
--    INSERT on the two write-only boxes (leads, tour_feedback).
select is(
  (select coalesce(string_agg(table_name || ':' || privilege_type, ', ' order by table_name, privilege_type), '')
     from information_schema.role_table_grants
    where grantee = 'anon' and table_schema = 'public'
      and not (table_name in ('leads', 'tour_feedback') and privilege_type = 'INSERT')),
  '', 'anon holds no table privilege but INSERT on leads and tour_feedback');

-- 3. The fixture is really there (so the zeros below mean something).
select ok(pg_temp.visible_rows('public.entities') > 0 and pg_temp.visible_rows('public.profiles') > 0,
  'fixture: the owner sees companies and profiles');

-- 4. Now as the anonymous API caller.
select set_config('role', 'anon', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select is(pg_temp.visible_rows('public.profiles'), 0::bigint, 'anon sees no profiles');
select is(pg_temp.visible_rows('public.entities'), 0::bigint, 'anon sees no companies');
select is(pg_temp.visible_rows('public.entity_members'), 0::bigint, 'anon sees no memberships');
select is(pg_temp.visible_rows('public.accounts'), 0::bigint, 'anon sees no chart of accounts');
select is(pg_temp.visible_rows('public.journal_entries'), 0::bigint, 'anon sees no ledger lines');
select is(pg_temp.visible_rows('public.journal_staging'), 0::bigint, 'anon sees no staged rows');
select is(pg_temp.visible_rows('public.ingest_batches'), 0::bigint, 'anon sees no uploads');
select is(pg_temp.visible_rows('public.ingest_queue'), 0::bigint, 'anon sees no queue');
select is(pg_temp.visible_rows('public.validation_rulesets'), 0::bigint, 'anon sees no validation rules');
select is(pg_temp.visible_rows('public.budgets'), 0::bigint, 'anon sees no budgets');
select is(pg_temp.visible_rows('public.cash_budget'), 0::bigint, 'anon sees no cash budget');
select is(pg_temp.visible_rows('public.invoices'), 0::bigint, 'anon sees no invoices');
select is(pg_temp.visible_rows('public.properties'), 0::bigint, 'anon sees no properties');
select is(pg_temp.visible_rows('public.units'), 0::bigint, 'anon sees no units');
select is(pg_temp.visible_rows('public.leases'), 0::bigint, 'anon sees no leases');
select is(pg_temp.visible_rows('public.connectors'), 0::bigint, 'anon sees no connectors');
select is(pg_temp.visible_rows('public.connector_files'), 0::bigint, 'anon sees no connector files');
select is(pg_temp.visible_rows('public.pipeline_events'), 0::bigint, 'anon sees no pipeline events');
select is(pg_temp.visible_rows('public.report_refresh_queue'), 0::bigint, 'anon sees no refresh queue');
select is(pg_temp.visible_rows('public.leads'), 0::bigint, 'anon can leave an e-mail but never read one');
select is(pg_temp.visible_rows('public.tour_feedback'), 0::bigint, 'anon can leave feedback but never read it');
select is(pg_temp.visible_rows('public.report_account_monthly'), 0::bigint, 'anon sees no report rows');
select is(pg_temp.visible_rows('private.mv_account_monthly'), 0::bigint, 'anon cannot reach the private report store');
select is(pg_temp.visible_rows('private.mv_journal_documents'), 0::bigint, 'anon cannot reach the private document store');
select is(pg_temp.listed_members(), 0, 'anon cannot list users');

reset role;
select * from finish();
rollback;
