-- ============================================================================
-- Migration 41 — the spreadsheet-link connector (replaces Google Drive)
--
-- Google Drive needed a Google-verified OAuth app (a restricted scope → paid
-- security assessment), so it could never run for real in a public demo. The
-- replacement works with nothing to approve: paste a public link to a CSV —
-- a Google Sheet published to the web as CSV, a OneDrive/Dropbox share link,
-- any https file — and the DATABASE fetches it:
--
--   sync_url_connector()   pg_net GET of the link (async, returns a request id)
--   collect_url_sync()     picks up the response: CSV parsed IN SQL, then the
--                          same ingest_connector_rows → transform → z-score →
--                          review path as an upload. A file whose content hash
--                          was already ingested is skipped ("unchanged").
--   run_connector_syncs()  the existing pg_cron job (every 10 min) re-fetches
--                          each active link hourly and finishes pending fetches.
--
-- Safety: https only, public DNS names only (no IPs / localhost / internal
-- names), a redirect to anything else is rejected, 2 MB / 5,000 rows max, and
-- nothing but CSV-shaped content with an account + date header is accepted.
-- The shared demo accounts can't create or change connectors (trigger below);
-- their "Sync now" fetches and parses for real but only PREVIEWS — no write.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. A link connector has no webhook secret.
-- ----------------------------------------------------------------------------
alter table public.connectors drop constraint if exists connectors_kind_secret_chk;
alter table public.connectors add constraint connectors_kind_secret_chk
  check ((kind = 'webhook') = (webhook_secret is not null));


-- ----------------------------------------------------------------------------
-- 2. Shared demo accounts can't create, change or delete connectors.
-- ----------------------------------------------------------------------------
create or replace function private.block_demo_connector_writes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select private.is_demo_user()) then
    raise exception 'the shared demo account is read-only — register to add your own connectors'
      using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists connectors_block_demo on public.connectors;
create trigger connectors_block_demo
  before insert or update or delete on public.connectors
  for each row execute function private.block_demo_connector_writes();


-- ----------------------------------------------------------------------------
-- 3. Link validation + a small CSV reader in SQL
-- ----------------------------------------------------------------------------
-- A public https address: DNS name with a real TLD, no IP literal, no port but
-- 443, nothing that resolves inside a private network by name.
create or replace function private.connector_url_ok(p_url text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    length(p_url) <= 2000
    and p_url ~* '^https://[a-z0-9.-]+(:443)?([/?#][^[:space:]]*)?$'
    and lower(substring(p_url from '^https://([^/:?#]+)')) ~ '^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$'
    and lower(substring(p_url from '^https://([^/:?#]+)'))
        !~ '(^|\.)(localhost|local|internal|intranet|lan|home|corp|localdomain)$',
    false)
$$;

-- The link people actually copy → the address that serves CSV:
--   Sheets …/edit#gid=N         → …/export?format=csv&gid=N  (sheet shared "anyone with the link")
--   Sheets published …/pubhtml  → …/pub?output=csv
--   Dropbox …?dl=0              → …?dl=1
create or replace function private.normalize_sheet_url(p_url text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when u ~ '^https://docs\.google\.com/spreadsheets/d/e/[A-Za-z0-9_-]+/pubhtml'
      then regexp_replace(u, '/pubhtml.*$', '/pub?output=csv'
             || coalesce('&gid=' || substring(u from '[?&#]gid=([0-9]+)'), ''))
    when u ~ '^https://docs\.google\.com/spreadsheets/d/[A-Za-z0-9_-]{20,}' and u !~ '/export\?'
      then 'https://docs.google.com/spreadsheets/d/'
             || substring(u from '/spreadsheets/d/([A-Za-z0-9_-]+)')
             || '/export?format=csv&gid=' || coalesce(substring(u from '[?&#]gid=([0-9]+)'), '0')
    when u ~ '^https://(www\.)?dropbox\.com/' and u ~ '[?&]dl=0'
      then regexp_replace(u, '([?&])dl=0', '\1dl=1')
    else u
  end
  from (select btrim(coalesce(p_url, '')) as u) s
$$;

-- One CSV line → its fields ("quoted, with ""escapes""" supported).
create or replace function private.csv_fields(p_line text, p_delim text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(
           case when t.m[1] like '"%"' then replace(substr(t.m[1], 2, length(t.m[1]) - 2), '""', '"')
                else btrim(t.m[1]) end
           order by t.ord), '{}')
  from regexp_matches(p_line || p_delim, '("(?:[^"]|"")*"|[^' || p_delim || ']*)' || p_delim, 'g')
       with ordinality as t(m, ord)
$$;

-- "1,234.50" / "1.234,50" / "12,5" / "1 234" → a plain numeric string.
create or replace function private.csv_number(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when v = '' then null
    when v ~ '^-?\d+(\.\d+)?$' then v
    when v ~ '^-?\d+,\d{1,2}$' then replace(v, ',', '.')
    when v ~ '^-?\d{1,3}(,\d{3})+(\.\d+)?$' then replace(v, ',', '')
    when v ~ '^-?\d{1,3}(\.\d{3})+(,\d+)?$' then replace(replace(v, '.', ''), ',', '.')
    else null end
  from (select regexp_replace(coalesce(p, ''), '[[:space:]'']', '', 'g') as v) s
$$;

-- 2026-10-02 / 02.10.2026 / 02/10/2026 / 2026/10/02 (+ a time part) → YYYY-MM-DD.
create or replace function private.csv_date(p text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := regexp_replace(btrim(coalesce(p, '')), '^(\d{4}-\d{1,2}-\d{1,2})[T ].*$', '\1');
  m text[];
begin
  if v ~ '^\d{4}-\d{1,2}-\d{1,2}$' then
    m := regexp_match(v, '^(\d{4})-(\d{1,2})-(\d{1,2})$');
    return to_char(make_date(m[1]::int, m[2]::int, m[3]::int), 'YYYY-MM-DD');
  elsif v ~ '^\d{1,2}[./]\d{1,2}[./]\d{4}$' then
    m := regexp_match(v, '^(\d{1,2})[./](\d{1,2})[./](\d{4})$');
    return to_char(make_date(m[3]::int, m[2]::int, m[1]::int), 'YYYY-MM-DD');
  elsif v ~ '^\d{4}[./]\d{1,2}[./]\d{1,2}$' then
    m := regexp_match(v, '^(\d{4})[./](\d{1,2})[./](\d{1,2})$');
    return to_char(make_date(m[1]::int, m[2]::int, m[3]::int), 'YYYY-MM-DD');
  end if;
  return null;
exception when others then
  return null; -- e.g. 31.02.2026
end;
$$;

-- CSV text → the typed rows ingest_connector_rows takes. Header names are
-- matched against aliases (EN + SK); without an account and a date column the
-- result is empty. Raw cells that look like spreadsheet formulas are defused.
create or replace function private.parse_csv_rows(p_text text)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_lines   text[];
  v_delim   text;
  v_head    text[];
  v_idx     jsonb := '{}'::jsonb;
  v_aliases jsonb := '{
    "account_code": ["account code", "account", "code", "accountcode", "acct", "account no", "account number", "ucet", "účet"],
    "txn_date":     ["txn date", "date", "transaction date", "posting date", "day", "datum", "dátum"],
    "debit":        ["debit", "dr", "debet", "md", "má dať"],
    "credit":       ["credit", "cr", "kredit", "dal"],
    "currency":     ["currency", "ccy", "mena"],
    "description":  ["description", "desc", "memo", "narrative", "note", "popis", "text"]
  }'::jsonb;
  k text;
  j int;
  v_out jsonb;
begin
  v_lines := array(
    select l from regexp_split_to_table(regexp_replace(coalesce(p_text, ''), '^' || chr(65279), ''), E'\r?\n') l
    where btrim(l) <> '');
  if coalesce(array_length(v_lines, 1), 0) < 2 then
    return '[]'::jsonb;
  end if;

  v_delim := case when position(',' in v_lines[1]) = 0 and position(';' in v_lines[1]) > 0 then ';' else ',' end;
  v_head := array(
    select lower(regexp_replace(btrim(h), '[[:space:]_-]+', ' ', 'g'))
    from unnest(private.csv_fields(v_lines[1], v_delim)) with ordinality as t(h, o) order by o);

  for k in select jsonb_object_keys(v_aliases) loop
    for j in 1 .. coalesce(array_length(v_head, 1), 0) loop
      if (v_aliases -> k) ? v_head[j] then
        v_idx := v_idx || jsonb_build_object(k, j);
        exit;
      end if;
    end loop;
  end loop;
  if not (v_idx ? 'account_code' and v_idx ? 'txn_date') then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(r.obj order by r.ln), '[]'::jsonb) into v_out
  from (
    select x.ln, jsonb_build_object(
      'account_code', nullif(btrim(coalesce(x.c[(v_idx ->> 'account_code')::int], '')), ''),
      'txn_date',     private.csv_date(x.c[(v_idx ->> 'txn_date')::int]),
      'description',  case when v_idx ? 'description' then nullif(btrim(coalesce(x.c[(v_idx ->> 'description')::int], '')), '') end,
      'debit',        case when v_idx ? 'debit'  then private.csv_number(x.c[(v_idx ->> 'debit')::int]) end,
      'credit',       case when v_idx ? 'credit' then private.csv_number(x.c[(v_idx ->> 'credit')::int]) end,
      'currency',     case when v_idx ? 'currency' then nullif(upper(btrim(coalesce(x.c[(v_idx ->> 'currency')::int], ''))), '') end,
      'raw', (
        select jsonb_object_agg(coalesce(nullif(h.name, ''), 'col' || h.o),
                 case when coalesce(x.c[h.o], '') ~ '^[=+@-]' then '''' || x.c[h.o] else coalesce(x.c[h.o], '') end)
        from unnest(v_head) with ordinality as h(name, o))
    ) as obj
    from (
      select l.ln, private.csv_fields(l.line, v_delim) as c
      from unnest(v_lines[2:]) with ordinality as l(line, ln)
    ) x
  ) r;
  return v_out;
end;
$$;


-- ----------------------------------------------------------------------------
-- 4. Fetching: pg_net requests in flight, and what to do with an answer
-- ----------------------------------------------------------------------------
create table if not exists private.url_fetches (
  request_id   bigint primary key,
  connector_id uuid not null references public.connectors (id) on delete cascade,
  requested_by uuid,
  dry_run      boolean not null default false,
  created_at   timestamptz not null default now()
);
create index if not exists url_fetches_connector_idx on private.url_fetches (connector_id, created_at desc);
revoke all on private.url_fetches from public, anon, authenticated;

create or replace function private.start_url_fetch(p_connector_id uuid, p_by uuid, p_dry boolean)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_id  bigint;
begin
  select private.normalize_sheet_url(config ->> 'url') into v_url from public.connectors where id = p_connector_id;
  if not private.connector_url_ok(v_url) then
    raise exception 'the link must be a public https:// address' using errcode = '22023';
  end if;
  v_id := net.http_get(
    url := v_url,
    headers := jsonb_build_object('Accept', 'text/csv, text/plain;q=0.9, */*;q=0.5',
                                  'User-Agent', 'rievoree-xray-connector/1.0'),
    timeout_milliseconds := 20000);
  insert into private.url_fetches (request_id, connector_id, requested_by, dry_run)
  values (v_id, p_connector_id, p_by, p_dry);
  return v_id;
end;
$$;

-- The answer to one fetch → an error, a preview (demo), "unchanged", or a new
-- batch on its way to review. The caller has already claimed the fetch row.
create or replace function private.process_url_fetch(
  p_fetch     private.url_fetches,
  p_status    integer,
  p_content   text,
  p_headers   jsonb,
  p_timed_out boolean,
  p_error     text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conn    public.connectors;
  v_loc     text := coalesce(p_headers ->> 'location', p_headers ->> 'Location');
  v_err     text;
  v_rows    jsonb;
  v_n       int := 0;
  v_hash    text;
  v_period  text;
  v_summary jsonb;
  v_file    text;
  v_dup     uuid;
begin
  select * into v_conn from public.connectors where id = p_fetch.connector_id;
  if not found then
    return jsonb_build_object('status', 'error', 'message', 'connector no longer exists');
  end if;

  v_err := case
    when coalesce(p_timed_out, false) then 'the link did not answer within 20 s'
    when p_status is null then 'could not fetch the link: ' || coalesce(p_error, 'network error')
    when p_status not between 200 and 299 then 'the link answered HTTP ' || p_status
    when v_loc ~* '^[a-z]+://' and not private.connector_url_ok(v_loc)
      then 'the link redirected to a non-public or non-https address'
    when coalesce(p_content, '') ~* '^[[:space:]]*<(!doctype html|html)'
      then 'the link returned a web page, not a CSV file — share the sheet as "Anyone with the link" (or File → Share → Publish to web → CSV)'
    when length(coalesce(p_content, '')) > 2000000 then 'the file is larger than 2 MB'
    when array_length(regexp_split_to_array(coalesce(p_content, ''), E'\n'), 1) > 5001 then 'the file has more than 5,000 rows'
  end;
  if v_err is null then
    v_rows := private.parse_csv_rows(p_content);
    v_n := jsonb_array_length(v_rows);
    if v_n = 0 then
      v_err := 'no rows found — the first line must be a header with an account column and a date column'
        || coalesce(' (found: ' || nullif(left(btrim(split_part(
             regexp_replace(coalesce(p_content, ''), '^' || chr(65279), ''), E'\n', 1), E' \r\t'), 160), '') || ')', '');
    end if;
  end if;

  if v_err is not null then
    if not p_fetch.dry_run then
      -- Stays active: the next hourly tick simply tries again.
      update public.connectors set last_error = v_err, last_sync_at = now() where id = v_conn.id;
    end if;
    insert into public.pipeline_events (entity_id, stage, actor, detail)
    values (v_conn.entity_id, 'connector_error', p_fetch.requested_by,
            jsonb_build_object('connector_id', v_conn.id, 'error', v_err));
    return jsonb_build_object('status', 'error', 'message', v_err);
  end if;

  v_hash := encode(extensions.digest(p_content, 'sha256'), 'hex');
  select left(r ->> 'txn_date', 7) into v_period
  from jsonb_array_elements(v_rows) r where r ->> 'txn_date' is not null
  group by 1 order by count(*) desc, 1 desc limit 1;

  select jsonb_build_object(
    'rows', v_n,
    'period', v_period,
    'debit',  coalesce(sum((r ->> 'debit')::numeric), 0),
    'credit', coalesce(sum((r ->> 'credit')::numeric), 0),
    'missing_dates', count(*) filter (where r ->> 'txn_date' is null),
    'unknown_accounts', coalesce(jsonb_agg(distinct r ->> 'account_code') filter (
      where not exists (select 1 from public.accounts a
                        where a.entity_id = v_conn.entity_id and a.code = r ->> 'account_code')), '[]'::jsonb),
    'sample', (select jsonb_agg(s.r - 'raw') from (select r2 as r from jsonb_array_elements(v_rows) r2 limit 8) s)
  ) into v_summary
  from jsonb_array_elements(v_rows) r;

  insert into public.pipeline_events (entity_id, stage, actor, detail)
  values (v_conn.entity_id, 'connector_poll', p_fetch.requested_by,
          jsonb_build_object('connector_id', v_conn.id, 'kind', 'url', 'rows', v_n,
                             'mode', case when p_fetch.dry_run then 'preview' else 'sync' end));

  if p_fetch.dry_run then
    return v_summary || jsonb_build_object('status', 'preview');
  end if;

  -- Same content as a file already taken in → nothing to do.
  if exists (select 1 from public.connector_files
             where connector_id = v_conn.id and external_id = 'sha256:' || v_hash) then
    update public.connectors set last_sync_at = now(), last_error = null where id = v_conn.id;
    return v_summary || jsonb_build_object('status', 'unchanged');
  end if;
  -- The same file already came in for this company another way (an upload,
  -- another connector) → the batch dedup would refuse it; say so plainly.
  select b.id into v_dup from public.ingest_batches b
  where b.entity_id = v_conn.entity_id and b.file_hash = v_hash
    and b.status not in ('rejected', 'failed')
  limit 1;
  if v_dup is not null then
    update public.connectors set last_sync_at = now(), last_error = null where id = v_conn.id;
    return v_summary || jsonb_build_object('status', 'duplicate', 'batch_id', v_dup);
  end if;

  v_file := trim(both '-' from lower(regexp_replace(v_conn.name, '[^a-zA-Z0-9]+', '-', 'g')))
            || '-' || to_char(now(), 'YYYYMMDD-HH24MI') || '.csv';
  begin
    return v_summary || public.ingest_connector_rows(
      v_conn.id, 'sha256:' || v_hash, v_file, v_hash,
      coalesce((v_period || '-01')::date, date_trunc('month', now())::date), v_rows);
  exception when others then
    update public.connectors set last_error = left(sqlerrm, 500), last_sync_at = now() where id = v_conn.id;
    return jsonb_build_object('status', 'error', 'message', sqlerrm);
  end;
end;
$$;

revoke all on function private.connector_url_ok(text), private.normalize_sheet_url(text),
  private.csv_fields(text, text), private.csv_number(text),
  private.csv_date(text), private.parse_csv_rows(text), private.start_url_fetch(uuid, uuid, boolean),
  private.process_url_fetch(private.url_fetches, integer, text, jsonb, boolean, text),
  private.block_demo_connector_writes()
  from public, anon, authenticated;


-- ----------------------------------------------------------------------------
-- 5. Client RPCs: "Sync now", then poll for the answer
-- ----------------------------------------------------------------------------
create or replace function public.sync_url_connector(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_conn public.connectors;
  v_dry  boolean;
  v_prev bigint;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  select * into v_conn from public.connectors where id = p_id;
  if not found then
    raise exception 'connector % not found', p_id using errcode = 'P0002';
  end if;
  if not (select private.can_manage_entity(v_conn.entity_id)) then
    raise exception 'not authorized for this connector' using errcode = '42501';
  end if;
  if v_conn.kind::text <> 'url' then
    raise exception 'only spreadsheet-link connectors sync this way' using errcode = '22023';
  end if;
  if v_conn.status = 'paused' then
    raise exception 'the connector is paused' using errcode = '22023';
  end if;

  -- The shared demo can watch a real fetch + parse, but never writes.
  v_dry := (select private.is_demo_user());

  -- One fetch at a time per person and connector.
  select request_id into v_prev from private.url_fetches
  where connector_id = p_id and requested_by = v_uid and created_at > now() - interval '30 seconds'
  order by created_at desc limit 1;
  if v_prev is not null then
    return jsonb_build_object('request_id', v_prev, 'dry_run', v_dry);
  end if;

  return jsonb_build_object('request_id', private.start_url_fetch(p_id, v_uid, v_dry), 'dry_run', v_dry);
end;
$$;

create or replace function public.collect_url_sync(p_request_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_f    private.url_fetches;
  v_conn public.connectors;
  v_r    record;
begin
  select * into v_f from private.url_fetches where request_id = p_request_id;
  if not found then
    return jsonb_build_object('status', 'gone'); -- already picked up (by the cron tick)
  end if;
  -- Only whoever started a fetch collects it (the cron tick handles its own).
  if v_f.requested_by is distinct from (select auth.uid()) then
    return jsonb_build_object('status', 'gone');
  end if;
  select * into v_conn from public.connectors where id = v_f.connector_id;
  if not (select private.can_manage_entity(v_conn.entity_id)) then
    raise exception 'not authorized for this connector' using errcode = '42501';
  end if;

  select * into v_r from net._http_response where id = p_request_id;
  if not found then
    if v_f.created_at < now() - interval '60 seconds' then
      delete from private.url_fetches where request_id = p_request_id;
      return jsonb_build_object('status', 'error', 'message', 'no answer from the link within 60 s');
    end if;
    return jsonb_build_object('status', 'pending');
  end if;

  -- Claim it (the cron tick may be looking at the same row).
  delete from private.url_fetches where request_id = p_request_id returning * into v_f;
  if not found then
    return jsonb_build_object('status', 'gone');
  end if;
  return private.process_url_fetch(v_f, v_r.status_code, v_r.content, v_r.headers, v_r.timed_out, v_r.error_msg);
end;
$$;

revoke all on function public.sync_url_connector(uuid), public.collect_url_sync(bigint) from public, anon;
grant execute on function public.sync_url_connector(uuid), public.collect_url_sync(bigint) to authenticated;


-- ----------------------------------------------------------------------------
-- 6. Unattended: the existing pg_cron job (connector-auto-sync, every 10 min)
--    finishes fetches nobody waited for and re-fetches each link hourly.
--    The shared demo's connector is never synced unattended (it would write).
-- ----------------------------------------------------------------------------
create or replace function private.run_connector_syncs(p_limit integer default 5)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_f private.url_fetches;
  v_r record;
  v_c record;
begin
  for v_f in select * from private.url_fetches where not dry_run order by created_at loop
    begin
      select * into v_r from net._http_response where id = v_f.request_id;
      if found then
        delete from private.url_fetches where request_id = v_f.request_id returning * into v_f;
        if found then
          perform private.process_url_fetch(v_f, v_r.status_code, v_r.content, v_r.headers, v_r.timed_out, v_r.error_msg);
        end if;
      elsif v_f.created_at < now() - interval '5 minutes' then
        delete from private.url_fetches where request_id = v_f.request_id;
      end if;
    exception when others then
      raise notice 'run_connector_syncs: fetch %: %', v_f.request_id, sqlerrm;
    end;
  end loop;
  delete from private.url_fetches where dry_run and created_at < now() - interval '10 minutes';

  for v_c in
    select c.id
    from public.connectors c
    join public.profiles p on p.id = c.owner_id
    where c.kind::text = 'url' and c.status = 'active' and not coalesce(p.is_demo, false)
      and (c.last_sync_at is null or c.last_sync_at < now() - interval '55 minutes')
      and not exists (select 1 from private.url_fetches f where f.connector_id = c.id)
    order by c.last_sync_at asc nulls first
    limit greatest(p_limit, 1)
  loop
    begin
      perform private.start_url_fetch(v_c.id, null, false);
    exception when others then
      update public.connectors set last_error = left(sqlerrm, 500), last_sync_at = now() where id = v_c.id;
    end;
  end loop;
end;
$$;

comment on function private.run_connector_syncs(integer) is
  'Cron (connector-auto-sync, every 10 min): finish answered link fetches, then start an hourly re-fetch for up to N active link connectors of real (non-demo) owners. Per-connector fail-soft.';
revoke all on function private.run_connector_syncs(integer) from public, anon, authenticated;


-- ----------------------------------------------------------------------------
-- 7. create_connector: 'url' (validated link) and 'webhook'; Drive is retired.
--    Otherwise migration 26's body.
-- ----------------------------------------------------------------------------
create or replace function public.create_connector(
  p_entity_id uuid,
  p_kind      public.connector_kind,
  p_name      text,
  p_config    jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_id     uuid;
  v_secret text;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'name required' using errcode = '22023';
  end if;
  if not (select private.can_manage_entity(p_entity_id)) then
    raise exception 'not authorized to add a connector for entity %', p_entity_id
      using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_config, '{}'::jsonb)) <> 'object' then
    raise exception 'config must be a JSON object' using errcode = '22023';
  end if;

  if p_kind::text = 'webhook' then
    -- 256-bit hex secret. Returned now and never again (column is not selectable).
    v_secret := encode(extensions.gen_random_bytes(32), 'hex');
    insert into public.connectors (entity_id, owner_id, kind, name, status, config, webhook_secret)
    values (p_entity_id, v_uid, p_kind, trim(p_name), 'active', '{}'::jsonb, v_secret)
    returning id into v_id;
  elsif p_kind::text = 'url' then
    if not private.connector_url_ok(private.normalize_sheet_url(p_config ->> 'url')) then
      raise exception 'paste a public https:// link to a CSV file' using errcode = '22023';
    end if;
    insert into public.connectors (entity_id, owner_id, kind, name, status, config)
    values (p_entity_id, v_uid, p_kind, trim(p_name), 'active',
            jsonb_build_object('url', private.normalize_sheet_url(p_config ->> 'url')))
    returning id into v_id;
  else
    raise exception 'Google Drive connectors are retired — use a spreadsheet link (Google Sheets → Share → Publish to web → CSV)'
      using errcode = '22023';
  end if;

  insert into public.pipeline_events (entity_id, stage, actor, detail)
  values (p_entity_id, 'connector_created', v_uid,
          jsonb_build_object('connector_id', v_id, 'kind', p_kind, 'name', trim(p_name)));

  return jsonb_build_object('id', v_id, 'kind', p_kind, 'status', 'active', 'webhook_secret', v_secret);
end;
$$;

-- The Drive demo simulator goes with Drive; any real Drive connector left is
-- paused with a pointer to the replacement (its ingested batches stay).
drop function if exists public.simulate_connector_sync(uuid);
update public.connectors
   set status = 'paused',
       last_error = 'Google Drive connectors are retired — add a spreadsheet link instead'
 where kind = 'gdrive' and status <> 'paused';


-- ----------------------------------------------------------------------------
-- 8. The showcase: one shared link connector on the office SPV, pointing at a
--    sample cost sheet the app itself serves. Visitors press Sync now and
--    watch the database fetch and read it (preview only — demo is read-only).
-- ----------------------------------------------------------------------------
create or replace function private.ensure_showcase_connector(
  p_url text default 'https://rievoree-ukazka.vercel.app/samples/facility-costs-sheet.csv'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entity uuid;
  v_owner  uuid;
  v_id     uuid;
begin
  select id into v_entity from public.entities where slug = 'northwind';
  select id into v_owner from public.profiles where lower(email) = 'manager@demo.local';
  if v_entity is null or v_owner is null then
    return null;
  end if;
  select id into v_id from public.connectors where entity_id = v_entity and config ->> 'showcase' = 'true';
  if v_id is null then
    insert into public.connectors (entity_id, owner_id, kind, name, status, config)
    values (v_entity, v_owner, 'url', 'Facility costs — shared spreadsheet', 'active',
            jsonb_build_object('url', p_url, 'showcase', 'true'))
    returning id into v_id;
  else
    update public.connectors
      set config = jsonb_build_object('url', p_url, 'showcase', 'true'), status = 'active', last_error = null
    where id = v_id;
  end if;
  return v_id;
end;
$$;

revoke all on function private.ensure_showcase_connector(text) from public, anon, authenticated;

-- Visitors used to be able to add connectors on the shared demo; clear those.
delete from public.connectors c
using public.profiles p
where c.owner_id = p.id and p.is_demo and coalesce(c.config ->> 'showcase', '') <> 'true';

select private.ensure_showcase_connector();
