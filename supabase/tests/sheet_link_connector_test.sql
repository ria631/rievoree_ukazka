-- pgTAP: the spreadsheet-link connector (migration 41).
--
-- Proves that only public https links are accepted, that an ordinary Google
-- Sheets link becomes its CSV export, that the SQL CSV reader copes with real
-- spreadsheet exports, that the shared demo can't create connectors and only
-- ever previews, and that bad answers (404, a web page) become plain errors.
-- Self-contained; everything rolls back. No network: fetch answers are fed to
-- process_url_fetch directly.
begin;
create extension if not exists pgtap;
select plan(19);

create or replace function pg_temp.act_as(p_uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
end;
$$;

create or replace function pg_temp.act_owner() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  reset role;
end;
$$;

-- --- fixture --------------------------------------------------------------
insert into auth.users (id, email) values
  ('dddd1000-0000-4000-8000-000000000001', 'tap-sheet-manager@test.local'),
  ('dddd1000-0000-4000-8000-000000000002', 'tap-sheet-demo@test.local');
insert into public.entities (id, name, slug) values
  ('eeee1000-0000-4000-8000-000000000001', 'TAP Sheet Co', 'tap-sheet-co');
select set_config('app.allow_privileged_profile_change', 'on', true);
update public.profiles set role = 'manager' where id = 'dddd1000-0000-4000-8000-000000000001';
update public.profiles set role = 'manager', is_demo = true where id = 'dddd1000-0000-4000-8000-000000000002';
insert into public.entity_members (entity_id, user_id) values
  ('eeee1000-0000-4000-8000-000000000001', 'dddd1000-0000-4000-8000-000000000001'),
  ('eeee1000-0000-4000-8000-000000000001', 'dddd1000-0000-4000-8000-000000000002');

-- ========================================================================
-- 1. Links: public https only; a Sheets link becomes its CSV export.
-- ========================================================================
select ok(private.connector_url_ok('https://docs.google.com/spreadsheets/d/abc/export?format=csv'),
  'a public https link is accepted');
select ok(not private.connector_url_ok('http://example.com/a.csv'), 'plain http is refused');
select ok(not private.connector_url_ok('https://127.0.0.1/a.csv'), 'an IP address is refused');
select ok(not private.connector_url_ok('https://localhost/a.csv'), 'localhost is refused');
select ok(not private.connector_url_ok('https://db.internal/a.csv'), 'an internal name is refused');
select ok(not private.connector_url_ok('https://example.com:8443/a.csv'), 'a non-443 port is refused');
select is(
  private.normalize_sheet_url('https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit?gid=42#gid=42'),
  'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/export?format=csv&gid=42',
  'an ordinary Google Sheets link becomes the CSV export of that tab');

-- ========================================================================
-- 2. The CSV reader: a Slovak export (; separator, decimal comma, dd.mm.yyyy).
-- ========================================================================
select is(
  private.parse_csv_rows(E'﻿Účet;Dátum;Popis;MD;Dal\r\n5000;02.10.2026;"Energia; október";1 234,50;\r\n2000;02.10.2026;=HYPERLINK("x");;1234,50\r\n') #>> '{0}',
  jsonb_build_object(
    'account_code', '5000', 'txn_date', '2026-10-02', 'description', 'Energia; október',
    'debit', '1234.50', 'credit', null, 'currency', null,
    'raw', jsonb_build_object('účet', '5000', 'dátum', '02.10.2026', 'popis', 'Energia; október', 'md', '1 234,50', 'dal', '')
  )::text,
  'a Slovak export parses: aliases, BOM, quoted separator, thousands + decimal comma, dd.mm.yyyy');
select is(
  private.parse_csv_rows(E'Account;Date;Description;Debit;Credit\n2000;02.10.2026;=HYPERLINK("x");;1234,50\n') #>> '{0,raw,description}',
  '''=HYPERLINK("x")',
  'a raw formula cell is defused');
select is(
  private.parse_csv_rows(E'Name,Gender\nAlexandra,Female\n'),
  '[]'::jsonb,
  'without an account and a date column there are no rows');

-- ========================================================================
-- 3. Creating: the demo can't; Drive is retired; links are validated.
-- ========================================================================
select pg_temp.act_as('dddd1000-0000-4000-8000-000000000002');
select throws_ok(
  $$ select public.create_connector('eeee1000-0000-4000-8000-000000000001', 'url', 'x',
       '{"url":"https://example.com/a.csv"}') $$,
  '42501', 'the shared demo account is read-only — register to add your own connectors',
  'the shared demo cannot create connectors');

select pg_temp.act_as('dddd1000-0000-4000-8000-000000000001');
select throws_ok(
  $$ select public.create_connector('eeee1000-0000-4000-8000-000000000001', 'url', 'x',
       '{"url":"http://example.com/a.csv"}') $$,
  '22023', 'paste a public https:// link to a CSV file',
  'a non-https link is refused at creation');
select throws_ok(
  $$ select public.create_connector('eeee1000-0000-4000-8000-000000000001', 'gdrive', 'x', '{}') $$,
  '22023', NULL,
  'Google Drive connectors can no longer be created');
select is(
  (public.create_connector('eeee1000-0000-4000-8000-000000000001', 'url', 'Costs sheet',
     '{"url":"https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit#gid=0"}')) ->> 'status',
  'active', 'a manager creates a link connector');
select is(
  (select config ->> 'url' from public.connectors where name = 'Costs sheet'),
  'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/export?format=csv&gid=0',
  'the stored link is the CSV export');

-- ========================================================================
-- 4. Answers: a dry run (demo) previews without writing; bad answers explain.
-- ========================================================================
select pg_temp.act_owner();
select is(
  (select private.process_url_fetch(
     row(-1, c.id, null, true, now())::private.url_fetches, 200,
     E'Account,Date,Debit,Credit\n5000,2026-10-02,100,\n2000,2026-10-02,,100\n', '{}'::jsonb, false, null)
   from public.connectors c where c.name = 'Costs sheet')
   - 'sample' - 'unknown_accounts',
  jsonb_build_object('status', 'preview', 'rows', 2, 'period', '2026-10', 'debit', 100, 'credit', 100, 'missing_dates', 0),
  'a dry run returns the summary, status preview');
select is(
  (select count(*)::int from public.ingest_batches where entity_id = 'eeee1000-0000-4000-8000-000000000001'),
  0, 'a dry run writes no batch');
select is(
  (select private.process_url_fetch(
     row(-2, c.id, null, false, now())::private.url_fetches, 404, 'not found', '{}'::jsonb, false, null)
   from public.connectors c where c.name = 'Costs sheet') ->> 'message',
  'the link answered HTTP 404', 'a 404 becomes a plain error');
select matches(
  (select private.process_url_fetch(
     row(-3, c.id, null, false, now())::private.url_fetches, 200,
     E'<!DOCTYPE html><html><body>Sign in</body></html>', '{}'::jsonb, false, null)
   from public.connectors c where c.name = 'Costs sheet') ->> 'message',
  '^the link returned a web page', 'a sign-in page (sheet not shared) is recognised');

select * from finish();
rollback;
