-- pgTAP: a pinned spreadsheet that keeps changing (migration 44).
--
-- A sheet is split by month; only months whose rows changed are imported
-- again; approving a month's new version replaces that sheet's previous
-- version of the month — not another sheet's rows; an older version can't be
-- approved once the latest is loaded; a missing currency is the company's.
-- Fetch answers are fed to process_url_fetch directly (no network).
begin;
create extension if not exists pgtap;
select plan(14);

create or replace function pg_temp.act_as(p_uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
end;
$$;

insert into auth.users (id, email) values ('dddd5000-0000-4000-8000-000000000001', 'tap-sheets@example.com');
insert into public.entities (id, name, slug, owner_id, base_currency) values
  ('eeee5000-0000-4000-8000-000000000001', 'TAP Sheets Co', 'tap-sheets-co', 'dddd5000-0000-4000-8000-000000000001', 'EUR');
select set_config('app.allow_privileged_profile_change', 'on', true);
update public.profiles set role = 'manager' where id = 'dddd5000-0000-4000-8000-000000000001';
insert into public.entity_members (entity_id, user_id) values
  ('eeee5000-0000-4000-8000-000000000001', 'dddd5000-0000-4000-8000-000000000001');
insert into public.accounts (entity_id, code, name, type) values
  ('eeee5000-0000-4000-8000-000000000001', '1100', 'Receivables', 'asset'),
  ('eeee5000-0000-4000-8000-000000000001', '2000', 'Payables', 'liability'),
  ('eeee5000-0000-4000-8000-000000000001', '4000', 'Rent', 'revenue'),
  ('eeee5000-0000-4000-8000-000000000001', '5000', 'Utilities', 'expense');
insert into public.connectors (id, entity_id, owner_id, kind, name, status, config) values
  ('cccc5000-0000-4000-8000-000000000001', 'eeee5000-0000-4000-8000-000000000001', 'dddd5000-0000-4000-8000-000000000001', 'url', 'Costs', 'active', '{"url":"https://example.com/a.csv"}'),
  ('cccc5000-0000-4000-8000-000000000002', 'eeee5000-0000-4000-8000-000000000001', 'dddd5000-0000-4000-8000-000000000001', 'url', 'Revenue', 'active', '{"url":"https://example.com/b.csv"}');

-- One sync of `csv` from connector `conn`, as the cron would.
create or replace function pg_temp.sync(p_conn uuid, p_csv text) returns jsonb language sql as $$
  select private.process_url_fetch(row(-1, p_conn, null, false, now())::private.url_fetches,
                                   200, p_csv, '{}'::jsonb, false, null)
$$;
-- The batch a sync created for `period` (YYYY-MM).
create or replace function pg_temp.batch(p_res jsonb, p_period text) returns uuid language sql as $$
  select (b ->> 'batch_id')::uuid from jsonb_array_elements(p_res -> 'batches') b
  where b ->> 'period' = p_period and b ->> 'status' = 'created'
$$;
create or replace function pg_temp.approve(p_batch uuid) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  perform pg_temp.act_as('dddd5000-0000-4000-8000-000000000001');
  r := public.approve_batch(p_batch);
  perform set_config('role', 'none', true);
  return r;
exception when others then
  perform set_config('role', 'none', true);
  raise;
end $$;
create or replace function pg_temp.booked(p_period date) returns numeric language sql as $$
  select coalesce(sum(debit), 0) from public.journal_entries
  where entity_id = 'eeee5000-0000-4000-8000-000000000001' and period = p_period
$$;

-- v1: two months, no currency column.
create temp table v1 as select pg_temp.sync('cccc5000-0000-4000-8000-000000000001',
  E'Account,Date,Debit,Credit\n5000,2026-10-05,100,\n2000,2026-10-05,,100\n5000,2026-11-05,200,\n2000,2026-11-05,,200\n') r;
select is((select jsonb_array_length(r -> 'batches') from v1), 2, 'a two-month sheet becomes two batches');
select isnt((select pg_temp.batch(r, '2026-10') from v1), null, 'October has its own batch');
select is((select string_agg(distinct currency, ',') from public.journal_staging
           where entity_id = 'eeee5000-0000-4000-8000-000000000001'), 'EUR',
  'no currency column → the company''s currency');
select lives_ok($$ select pg_temp.approve((select pg_temp.batch(r, '2026-10') from v1)) $$, 'October approves');
select lives_ok($$ select pg_temp.approve((select pg_temp.batch(r, '2026-11') from v1)) $$, 'November approves');
select is(pg_temp.booked('2026-11-01'), 200.00, 'November is booked');

-- v2: only November changed.
create temp table v2 as select pg_temp.sync('cccc5000-0000-4000-8000-000000000001',
  E'Account,Date,Debit,Credit\n5000,2026-10-05,100,\n2000,2026-10-05,,100\n5000,2026-11-05,250,\n2000,2026-11-05,,250\n') r;
select is((select b ->> 'status' from v2, jsonb_array_elements(r -> 'batches') b where b ->> 'period' = '2026-10'),
  'unchanged', 'an unchanged month is not imported again');
select is((select (pg_temp.approve(pg_temp.batch(r, '2026-11')) ->> 'rows_superseded')::int from v2), 2,
  'the new November replaces the old November from this sheet');
select is(pg_temp.booked('2026-11-01'), 250.00, 'November now carries the edited amount, once');

-- Another sheet, same company and month: neither replaces the other.
create temp table rev as select pg_temp.sync('cccc5000-0000-4000-8000-000000000002',
  E'Account;Date;Amount\n1100;01.10.2026;900\n4000;01.10.2026;-900\n') r;
select is((select (pg_temp.approve(pg_temp.batch(r, '2026-10')) ->> 'rows_superseded')::int from rev), 0,
  'a second sheet for October replaces nothing of the first');
select is(pg_temp.booked('2026-10-01'), 1000.00, 'October holds both sheets (100 costs + 900 rent)');
select is((select count(*)::int from public.journal_entries je
           where je.entity_id = 'eeee5000-0000-4000-8000-000000000001' and je.account_id =
             (select id from public.accounts where entity_id = 'eeee5000-0000-4000-8000-000000000001' and code = '4000')
             and je.credit = 900), 1, 'a signed Amount column: negative → credit');

-- Two pending versions of November: the latest is approved first → the older is refused.
create temp table v3 as select pg_temp.sync('cccc5000-0000-4000-8000-000000000001',
  E'Account,Date,Debit,Credit\n5000,2026-10-05,100,\n2000,2026-10-05,,100\n5000,2026-11-05,260,\n2000,2026-11-05,,260\n') r;
create temp table v4 as select pg_temp.sync('cccc5000-0000-4000-8000-000000000001',
  E'Account,Date,Debit,Credit\n5000,2026-10-05,100,\n2000,2026-10-05,,100\n5000,2026-11-05,270,\n2000,2026-11-05,,270\n') r;
select lives_ok($$ select pg_temp.approve((select pg_temp.batch(r, '2026-11') from v4)) $$, 'the latest November approves');
select throws_ok($$ select pg_temp.approve((select pg_temp.batch(r, '2026-11') from v3)) $$,
  '22023', NULL, 'an older November is refused once the latest is loaded');

select * from finish();
rollback;
