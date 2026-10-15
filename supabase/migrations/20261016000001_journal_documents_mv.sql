-- ============================================================================
-- Migration 39 — journal documents as a materialized roll-up
--
-- The Journal page groups every posting into its source document. Doing that
-- live (view journal_documents over journal_entries) re-aggregates the whole
-- journal on every request — fine on a laptop, but on a small hosted database
-- with many sandboxes it can run into the API's statement timeout, and the
-- page waits. Same cure as the P&L roll-up (migration 11): the grouping is
-- materialized once, and refreshed by the same pg_cron tick whenever the
-- journal changes (the existing report_refresh_queue trigger chain).
--
--   private.mv_journal_documents   one row per document (unique entity, doc_no)
--   public.journal_documents       same columns as before; now a tenant-filtered
--                                  window onto the MV (the WHERE is the barrier,
--                                  exactly like public.report_account_monthly)
--   public.journal_month_summary   unchanged definition — now cheap
-- ============================================================================

create materialized view if not exists private.mv_journal_documents as
select d.entity_id, d.doc_no, d.doc_type,
       min(d.txn_date)                              as txn_date,
       min(d.period)                                as period,
       (array_agg(d.description order by d.id))[1]  as description,
       count(*)::int                                as lines,
       sum(d.debit)                                 as debit,
       sum(d.credit)                                as credit,
       sum(d.debit) = sum(d.credit)                 as balanced,
       (array_agg(d.batch_id))[1]                   as batch_id
from (
  select je.id, je.entity_id, je.batch_id, je.txn_date, je.period, je.description, je.debit, je.credit,
         coalesce(je.doc_no, 'UP-' || upper(left(je.batch_id::text, 8)))                as doc_no,
         case when je.doc_no is null then 'UP' else split_part(je.doc_no, '-', 1) end as doc_type
  from public.journal_entries je
) d
group by d.entity_id, d.doc_no, d.doc_type;

-- (entity, doc_no) is unique by construction (doc_type is a function of doc_no);
-- the unique index is what REFRESH ... CONCURRENTLY needs.
create unique index if not exists mv_journal_documents_pk
  on private.mv_journal_documents (entity_id, doc_no);
create index if not exists mv_journal_documents_period_idx
  on private.mv_journal_documents (entity_id, period, doc_type);
create index if not exists mv_journal_documents_date_idx
  on private.mv_journal_documents (txn_date desc, doc_no desc);

-- Same column list as migration 38's view, so CREATE OR REPLACE keeps every
-- client query working.
create or replace view public.journal_documents
with (security_invoker = true) as
select m.entity_id, m.doc_no, m.doc_type, m.txn_date, m.period, m.description,
       m.lines, m.debit, m.credit, m.balanced, m.batch_id
from private.mv_journal_documents m
where (select private.is_admin())
   or m.entity_id in (select private.my_entity_ids());

comment on view public.journal_documents is
  'Tenant-filtered window onto private.mv_journal_documents. The WHERE clause is the cross-tenant barrier (mirrors journal_entries_select); the MV itself is not exposed through the API.';

-- security_invoker: the caller needs SELECT on the MV (the private schema is
-- not exposed by the API, so the view above is the only way in).
grant select on private.mv_journal_documents to authenticated;
revoke all on private.mv_journal_documents from anon;


-- ----------------------------------------------------------------------------
-- The pg_cron refresh (migration 15) now refreshes both roll-ups. Body is
-- migration 15's, plus the second REFRESH.
-- ----------------------------------------------------------------------------
create or replace function private.refresh_report_mv()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_watermark   timestamptz;
  v_start       timestamptz;
  v_duration_ms integer;
begin
  if not pg_try_advisory_xact_lock(hashtext('refresh_report_mv')) then
    return;
  end if;

  v_watermark := (select max(enqueued_at) from public.report_refresh_queue);
  if v_watermark is null then
    return;
  end if;

  v_start := clock_timestamp();

  refresh materialized view concurrently private.mv_account_monthly;
  refresh materialized view concurrently private.mv_journal_documents;

  v_duration_ms := (extract(epoch from clock_timestamp() - v_start) * 1000)::integer;

  with cleared as (
    delete from public.report_refresh_queue
     where enqueued_at <= v_watermark
    returning entity_id, period
  )
  insert into public.pipeline_events (entity_id, stage, detail, duration_ms)
  select entity_id,
         'mv_refreshed',
         jsonb_build_object('periods', array_agg(distinct period order by period)),
         v_duration_ms
  from cleared
  group by entity_id;
end;
$$;

revoke all on function private.refresh_report_mv() from public;


-- ----------------------------------------------------------------------------
-- load_reporting_demo (migration 38) refreshes the new roll-up too.
-- ----------------------------------------------------------------------------
create or replace function private.load_reporting_demo(p_last date default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uploader uuid;
  v_entity   uuid;
  v_out      jsonb := '[]'::jsonb;
  r          record;
begin
  select id into v_uploader from public.profiles where lower(email) = 'manager@demo.local' limit 1;
  if v_uploader is null then
    select id into v_uploader from public.profiles
    where role in ('super_admin', 'admin') order by created_at limit 1;
  end if;
  if v_uploader is null then
    raise exception 'load_reporting_demo: need manager@demo.local or an admin profile to own the batches'
      using errcode = 'P0002';
  end if;

  for r in
    select * from (values
      ('northwind', 'Danube Office Park s.r.o.',     'office',      true),
      ('acme',      'Riverside Retail Park s.r.o.',  'retail',      false),
      ('globex',    'Lindenhof Residences s.r.o.',   'residential', false),
      ('initech',   'Westgate Logistics Hub s.r.o.', 'logistics',   false)
    ) as s(slug, name, profile, live)
  loop
    insert into public.entities (name, slug, base_currency, is_sample)
    values (r.name, r.slug, 'EUR', true)
    on conflict (slug) do update set name = excluded.name, is_sample = true, is_active = true
    returning id into v_entity;

    delete from public.journal_entries      where entity_id = v_entity;
    delete from public.ingest_batches       where entity_id = v_entity;
    delete from public.pipeline_events      where entity_id = v_entity;
    delete from public.report_refresh_queue where entity_id = v_entity;
    delete from public.accounts             where entity_id = v_entity;

    v_out := v_out || jsonb_build_array(
      private.generate_property_books(v_entity, r.profile, v_uploader, p_last, r.live));
  end loop;

  refresh materialized view private.mv_account_monthly;
  refresh materialized view private.mv_journal_documents;
  perform private.reset_demo_state();   -- memberships back to the seeded shape
  return v_out;
end;
$$;

revoke all on function private.load_reporting_demo(date) from public, anon, authenticated;
