-- pgTAP: the shared demo admins are never platform staff (migration 43).
--
-- Their password is public, so super@demo.local / admin@demo.local must not
-- pass any privileged check: no cross-tenant reads of a registered user's
-- data, no managing real users, no direct writes to entities / memberships.
-- The showcase still works: as members they see all four sample companies.
-- Self-contained; everything rolls back.
begin;
create extension if not exists pgtap;
select plan(12);

create or replace function pg_temp.act_as(p_uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
end;
$$;

-- --- fixture: two sample companies, a demo super + admin, one real user ---
insert into auth.users (id, email) values
  ('dddd3000-0000-4000-8000-000000000001', 'tap-super@demo.local'),
  ('dddd3000-0000-4000-8000-000000000002', 'tap-admin@demo.local'),
  ('dddd3000-0000-4000-8000-000000000003', 'tap-real@example.com');
insert into public.entities (id, name, slug, is_sample) values
  ('eeee3000-0000-4000-8000-000000000001', 'TAP Sample A', 'tap-sample-a', true),
  ('eeee3000-0000-4000-8000-000000000002', 'TAP Sample B', 'tap-sample-b', true);
insert into public.entities (id, name, slug, owner_id) values
  ('eeee3000-0000-4000-8000-000000000003', 'TAP Real Co', 'tap-real-co', 'dddd3000-0000-4000-8000-000000000003');
select set_config('app.allow_privileged_profile_change', 'on', true);
update public.profiles set role = 'super_admin', is_demo = true, is_platform_staff = true
  where id = 'dddd3000-0000-4000-8000-000000000001';
update public.profiles set role = 'admin', is_demo = true, is_platform_staff = true
  where id = 'dddd3000-0000-4000-8000-000000000002';
update public.profiles set role = 'admin' where id = 'dddd3000-0000-4000-8000-000000000003';
insert into public.entity_members (entity_id, user_id) values
  ('eeee3000-0000-4000-8000-000000000001', 'dddd3000-0000-4000-8000-000000000002'),
  ('eeee3000-0000-4000-8000-000000000002', 'dddd3000-0000-4000-8000-000000000002'),
  ('eeee3000-0000-4000-8000-000000000003', 'dddd3000-0000-4000-8000-000000000003');

-- ========================================================================
-- 1. Demo super admin: no privileged check passes, even with the staff flag.
-- ========================================================================
select pg_temp.act_as('dddd3000-0000-4000-8000-000000000001');
select is((select private.is_super_admin()), false, 'a demo super_admin is not a super admin');
select is((select private.is_admin()), false, 'a demo super_admin gets no cross-tenant bypass');
select is((select public.am_i_super_admin()), false, 'admin-users sees no super admin (no invites)');
select is((select public.can_manage_user('dddd3000-0000-4000-8000-000000000003')), false,
  'a demo super_admin cannot manage a real user (no password / 2FA resets)');
select throws_ok(
  $$ select public.admin_set_user_active('dddd3000-0000-4000-8000-000000000003', false) $$,
  '42501', NULL, 'a demo super_admin cannot deactivate a real user');
select is(
  (select count(*)::int from public.profiles where id = 'dddd3000-0000-4000-8000-000000000003'),
  0, 'a demo super_admin cannot read a real user''s profile (e-mail)');
select throws_ok(
  $$ select public.admin_set_member_role('dddd3000-0000-4000-8000-000000000003', 'viewer') $$,
  '42501', NULL, 'a demo super_admin cannot change a real user''s role');

-- ========================================================================
-- 2. Demo admin: the showcase via membership, nothing of anyone else.
-- ========================================================================
select pg_temp.act_as('dddd3000-0000-4000-8000-000000000002');
select is((select private.is_admin()), false, 'a demo admin is not platform staff');
select is(
  (select count(*)::int from public.entities where slug like 'tap-sample-%'),
  2, 'a demo admin sees the sample companies (as a member)');
select is(
  (select count(*)::int from public.entities where id = 'eeee3000-0000-4000-8000-000000000003'),
  0, 'a demo admin does not see a registered user''s company');

-- ========================================================================
-- 3. The hourly reset keeps it that way.
-- ========================================================================
reset role;
select private.reset_demo_state();
select is(
  (select count(*)::int from public.profiles where is_demo and is_platform_staff),
  0, 'reset_demo_state clears the staff flag on every demo account');
select pg_temp.act_as('dddd3000-0000-4000-8000-000000000003');
select is((select count(*)::int from public.entities where id = 'eeee3000-0000-4000-8000-000000000003'),
  1, 'the real user still sees their own company');

select * from finish();
rollback;
