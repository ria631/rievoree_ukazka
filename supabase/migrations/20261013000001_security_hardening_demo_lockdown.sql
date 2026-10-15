-- ============================================================================
-- Migration 34 — Security hardening: close admin escalation + lock down demo
--
-- Fixes two live issues found in the 2026-10 audit.
--
-- ISSUE A (critical — privilege escalation to global admin):
--   private.is_admin() returned TRUE for ANY admin who owned no entity. A fresh
--   signup owns nothing, so a single rpc('set_my_role','admin') (or Account →
--   Admin, or provision as admin then delete the sandbox) made the caller a
--   GLOBAL admin — able to read and approve every tenant's data.
--
--   Fix: global admin is now gated by an explicit, non-self-settable flag
--   profiles.is_platform_staff. "Owns no entity" is no longer sufficient.
--   A self-registered admin is never platform staff, so their access stays
--   membership-scoped to their own sandbox — exactly the advertised model.
--
-- ISSUE B (high — shared demo accounts can be wrecked / leak):
--   The public *@demo.local accounts could change their own role, password and
--   2FA, provision/own entities, manage connectors and add org members. One
--   visitor could lock everyone out or pollute the showcase. Fix: an is_demo
--   flag plus guards that make demo accounts strictly read-only at the DB
--   layer (not just hidden in the UI), and a reset routine (+ optional cron)
--   that restores the demo to its seeded state.
--
-- Idempotent: safe to run more than once (add column if not exists,
-- create or replace, guarded cron block). Mariia applies this by hand.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. New profile flags.
--    is_platform_staff — the ONLY source of global admin now. Frozen-ish:
--      it is added to the privileged-column guard so it can't be flipped
--      through the normal UPDATE path.
--    is_demo — marks the shared, read-only showcase accounts.
-- ----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists is_platform_staff boolean not null default false;
alter table public.profiles
  add column if not exists is_demo boolean not null default false;

comment on column public.profiles.is_platform_staff is
  'TRUE only for the platform owner/staff. The SOLE source of global (cross-tenant) admin — set manually, never through a client RPC.';
comment on column public.profiles.is_demo is
  'TRUE for the shared read-only showcase accounts (*@demo.local). Demo accounts are blocked from every write path at the DB layer.';

-- Seed the flags for the known demo accounts. '@demo.local' identifies them on
-- both local and remote. Platform staff = the seeded super_admin/admin accounts.
-- (Mariia: set is_platform_staff on YOUR real super_admin account too — see the
-- prod cleanup script; do NOT rely on the @demo.local match for your own login.)
update public.profiles
  set is_demo = true
  where lower(email) like '%@demo.local';

update public.profiles
  set is_platform_staff = true
  where lower(email) like '%@demo.local'
    and role in ('super_admin', 'admin');


-- ----------------------------------------------------------------------------
-- 2. Extend the frozen-column guard to is_platform_staff + is_demo.
--    These may only change through the sanctioned opt-in flag, same as role.
-- ----------------------------------------------------------------------------
create or replace function private.enforce_frozen_profile_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.id    is distinct from old.id
  or new.email is distinct from old.email
  or new.role  is distinct from old.role
  or new.is_active is distinct from old.is_active
  or new.is_platform_staff is distinct from old.is_platform_staff
  or new.is_demo is distinct from old.is_demo
  then
    if coalesce(current_setting('app.allow_privileged_profile_change', true), 'off') <> 'on' then
      raise exception 'frozen profile column changed — use the admin RPC'
        using errcode = '42501'; -- insufficient_privilege
    end if;
  end if;
  return new;
end;
$$;

-- The column grant already restricts authenticated to UPDATE (full_name) only,
-- so no API role can write the new columns directly; this re-asserts it in case
-- a later grant widens the table.
revoke update on public.profiles from authenticated, anon;
grant update (full_name) on public.profiles to authenticated;


-- ----------------------------------------------------------------------------
-- 3. Global admin is now gated by is_platform_staff — THE escalation fix.
--    super_admin stays global (platform owner). A plain 'admin' is global only
--    when explicitly marked platform staff; a self-registered admin is not, so
--    they remain scoped to their own entities whatever role they pick.
-- ----------------------------------------------------------------------------
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
    ),
    false)
$$;

comment on function private.is_admin() is
  'Global (cross-tenant) admin. TRUE for super_admin, or for an admin explicitly flagged is_platform_staff. A self-registered admin is NOT platform staff → scoped to their own entities by membership. Owning-no-entity is no longer sufficient (fixes the 2026-10 escalation).';


-- ----------------------------------------------------------------------------
-- 4. Demo detector + a reusable "block demo writes" guard.
-- ----------------------------------------------------------------------------
create or replace function private.is_demo_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select is_demo from public.profiles where id = (select auth.uid())),
    false)
$$;

revoke all on function private.is_demo_user() from public, anon;
grant execute on function private.is_demo_user() to authenticated, service_role;

create or replace function private.deny_if_demo()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select private.is_demo_user()) then
    raise exception 'the shared demo account is read-only — register your own account to try this'
      using errcode = '42501';
  end if;
end;
$$;

revoke all on function private.deny_if_demo() from public, anon;
grant execute on function private.deny_if_demo() to authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 5. Harden the self-serve RPCs against demo accounts.
--    set_my_role / provision_account / *_my_entity now refuse demo callers.
--    (set_my_role already refuses anyone who can reach a non-owned entity; this
--    adds the explicit demo block so demo@ — a member of all 4 showcase
--    entities — can never flip its own role, and neither can the single-entity
--    demo roles.)
-- ----------------------------------------------------------------------------
create or replace function public.set_my_role(p_role public.app_role)
returns public.app_role
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  perform private.deny_if_demo();
  if p_role not in ('viewer', 'manager', 'admin') then
    raise exception 'role must be viewer, manager or admin' using errcode = '22023';
  end if;

  -- Only inside your own sandbox: reject if any reachable entity isn't yours.
  if exists (
    select 1
    from public.entity_members em
    join public.entities e on e.id = em.entity_id
    where em.user_id = v_uid
      and e.owner_id is distinct from v_uid
  ) then
    raise exception 'role switching is only available in your own sandbox'
      using errcode = '42501';
  end if;

  perform set_config('app.allow_privileged_profile_change', 'on', true);
  update public.profiles set role = p_role where id = v_uid;
  return p_role;
end;
$$;

-- provision_account: identical to migration 24 except for the demo guard added
-- right after the auth check (marked below). Body reproduced verbatim so the
-- clone logic and column lists stay exactly as the working original.
create or replace function public.provision_account(
  p_mode text,
  p_role public.app_role
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_name    text;
  v_source  uuid;   -- Northwind (the clone template)
  v_entity  uuid;   -- the caller's personal entity
  v_batch   uuid;
  v_created boolean := false;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  perform private.deny_if_demo();   -- <-- SECURITY FIX: demo accounts can't provision
  if p_mode not in ('demo', 'own') then
    raise exception 'mode must be demo or own' using errcode = '22023';
  end if;
  if p_role not in ('viewer', 'manager', 'admin') then
    raise exception 'role must be viewer, manager or admin' using errcode = '22023';
  end if;

  select coalesce(nullif(full_name, ''), split_part(email, '@', 1))
    into v_name
  from public.profiles where id = v_uid;

  perform set_config('app.allow_privileged_profile_change', 'on', true);
  update public.profiles set role = p_role where id = v_uid;

  delete from public.entity_members em
  using public.entities e
  where em.user_id = v_uid
    and em.entity_id = e.id
    and e.owner_id is distinct from v_uid;

  select id into v_entity from public.entities
  where owner_id = v_uid order by created_at limit 1;

  if v_entity is null then
    insert into public.entities (name, slug, base_currency, is_sample, owner_id)
    values (
      coalesce(v_name, 'My') || ' — Sandbox',
      'sandbox-' || replace(v_uid::text, '-', ''),
      'EUR', false, v_uid
    )
    returning id into v_entity;
    v_created := true;
  end if;

  insert into public.entity_members (entity_id, user_id, granted_by)
  values (v_entity, v_uid, v_uid)
  on conflict (entity_id, user_id) do nothing;

  select id into v_source from public.entities where slug = 'northwind';

  if v_source is not null then
    insert into public.accounts (entity_id, code, name, type)
    select v_entity, a.code, a.name, a.type
    from public.accounts a
    where a.entity_id = v_source
    on conflict (entity_id, code) do nothing;
  end if;

  if p_mode = 'demo'
     and v_source is not null
     and not exists (select 1 from public.journal_entries where entity_id = v_entity)
  then
    insert into public.ingest_batches
      (entity_id, uploaded_by, source, file_name, storage_path, file_hash, period, status)
    values (
      v_entity, v_uid, 'manual', 'seed-history.csv',
      'ingest/' || v_entity::text || '/seed-history.csv',
      'clone-' || v_entity::text, '2026-04-01', 'loaded'
    )
    returning id into v_batch;

    insert into public.journal_entries
      (entity_id, account_id, batch_id, txn_date, description, debit, credit, currency)
    select v_entity, ta.id, v_batch, je.txn_date, je.description, je.debit, je.credit, je.currency
    from public.journal_entries je
    join public.accounts sa on sa.id = je.account_id
    join public.accounts ta on ta.entity_id = v_entity and ta.code = sa.code
    where je.entity_id = v_source;

    refresh materialized view private.mv_account_monthly;
  end if;

  return jsonb_build_object(
    'entity_id', v_entity,
    'mode', p_mode,
    'role', p_role,
    'created', v_created
  );
end;
$$;

-- create_my_entity: identical to migration 26 except for the demo guard.
create or replace function public.create_my_entity(
  p_name text,
  p_mode text default 'own'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_entity uuid;
  v_source uuid;
  v_batch  uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  perform private.deny_if_demo();   -- <-- SECURITY FIX: demo accounts can't create entities
  if p_mode not in ('demo', 'own') then
    raise exception 'mode must be demo or own' using errcode = '22023';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'name required' using errcode = '22023';
  end if;

  insert into public.entities (name, slug, base_currency, is_sample, owner_id)
  values (
    trim(p_name),
    'sb-' || replace(gen_random_uuid()::text, '-', ''),
    'EUR', false, v_uid
  )
  returning id into v_entity;

  insert into public.entity_members (entity_id, user_id, granted_by)
  values (v_entity, v_uid, v_uid);

  select id into v_source from public.entities where slug = 'northwind';

  if v_source is not null then
    insert into public.accounts (entity_id, code, name, type)
    select v_entity, a.code, a.name, a.type
    from public.accounts a
    where a.entity_id = v_source
    on conflict (entity_id, code) do nothing;
  end if;

  if p_mode = 'demo' and v_source is not null then
    insert into public.ingest_batches
      (entity_id, uploaded_by, source, file_name, storage_path, file_hash, period, status)
    values (
      v_entity, v_uid, 'manual', 'seed-history.csv',
      'ingest/' || v_entity::text || '/seed-history.csv',
      'clone-' || v_entity::text, '2026-04-01', 'loaded'
    )
    returning id into v_batch;

    insert into public.journal_entries
      (entity_id, account_id, batch_id, txn_date, description, debit, credit, currency)
    select v_entity, ta.id, v_batch, je.txn_date, je.description, je.debit, je.credit, je.currency
    from public.journal_entries je
    join public.accounts sa on sa.id = je.account_id
    join public.accounts ta on ta.entity_id = v_entity and ta.code = sa.code
    where je.entity_id = v_source;

    refresh materialized view private.mv_account_monthly;
  end if;

  return jsonb_build_object('entity_id', v_entity);
end;
$$;


-- ----------------------------------------------------------------------------
-- 6. add_org_member — stop pulling non-consenting users into your sandbox.
--    A visitor-owned sandbox could add ANY registered user by email, after
--    which can_manage_user let the owner reset that user's password/MFA.
--    Fix: a non-platform caller may only add users who own NO entity of their
--    own (i.e. invited-but-unprovisioned teammates), and never a demo or
--    platform-staff account. Platform staff keep the old behaviour.
-- ----------------------------------------------------------------------------
create or replace function public.add_org_member(p_entity_id uuid, p_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_target  uuid;
  v_owner   uuid;
  v_is_staff boolean := (select private.is_admin());
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  perform private.deny_if_demo();
  if coalesce(trim(p_email), '') = '' then
    raise exception 'email required' using errcode = '22023';
  end if;

  select owner_id into v_owner from public.entities where id = p_entity_id;
  if not found then
    raise exception 'entity not found' using errcode = 'P0002';
  end if;
  if not (v_is_staff or v_owner = v_uid) then
    raise exception 'only the entity owner (or a platform admin) may add members'
      using errcode = '42501';
  end if;

  select id into v_target from public.profiles where lower(email) = lower(trim(p_email));
  if not found then
    raise exception 'no user with email % — they must register first', p_email
      using errcode = 'P0002';
  end if;

  -- Non-platform owners cannot pull in accounts that aren't theirs to pull:
  -- never a demo/platform account, and never a user who already owns their own
  -- sandbox (that would let an owner seize management of a stranger's account).
  if not v_is_staff then
    if (select is_demo or is_platform_staff from public.profiles where id = v_target) then
      raise exception 'that account cannot be added' using errcode = '42501';
    end if;
    if exists (select 1 from public.entities where owner_id = v_target) then
      raise exception 'that user already has their own workspace and cannot be added to yours'
        using errcode = '42501';
    end if;
  end if;

  insert into public.entity_members (entity_id, user_id, granted_by)
  values (p_entity_id, v_target, v_uid)
  on conflict (entity_id, user_id) do nothing;

  return jsonb_build_object('entity_id', p_entity_id, 'user_id', v_target);
end;
$$;


-- ----------------------------------------------------------------------------
-- 7. can_manage_user — a scoped admin may never manage a platform/demo account.
--    (super_admin still may, except the last-super_admin guards elsewhere.)
-- ----------------------------------------------------------------------------
create or replace function public.can_manage_user(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select private.is_super_admin())
    or (
      (select private.user_role()) = 'admin'
      and (select private.is_admin())                 -- platform-staff admin only
      and p_user_id <> (select auth.uid())
      and (select private.shares_entity_with(p_user_id))
      and (select role from public.profiles where id = p_user_id) in ('viewer', 'manager')
      and not (select is_demo or is_platform_staff from public.profiles where id = p_user_id)
    ),
    false)
$$;


-- ----------------------------------------------------------------------------
-- 8. Block password + 2FA changes on the shared demo accounts (DB layer).
--    The UI also hides these, but a crafted request must fail too.
-- ----------------------------------------------------------------------------
create or replace function private.block_demo_password_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.encrypted_password is distinct from old.encrypted_password
     and exists (select 1 from public.profiles where id = new.id and is_demo) then
    raise exception 'the shared demo account password is locked'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists demo_password_lock on auth.users;
create trigger demo_password_lock
  before update on auth.users
  for each row execute function private.block_demo_password_change();

create or replace function private.block_demo_mfa()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.profiles where id = new.user_id and is_demo) then
    raise exception 'the shared demo account cannot enroll 2FA'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists demo_mfa_lock on auth.mfa_factors;
create trigger demo_mfa_lock
  before insert on auth.mfa_factors
  for each row execute function private.block_demo_mfa();


-- ----------------------------------------------------------------------------
-- 9. reset_demo_state — restore the shared demo to its seeded shape.
--    Fixes roles/memberships that visitors changed before this migration, and
--    removes any sandbox/connector/batch a visitor created on a demo account.
--    Service-role only; wired to pg_cron below so the demo self-heals hourly.
-- ----------------------------------------------------------------------------
create or replace function private.reset_demo_state()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Correct the seeded roles (a visitor may have flipped them before the fix).
  perform set_config('app.allow_privileged_profile_change', 'on', true);
  update public.profiles set role = 'super_admin', is_platform_staff = true
    where lower(email) = 'super@demo.local';
  update public.profiles set role = 'admin', is_platform_staff = true
    where lower(email) = 'admin@demo.local';
  update public.profiles set role = 'manager', is_platform_staff = false
    where lower(email) = 'manager@demo.local';
  update public.profiles set role = 'viewer', is_platform_staff = false
    where lower(email) in ('viewer@demo.local', 'demo@demo.local');

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
    or (lower(p.email) = 'demo@demo.local' and e.is_sample)
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
      or (lower(p.email) = 'demo@demo.local' and e.is_sample)
    );
end;
$$;

revoke all on function private.reset_demo_state() from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron unavailable — reset_demo_state installed, scheduling skipped.';
    return;
  end if;
  execute 'create extension if not exists pg_cron';
  if exists (select 1 from cron.job where jobname = 'reset-demo-state') then
    perform cron.unschedule('reset-demo-state');
  end if;
  perform cron.schedule('reset-demo-state', '0 * * * *',
    $job$select private.reset_demo_state();$job$);
end;
$$;

-- One immediate reset so the demo is clean the moment this migration lands.
select private.reset_demo_state();
