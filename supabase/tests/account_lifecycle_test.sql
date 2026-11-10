-- pgTAP: a registered account's own companies (migration 42).
--
-- Registering with "Demo data — a clone to explore" generates a balanced set
-- of books; a second company can be added the same way; and a company that
-- has books can be deleted (its journal cascade used to queue a refresh for
-- the company being removed → foreign-key error). pg_safeupdate itself only
-- loads in API sessions — scripts/check-safeupdate.mjs guards that in CI.
-- Self-contained; everything rolls back.
begin;
create extension if not exists pgtap;
select plan(8);

create or replace function pg_temp.act_as(p_uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
end;
$$;

insert into auth.users (id, email) values
  ('dddd2000-0000-4000-8000-000000000001', 'tap-register@test.local');

select pg_temp.act_as('dddd2000-0000-4000-8000-000000000001');

-- 1. Register: admin, demo data.
select is(
  (public.provision_account('demo', 'admin')) ->> 'created',
  'true', 'registering with demo data creates the sandbox');
select ok(
  (select count(*) from public.journal_entries je
   join public.entities e on e.id = je.entity_id
   where e.owner_id = 'dddd2000-0000-4000-8000-000000000001') > 100,
  'the sandbox gets generated books');
select is(
  (select sum(je.debit) = sum(je.credit) from public.journal_entries je
   join public.entities e on e.id = je.entity_id
   where e.owner_id = 'dddd2000-0000-4000-8000-000000000001'),
  true, 'the generated books balance');

-- 2. A second company with demo data.
create temp table tap_second as
  select (public.create_my_entity('TAP Second', 'demo') ->> 'entity_id')::uuid as id;
select ok(
  (select count(*) from public.journal_entries where entity_id = (select id from tap_second)) > 100,
  'a second company gets its own books');

-- 3. Deleting a company that has books.
select lives_ok(
  $$ select public.delete_my_entity((select id from tap_second)) $$,
  'a company with books can be deleted');
select is(
  (select count(*)::int from public.entities where id = (select id from tap_second)),
  0, 'the company is gone');
select is(
  (select count(*)::int from public.journal_entries where entity_id = (select id from tap_second)),
  0, 'its journal went with it');
select is(
  (select count(*)::int from public.entities where owner_id = 'dddd2000-0000-4000-8000-000000000001'),
  1, 'the first sandbox is untouched');

select * from finish();
rollback;
