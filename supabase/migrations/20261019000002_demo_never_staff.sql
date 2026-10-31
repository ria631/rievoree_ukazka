-- ============================================================================
-- Migration 43 — the shared demo accounts are never platform staff
--
-- super@demo.local and admin@demo.local share the public demo password, yet
-- they carried is_platform_staff, so every privileged check let them through:
-- reading every registered user's e-mail, companies and books (is_admin()
-- bypasses the tenant filter), changing roles or deactivating real users, and
-- — through the admin-users edge function, which authorizes via
-- am_i_super_admin() / can_manage_user() — inviting new super admins or
-- resetting someone's 2FA.
--
-- Every one of those paths goes through private.is_super_admin() or
-- private.is_admin(), so both now return false for a demo profile. The demo
-- admins keep their showcase view (all four sample companies) through ordinary
-- memberships instead of the bypass, restored by reset_demo_state.
-- ============================================================================

create or replace function private.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.role = 'super_admin' and not p.is_demo
     from public.profiles p
     where p.id = (select auth.uid()) and p.is_active),
    false)
$$;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select private.is_super_admin())
    or exists (
      select 1 from public.profiles
      where id = (select auth.uid())
        and is_active
        and role = 'admin'
        and is_platform_staff
        and not is_demo
    ),
    false)
$$;

comment on function private.is_admin() is
  'TRUE for a real super_admin, or an admin explicitly flagged is_platform_staff — never for a shared demo account. Grants the cross-tenant bypass in RLS.';

-- Hourly demo reset: no demo account is staff; the demo admins see the four
-- sample companies as members. Otherwise migration 34's body.
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
end;
$$;

revoke all on function private.reset_demo_state() from public, anon, authenticated;

-- Apply now (also clears the staff flag on the demo admins).
select private.reset_demo_state();
