-- pgTAP: tenant isolation + the 2026-10 hardening (migration 34).
--
-- Proves, as live RLS under simulated JWTs, that:
--   * a self-registered "admin" (not platform staff) stays scoped — the core
--     escalation that migration 34 closed;
--   * platform staff keep global access;
--   * viewer/manager see only their assigned entities;
--   * the shared demo account is read-only (write RPCs refuse it).
-- Self-contained; everything rolls back.
begin;
create extension if not exists pgtap;
select plan(9);

-- --- helpers --------------------------------------------------------------
-- Impersonate a user the way PostgREST does: role `authenticated` + a JWT whose
-- `sub` is the user id. The private.* helpers read auth.uid() from these claims.
create or replace function pg_temp.act_as(p_uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
end;
$$;

create or replace function pg_temp.act_anon() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  reset role;
end;
$$;

-- --- fixture (as the table owner, RLS bypassed) ---------------------------
-- Two showcase entities (platform-owned) + their seed-style memberships.
insert into auth.users (id, email) values
  ('dddd0000-0000-4000-8000-000000000001', 'tap-super@test.local'),
  ('dddd0000-0000-4000-8000-000000000002', 'tap-viewer@test.local'),
  ('dddd0000-0000-4000-8000-000000000003', 'tap-attacker@test.local'),
  ('dddd0000-0000-4000-8000-000000000004', 'tap-demo@test.local');

insert into public.entities (id, name, slug, is_sample) values
  ('eeee0000-0000-4000-8000-000000000001', 'TAP Alpha', 'tap-alpha', true),
  ('eeee0000-0000-4000-8000-000000000002', 'TAP Beta',  'tap-beta',  true);

-- Set roles/flags through the frozen-column opt-in (same path the RPCs use).
select set_config('app.allow_privileged_profile_change', 'on', true);
update public.profiles set role = 'super_admin', is_platform_staff = true
  where id = 'dddd0000-0000-4000-8000-000000000001';
update public.profiles set role = 'viewer'
  where id = 'dddd0000-0000-4000-8000-000000000002';
update public.profiles set role = 'viewer'
  where id = 'dddd0000-0000-4000-8000-000000000003';
update public.profiles set role = 'viewer', is_demo = true
  where id = 'dddd0000-0000-4000-8000-000000000004';

-- Viewer is assigned to Alpha only.
insert into public.entity_members (entity_id, user_id) values
  ('eeee0000-0000-4000-8000-000000000001', 'dddd0000-0000-4000-8000-000000000002');

-- ========================================================================
-- 1. Baseline: viewer sees exactly its one assigned entity.
-- ========================================================================
select pg_temp.act_as('dddd0000-0000-4000-8000-000000000002');
select is(
  (select count(*)::int from public.entities),
  1, 'viewer sees only its one assigned entity');

-- ========================================================================
-- 2. THE ESCALATION: an unprivileged user flips itself to admin.
--    Pre-fix this granted global visibility; now it must stay scoped.
-- ========================================================================
select pg_temp.act_as('dddd0000-0000-4000-8000-000000000003');
select is(
  (select public.set_my_role('admin')::text),
  'admin', 'attacker may set its own role inside its (empty) sandbox');

-- Still acting as the attacker (now role=admin, is_platform_staff=false):
select is(
  (select count(*)::int from public.entities),
  0, 'self-made admin (not platform staff) sees NO showcase entities');

select is(
  (select count(*)::int from public.profiles),
  1, 'self-made admin sees only its own profile, not everyone');

select is(
  (select private.is_admin()),
  false, 'private.is_admin() is false for a non-platform admin');

-- ========================================================================
-- 3. Platform staff keep global access.
-- ========================================================================
select pg_temp.act_as('dddd0000-0000-4000-8000-000000000001');
select is(
  (select private.is_admin()),
  true, 'private.is_admin() is true for platform staff');
select ok(
  (select count(*)::int from public.entities) >= 2,
  'platform super_admin sees all entities');

-- ========================================================================
-- 4. The shared demo account is read-only.
-- ========================================================================
select pg_temp.act_as('dddd0000-0000-4000-8000-000000000004');
select throws_ok(
  $$ select public.set_my_role('admin') $$,
  '42501',
  'the shared demo account is read-only — register your own account to try this',
  'demo account cannot change its own role');
select throws_ok(
  $$ select public.create_my_entity('x', 'own') $$,
  '42501', NULL,
  'demo account cannot create entities');

select pg_temp.act_anon();
select * from finish();
rollback;
