-- pgTAP: the demo gate (public.demo_session_gate) and the demo-password lock.
--
-- The gate is the database half of the demo-session edge function: only the
-- service role may call it; it refuses bad e-mails, records a lead once a day
-- per e-mail, and rate-limits per hashed address. The password lock still
-- refuses a demo password change unless the transaction opts in explicitly.
-- Self-contained; rolls back.
begin;
create extension if not exists pgtap;
select plan(12);

-- Can the current role run the gate at all? (permission denied → false)
create or replace function pg_temp.can_call() returns boolean
language plpgsql as $$
begin
  perform public.demo_session_gate('enter', repeat('a', 32), 'x@example.com');
  return true;
exception when insufficient_privilege then
  return false;
end;
$$;

-- 1–2. Not callable through the API, by anyone without the service role.
select set_config('role', 'anon', true);
select is(pg_temp.can_call(), false, 'anon cannot call the demo gate');
reset role;
select set_config('role', 'authenticated', true);
select is(pg_temp.can_call(), false, 'a signed-in user cannot call the demo gate');
reset role;

-- From here as the service role (what the edge function uses).
select set_config('role', 'service_role', true);

-- 3–4. Bad e-mails are refused and leave nothing behind.
select is(public.demo_session_gate('enter', repeat('b', 32), 'not-an-email'), 'bad_email', 'a malformed e-mail is refused');
select is(public.demo_session_gate('enter', repeat('b', 32), 'admin@demo.local'), 'bad_email', 'a demo address is not a lead');

-- 5–6. A good e-mail gets in and is recorded once, lower-cased.
select is(public.demo_session_gate('enter', repeat('c', 32), '  Tap.Visitor@Example.COM '), 'ok', 'a valid e-mail opens the demo');
select is(public.demo_session_gate('enter', repeat('c', 32), 'tap.visitor@example.com'), 'ok', 'the same visitor can come back');
reset role;
select is((select count(*)::int from public.leads where email = 'tap.visitor@example.com' and source = 'demo'), 1,
  'the lead is recorded once per day, lower-cased');
select set_config('role', 'service_role', true);

-- 8. Switching identities needs no e-mail and records no lead.
select is(public.demo_session_gate('switch', repeat('d', 32), null), 'ok', 'a demo session may switch identity');

-- 9. Eight entries per address per ten minutes, then the gate says no.
do $$ begin
  perform public.demo_session_gate('enter', repeat('e', 32), 'tap' || g || '@example.com') from generate_series(1, 8) g;
end $$;
select is(public.demo_session_gate('enter', repeat('e', 32), 'tap9@example.com'), 'rate_limited', 'the ninth entry from one address is refused');

-- 10. Another address is unaffected.
select is(public.demo_session_gate('enter', repeat('f', 32), 'tap10@example.com'), 'ok', 'another address still gets in');
reset role;

-- 11–12. The demo-password lock holds, unless the transaction opts in.
insert into auth.users (id, email) values ('dddd6000-0000-4000-8000-000000000001', 'tap-gate@demo.local');
update public.profiles set is_demo = true where id = 'dddd6000-0000-4000-8000-000000000001';
select throws_ok(
  $$ update auth.users set encrypted_password = 'x' where id = 'dddd6000-0000-4000-8000-000000000001' $$,
  '42501', NULL, 'a demo password cannot be changed by default');
select set_config('app.allow_demo_password_reset', 'on', true);
select lives_ok(
  $$ update auth.users set encrypted_password = 'y' where id = 'dddd6000-0000-4000-8000-000000000001' $$,
  'the operator can reset demo passwords when the transaction opts in');

select * from finish();
rollback;
