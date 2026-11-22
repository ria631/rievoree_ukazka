-- ============================================================================
-- The demo gate: an e-mail in, a demo session out — no shared password
--
-- Until now the browser signed in to the demo accounts with a password that
-- shipped in the app's JavaScript, so anyone could use those accounts through
-- the plain sign-in form or the Auth API. From here the only way in is the
-- `demo-session` edge function: a visitor leaves an e-mail (kept in
-- public.leads), the function asks this gate whether that's allowed, and mints
-- a session for the demo identity with the service role — no password at all.
-- The demo accounts' passwords can then be set to random values nobody knows
-- (supabase/ops/lock_demo_passwords.sql, run once after deploying).
--
--   public.demo_session_gate(kind, ip_hash, email)
--     kind 'enter'  — a new visitor; e-mail required, recorded as a lead.
--     kind 'switch' — an existing demo session changing identity (the role
--                     switch, the tour, the X-ray RLS tab); no e-mail.
--     Returns 'ok', 'rate_limited' or 'bad_email'. Per address (an IP hashed
--     with a server secret — the raw IP is never stored): 8 entries and 120
--     switches per 10 minutes. Callable by the service role only.
-- ============================================================================

create table if not exists private.demo_gate_log (
  id         bigint generated always as identity primary key,
  ip_hash    text not null check (length(ip_hash) between 16 and 128),
  kind       text not null check (kind in ('enter', 'switch')),
  created_at timestamptz not null default now()
);
create index if not exists demo_gate_log_recent on private.demo_gate_log (ip_hash, kind, created_at desc);
create index if not exists demo_gate_log_age on private.demo_gate_log (created_at);

comment on table private.demo_gate_log is
  'Demo gate rate-limit log: hashed client address + kind + time. Rows older than a day are pruned on each call.';

create or replace function public.demo_session_gate(p_kind text, p_ip_hash text, p_email text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_limit int;
  v_recent int;
begin
  if p_kind not in ('enter', 'switch') then
    raise exception 'kind must be enter or switch' using errcode = '22023';
  end if;
  if p_ip_hash is null or length(p_ip_hash) not between 16 and 128 then
    raise exception 'ip hash required' using errcode = '22023';
  end if;

  if p_kind = 'enter' and (
       v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
       or length(v_email) > 254
       or v_email like '%@demo.local') then
    return 'bad_email';
  end if;

  -- keep the log small: anything older than a day is no longer needed
  delete from private.demo_gate_log where created_at < now() - interval '1 day';

  v_limit := case p_kind when 'enter' then 8 else 120 end;
  select count(*) into v_recent
  from private.demo_gate_log
  where ip_hash = p_ip_hash and kind = p_kind and created_at > now() - interval '10 minutes';
  if v_recent >= v_limit then
    return 'rate_limited';
  end if;

  insert into private.demo_gate_log (ip_hash, kind) values (p_ip_hash, p_kind);

  -- one lead per e-mail per day is enough
  if p_kind = 'enter' and not exists (
       select 1 from public.leads
       where lower(email) = v_email and source = 'demo' and created_at > now() - interval '1 day') then
    insert into public.leads (email, source) values (v_email, 'demo');
  end if;

  return 'ok';
end;
$$;

revoke all on function public.demo_session_gate(text, text, text) from public, anon, authenticated;
grant execute on function public.demo_session_gate(text, text, text) to service_role;

comment on function public.demo_session_gate(text, text, text) is
  'Demo gate for the demo-session edge function: validates the e-mail, rate-limits per hashed address, records the lead. Service role only.';

-- ----------------------------------------------------------------------------
-- The demo-password lock (migration 20261013000001) refuses every change to a
-- demo account's password. Allow one deliberate exception — the operator's
-- one-off reset to random values — when the transaction opts in explicitly.
-- ----------------------------------------------------------------------------
create or replace function private.block_demo_password_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.encrypted_password is distinct from old.encrypted_password
     and exists (select 1 from public.profiles where id = new.id and is_demo)
     and coalesce(current_setting('app.allow_demo_password_reset', true), '') <> 'on' then
    raise exception 'the shared demo account password is locked'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
