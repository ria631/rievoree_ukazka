-- pgTAP: the hourly demo reset queues a genuine report refresh for the sample
-- companies, so the X-ray Pipeline tab shows real events — and only theirs.
-- Self-contained; rolls back.
begin;
create extension if not exists pgtap;
select plan(6);

-- --- fixture: a sample company and a registered user's company, one posting each ---
insert into auth.users (id, email) values
  ('dddd5000-0000-4000-8000-000000000001', 'tap-pipe@example.com');
insert into public.entities (id, name, slug, is_sample) values
  ('eeee5000-0000-4000-8000-000000000001', 'TAP Pipe Sample', 'tap-pipe-sample', true);
insert into public.entities (id, name, slug, owner_id) values
  ('eeee5000-0000-4000-8000-000000000002', 'TAP Pipe Real', 'tap-pipe-real', 'dddd5000-0000-4000-8000-000000000001');
insert into public.accounts (id, entity_id, code, name, type) values
  ('aaaa5000-0000-4000-8000-000000000001', 'eeee5000-0000-4000-8000-000000000001', '1000', 'Cash', 'asset'),
  ('aaaa5000-0000-4000-8000-000000000002', 'eeee5000-0000-4000-8000-000000000002', '1000', 'Cash', 'asset');
insert into public.ingest_batches
  (id, entity_id, uploaded_by, source, file_name, storage_path, file_hash, period, status)
values
  ('bbbb5000-0000-4000-8000-000000000001', 'eeee5000-0000-4000-8000-000000000001',
   'dddd5000-0000-4000-8000-000000000001', 'manual', 's.csv', 'ingest/s.csv', repeat('a', 64), '2026-09-01', 'loaded'),
  ('bbbb5000-0000-4000-8000-000000000002', 'eeee5000-0000-4000-8000-000000000002',
   'dddd5000-0000-4000-8000-000000000001', 'manual', 'r.csv', 'ingest/r.csv', repeat('b', 64), '2026-09-01', 'loaded');
insert into public.journal_entries (entity_id, account_id, batch_id, txn_date, debit, credit, currency) values
  ('eeee5000-0000-4000-8000-000000000001', 'aaaa5000-0000-4000-8000-000000000001', 'bbbb5000-0000-4000-8000-000000000001', '2026-08-15', 10, 0, 'EUR'),
  ('eeee5000-0000-4000-8000-000000000001', 'aaaa5000-0000-4000-8000-000000000001', 'bbbb5000-0000-4000-8000-000000000001', '2026-09-15', 10, 0, 'EUR'),
  ('eeee5000-0000-4000-8000-000000000002', 'aaaa5000-0000-4000-8000-000000000002', 'bbbb5000-0000-4000-8000-000000000002', '2026-09-15', 10, 0, 'EUR');

-- Start from a quiet queue and timeline (the inserts above enqueued themselves).
delete from public.report_refresh_queue;
delete from public.pipeline_events
  where entity_id in ('eeee5000-0000-4000-8000-000000000001', 'eeee5000-0000-4000-8000-000000000002');

select private.reset_demo_state();

select is(
  (select array_agg(period::text) from public.report_refresh_queue
    where entity_id = 'eeee5000-0000-4000-8000-000000000001'),
  array['2026-09-01'], 'the reset queues the sample company''s latest period');
select is(
  (select count(*)::int from public.report_refresh_queue
    where entity_id = 'eeee5000-0000-4000-8000-000000000002'),
  0, 'a registered user''s company is not touched');
select is(
  (select detail->>'reason' from public.pipeline_events
    where entity_id = 'eeee5000-0000-4000-8000-000000000001' and stage = 'refresh_enqueued'),
  'hourly demo reset', 'the timeline says why the refresh was queued');

select private.refresh_report_mv();

select is(
  (select count(*)::int from public.pipeline_events
    where entity_id = 'eeee5000-0000-4000-8000-000000000001' and stage = 'mv_refreshed'),
  1, 'the real cron refresh then records mv_refreshed for the sample company');
select ok(
  (select duration_ms >= 0 from public.pipeline_events
    where entity_id = 'eeee5000-0000-4000-8000-000000000001' and stage = 'mv_refreshed'),
  'with its measured duration');
select is(
  (select count(*)::int from public.report_refresh_queue), 0, 'and the queue is drained');

select * from finish();
rollback;
