-- pgTAP: a shared demo identity never sees a real account in the user list.
--
-- admin@demo.local's password is public. A real user who joins a sample
-- company must stay invisible to it (no e-mail, no MFA state), while a real
-- admin of that company still sees everyone. Self-contained; rolls back.
begin;
create extension if not exists pgtap;
select plan(5);

create or replace function pg_temp.act_as(p_uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
end;
$$;

-- --- fixture: one sample company; a demo admin, a demo viewer, two real users ---
insert into auth.users (id, email) values
  ('dddd4000-0000-4000-8000-000000000001', 'tap-demo-admin@demo.local'),
  ('dddd4000-0000-4000-8000-000000000002', 'tap-demo-viewer@demo.local'),
  ('dddd4000-0000-4000-8000-000000000003', 'tap-real-viewer@example.com'),
  ('dddd4000-0000-4000-8000-000000000004', 'tap-real-admin@example.com');
insert into public.entities (id, name, slug, is_sample) values
  ('eeee4000-0000-4000-8000-000000000001', 'TAP Privacy Sample', 'tap-privacy-sample', true);
select set_config('app.allow_privileged_profile_change', 'on', true);
update public.profiles set role = 'admin', is_demo = true
  where id = 'dddd4000-0000-4000-8000-000000000001';
update public.profiles set is_demo = true
  where id = 'dddd4000-0000-4000-8000-000000000002';
update public.profiles set role = 'admin'
  where id = 'dddd4000-0000-4000-8000-000000000004';
insert into public.entity_members (entity_id, user_id) values
  ('eeee4000-0000-4000-8000-000000000001', 'dddd4000-0000-4000-8000-000000000001'),
  ('eeee4000-0000-4000-8000-000000000001', 'dddd4000-0000-4000-8000-000000000002'),
  ('eeee4000-0000-4000-8000-000000000001', 'dddd4000-0000-4000-8000-000000000003'),
  ('eeee4000-0000-4000-8000-000000000001', 'dddd4000-0000-4000-8000-000000000004');

-- 1. The demo admin: demo profiles only.
select pg_temp.act_as('dddd4000-0000-4000-8000-000000000001');
create temp table tap_demo_list on commit drop as
  select jsonb_array_elements(public.list_org_members()) as m;
select is(
  (select count(*)::int from tap_demo_list where m->>'email' not like '%@demo.local'),
  0, 'a demo admin sees no real account in its company');
select is(
  (select count(*)::int from tap_demo_list where m->>'id' = 'dddd4000-0000-4000-8000-000000000002'),
  1, 'a demo admin still sees the other demo identities (the showcase works)');
select is(
  (select count(*)::int from tap_demo_list where (m->>'is_self')::boolean),
  1, 'a demo admin sees itself');

-- 2. A real admin of the same company: everyone, as before.
select pg_temp.act_as('dddd4000-0000-4000-8000-000000000004');
select is(
  (select count(*)::int from jsonb_array_elements(public.list_org_members()) m
    where m->>'id' = 'dddd4000-0000-4000-8000-000000000003'),
  1, 'a real admin still sees the real members of their company');
select is(
  (select count(*)::int from jsonb_array_elements(public.list_org_members()) m
    where m->>'id' = 'dddd4000-0000-4000-8000-000000000001'),
  1, 'a real admin sees demo members too (nothing hidden from real admins)');

select * from finish();
rollback;
