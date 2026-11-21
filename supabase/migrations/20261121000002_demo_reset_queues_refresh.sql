-- ============================================================================
-- The hourly demo reset also queues a genuine report refresh.
--
-- Demo visitors opened the X-ray Pipeline tab to an empty timeline: the sample
-- books are generated, not uploaded, so nothing ever ran through the queue for
-- them. reset_demo_state() (pg_cron, hourly) now enqueues each sample
-- company's latest period on report_refresh_queue and says why; the existing
-- refresh_report_mv() cron job does the real REFRESH CONCURRENTLY and records
-- mv_refreshed with its duration. Viewers still don't see the machinery (the
-- pipeline_events policy is manager+); demo managers and admins do.
--
-- Re-creates reset_demo_state() from 20261019000002 with the block at the end.
-- Test: supabase/tests/demo_pipeline_test.sql
-- ============================================================================

create or replace function private.reset_demo_state()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('app.allow_privileged_profile_change', 'on', true);
  update public.profiles set role = 'super_admin', is_platform_staff = false
    where lower(email) = 'super@demo.local';
  update public.profiles set role = 'admin', is_platform_staff = false
    where lower(email) = 'admin@demo.local';
  update public.profiles set role = 'manager', is_platform_staff = false
    where lower(email) = 'manager@demo.local';
  update public.profiles set role = 'viewer', is_platform_staff = false
    where lower(email) in ('viewer@demo.local', 'demo@demo.local');
  update public.profiles set is_platform_staff = false
    where is_demo and is_platform_staff;

  -- Drop anything a visitor owned via a demo account (sandboxes cascade to
  -- their accounts/journal/batches/connectors/members).
  delete from public.entities e
   using public.profiles p
   where e.owner_id = p.id and p.is_demo;

  -- Restore demo memberships to the showcase entities (matches seed.sql).
  insert into public.entity_members (entity_id, user_id)
  select e.id, p.id
  from public.profiles p
  join public.entities e on (
    (lower(p.email) in ('manager@demo.local') and e.slug in ('northwind', 'acme'))
    or (lower(p.email) = 'viewer@demo.local' and e.slug = 'northwind')
    or (lower(p.email) in ('demo@demo.local', 'admin@demo.local', 'super@demo.local') and e.is_sample)
  )
  where p.is_demo
  on conflict (entity_id, user_id) do nothing;

  -- Remove demo memberships that aren't part of the seed shape.
  delete from public.entity_members em
  using public.profiles p, public.entities e
  where em.user_id = p.id and p.is_demo and em.entity_id = e.id
    and not (
      (lower(p.email) = 'manager@demo.local' and e.slug in ('northwind', 'acme'))
      or (lower(p.email) = 'viewer@demo.local' and e.slug = 'northwind')
      or (lower(p.email) in ('demo@demo.local', 'admin@demo.local', 'super@demo.local') and e.is_sample)
    );

  -- Keep the X-ray Pipeline tab alive for demo visitors — honestly: queue a
  -- real refresh of each sample company's latest period through the same
  -- queue a load uses. pg_cron performs it within a minute and logs a genuine
  -- mv_refreshed (with its measured duration); nothing here is a fake event.
  with latest as (
    select je.entity_id, max(je.period) as period
    from public.journal_entries je
    join public.entities e on e.id = je.entity_id and e.is_sample
    group by je.entity_id
  ),
  enqueue as (
    insert into public.report_refresh_queue (entity_id, period)
    select entity_id, period from latest
    on conflict (entity_id, period) do nothing
  )
  insert into public.pipeline_events (entity_id, stage, detail)
  select entity_id, 'refresh_enqueued',
         jsonb_build_object('periods', jsonb_build_array(period), 'reason', 'hourly demo reset')
  from latest;
end;
$$;

revoke all on function private.reset_demo_state() from public, anon, authenticated;
