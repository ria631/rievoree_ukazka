-- ============================================================================
-- Migration 44 — a pinned spreadsheet that keeps changing
--
-- The pipeline works one month per batch (rows outside the batch's month fail
-- validation). A sheet someone keeps adding to spans many months, so:
--
--   * each sync splits the sheet by month — one batch per month;
--   * a month is imported again only when ITS rows changed since the last
--     version taken from this sheet (other months stay "unchanged");
--   * approving a month's new version replaces the previous version of that
--     month from the SAME sheet — not other sheets, not uploads (load_batch);
--     approving an older version after a newer one is refused;
--   * a missing Currency column means the company's base currency;
--   * a single signed "Amount" column works too (positive = debit).
-- ============================================================================

-- Latest version imported from each sheet, per month.
create table if not exists private.sheet_months (
  connector_id uuid not null references public.connectors (id) on delete cascade,
  period       date not null,
  content_hash text not null,
  batch_id     uuid references public.ingest_batches (id) on delete set null,
  updated_at   timestamptz not null default now(),
  primary key (connector_id, period)
);
revoke all on private.sheet_months from public, anon, authenticated;


-- ----------------------------------------------------------------------------
-- CSV reader: migration 41's, plus a signed single-amount column.
-- ----------------------------------------------------------------------------
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
    "amount":       ["amount", "value", "suma", "čiastka", "ciastka", "částka"],
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
  -- Debit/credit columns win; a lone signed amount is split by its sign.
  if v_idx ? 'debit' or v_idx ? 'credit' then
    v_idx := v_idx - 'amount';
  end if;

  select coalesce(jsonb_agg(r.obj order by r.ln), '[]'::jsonb) into v_out
  from (
    select x.ln, jsonb_build_object(
      'account_code', nullif(btrim(coalesce(x.c[(v_idx ->> 'account_code')::int], '')), ''),
      'txn_date',     private.csv_date(x.c[(v_idx ->> 'txn_date')::int]),
      'description',  case when v_idx ? 'description' then nullif(btrim(coalesce(x.c[(v_idx ->> 'description')::int], '')), '') end,
      'debit',        case when v_idx ? 'debit'  then private.csv_number(x.c[(v_idx ->> 'debit')::int])
                           when v_idx ? 'amount' then (select case when a::numeric > 0 then a end
                                                       from (select private.csv_number(x.c[(v_idx ->> 'amount')::int]) a) z) end,
      'credit',       case when v_idx ? 'credit' then private.csv_number(x.c[(v_idx ->> 'credit')::int])
                           when v_idx ? 'amount' then (select case when a::numeric < 0 then (-a::numeric)::text end
                                                       from (select private.csv_number(x.c[(v_idx ->> 'amount')::int]) a) z) end,
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
-- The answer to one fetch → an error, a preview (demo), or per month either
-- "unchanged" or a new batch on its way to review.
-- ----------------------------------------------------------------------------
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
  v_conn     public.connectors;
  v_base     text;
  v_loc      text := coalesce(p_headers ->> 'location', p_headers ->> 'Location');
  v_err      text;
  v_rows     jsonb;
  v_n        int := 0;
  v_main     text;
  v_summary  jsonb;
  v_slug     text;
  v_batches  jsonb := '[]'::jsonb;
  v_created  int := 0;
  v_first    uuid;
  m          record;
  v_last     private.sheet_months;
  v_res      jsonb;
  v_stamp    text;
begin
  select * into v_conn from public.connectors where id = p_fetch.connector_id;
  if not found then
    return jsonb_build_object('status', 'error', 'message', 'connector no longer exists');
  end if;
  select base_currency into v_base from public.entities where id = v_conn.entity_id;

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
  if v_err is null then
    -- No currency in the sheet → the company's own currency.
    select jsonb_agg(case when r ->> 'currency' is null
                          then jsonb_set(r, '{currency}', to_jsonb(coalesce(v_base, 'EUR')))
                          else r end order by o)
      into v_rows
    from jsonb_array_elements(v_rows) with ordinality as t(r, o);

    -- The month most rows fall in (rows without a date go with it, to be flagged).
    select left(r ->> 'txn_date', 7) into v_main
    from jsonb_array_elements(v_rows) r where r ->> 'txn_date' is not null
    group by 1 order by count(*) desc, 1 desc limit 1;
    v_main := coalesce(v_main, to_char(now(), 'YYYY-MM'));

    if (select count(distinct coalesce(left(r ->> 'txn_date', 7), v_main))
        from jsonb_array_elements(v_rows) r) > 24 then
      v_err := 'the sheet spans more than 24 months — keep at most two years per link';
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

  select jsonb_build_object(
    'rows', v_n,
    'period', v_main,
    'debit',  coalesce(sum((r ->> 'debit')::numeric), 0),
    'credit', coalesce(sum((r ->> 'credit')::numeric), 0),
    'missing_dates', count(*) filter (where r ->> 'txn_date' is null),
    'unknown_accounts', coalesce(jsonb_agg(distinct r ->> 'account_code') filter (
      where not exists (select 1 from public.accounts a
                        where a.entity_id = v_conn.entity_id and a.code = r ->> 'account_code')), '[]'::jsonb),
    'sample', (select jsonb_agg(s.r - 'raw') from (select r2 as r from jsonb_array_elements(v_rows) r2 limit 8) s),
    'months', (
      select jsonb_agg(jsonb_build_object('period', mm.period, 'rows', mm.n, 'debit', mm.dr, 'credit', mm.cr) order by mm.period)
      from (select coalesce(left(r3 ->> 'txn_date', 7), v_main) as period, count(*) as n,
                   coalesce(sum((r3 ->> 'debit')::numeric), 0) as dr, coalesce(sum((r3 ->> 'credit')::numeric), 0) as cr
            from jsonb_array_elements(v_rows) r3 group by 1) mm)
  ) into v_summary
  from jsonb_array_elements(v_rows) r;

  insert into public.pipeline_events (entity_id, stage, actor, detail)
  values (v_conn.entity_id, 'connector_poll', p_fetch.requested_by,
          jsonb_build_object('connector_id', v_conn.id, 'kind', 'url', 'rows', v_n,
                             'mode', case when p_fetch.dry_run then 'preview' else 'sync' end));

  if p_fetch.dry_run then
    return v_summary || jsonb_build_object('status', 'preview');
  end if;

  v_slug  := trim(both '-' from lower(regexp_replace(v_conn.name, '[^a-zA-Z0-9]+', '-', 'g')));
  v_stamp := to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS');

  -- One batch per month whose rows changed since this sheet's last version.
  for m in
    select g.period, jsonb_agg(g.r order by g.o) as rows
    from (select coalesce(left(r ->> 'txn_date', 7), v_main) as period, r, o
          from jsonb_array_elements(v_rows) with ordinality as t(r, o)) g
    group by g.period
    order by g.period
  loop
    declare
      v_hash   text := encode(extensions.digest(m.rows::text, 'sha256'), 'hex');
      v_period date := (m.period || '-01')::date;
    begin
      select * into v_last from private.sheet_months
      where connector_id = v_conn.id and period = v_period;
      if found and v_last.content_hash = v_hash then
        v_batches := v_batches || jsonb_build_array(jsonb_build_object(
          'period', m.period, 'status', 'unchanged', 'rows', jsonb_array_length(m.rows)));
        continue;
      end if;

      v_res := public.ingest_connector_rows(
        v_conn.id,
        'sheet:' || m.period || ':' || v_hash || ':' || v_stamp,
        v_slug || '-' || m.period || '.csv',
        v_hash || '@' || v_conn.id || '@' || v_stamp,   -- versions of a month may repeat content
        v_period, m.rows);

      insert into private.sheet_months (connector_id, period, content_hash, batch_id, updated_at)
      values (v_conn.id, v_period, v_hash, (v_res ->> 'batch_id')::uuid, now())
      on conflict (connector_id, period) do update
        set content_hash = excluded.content_hash, batch_id = excluded.batch_id, updated_at = now();

      v_created := v_created + 1;
      v_first := coalesce(v_first, (v_res ->> 'batch_id')::uuid);
      v_batches := v_batches || jsonb_build_array(jsonb_build_object(
        'period', m.period, 'status', 'created', 'rows', jsonb_array_length(m.rows),
        'batch_id', v_res ->> 'batch_id'));
    exception when others then
      v_batches := v_batches || jsonb_build_array(jsonb_build_object(
        'period', m.period, 'status', 'error', 'message', sqlerrm));
    end;
  end loop;

  if exists (select 1 from jsonb_array_elements(v_batches) b where b ->> 'status' = 'error') then
    update public.connectors
      set last_error = (select string_agg((b ->> 'period') || ': ' || (b ->> 'message'), '; ')
                        from jsonb_array_elements(v_batches) b where b ->> 'status' = 'error'),
          last_sync_at = now()
    where id = v_conn.id;
  else
    update public.connectors set last_sync_at = now(), last_error = null where id = v_conn.id;
  end if;

  return v_summary || jsonb_build_object(
    'status', case when v_created > 0 then 'created'
                   when exists (select 1 from jsonb_array_elements(v_batches) b where b ->> 'status' = 'error') then 'error'
                   else 'unchanged' end,
    'message', (select string_agg((b ->> 'period') || ': ' || (b ->> 'message'), '; ')
                from jsonb_array_elements(v_batches) b where b ->> 'status' = 'error'),
    'batch_id', v_first,
    'batches', v_batches);
end;
$$;

revoke all on function private.process_url_fetch(private.url_fetches, integer, text, jsonb, boolean, text)
  from public, anon, authenticated;


-- ----------------------------------------------------------------------------
-- load_batch: a sheet's month replaces that sheet's earlier version of the
-- same month. Everything else as migration 18 (entity + period + source).
-- ----------------------------------------------------------------------------
create or replace function private.load_batch(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch    public.ingest_batches;
  v_sheet    uuid;
  v_deleted  integer;
  v_loaded   integer;
begin
  select * into v_batch from public.ingest_batches where id = p_batch_id;
  if not found then
    raise exception 'load_batch: batch % not found', p_batch_id using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(
    hashtext(v_batch.entity_id::text || '|' || v_batch.period::text)
  );

  -- Which spreadsheet link (if any) this batch is a version of.
  select cf.connector_id into v_sheet
  from public.connector_files cf
  join public.connectors c on c.id = cf.connector_id
  where cf.batch_id = p_batch_id and c.kind::text = 'url'
  limit 1;

  -- An older version once the sheet's latest version of this month is loaded.
  if v_sheet is not null and exists (
    select 1 from private.sheet_months sm
    join public.ingest_batches b on b.id = sm.batch_id
    where sm.connector_id = v_sheet and sm.period = v_batch.period
      and sm.batch_id <> p_batch_id and b.status = 'loaded'
  ) then
    raise exception 'a newer version of % from this sheet is already loaded — reject this one',
      to_char(v_batch.period, 'Mon YYYY') using errcode = '22023';
  end if;

  update public.ingest_batches set status = 'loading', updated_at = now() where id = p_batch_id;

  if v_sheet is not null then
    with superseded as (
      delete from public.journal_entries je
      where je.entity_id = v_batch.entity_id
        and je.period = v_batch.period
        and je.batch_id in (
          select cf.batch_id from public.connector_files cf
          join public.ingest_batches b on b.id = cf.batch_id
          where cf.connector_id = v_sheet and b.period = v_batch.period and cf.batch_id <> p_batch_id
        )
      returning 1
    )
    select count(*) into v_deleted from superseded;
  elsif v_batch.source::text = 'url' then
    v_deleted := 0;   -- its sheet was deleted: load it, replace nothing
  else
    with superseded as (
      delete from public.journal_entries je
      where je.entity_id = v_batch.entity_id
        and je.period = v_batch.period
        and je.batch_id in (
          select b.id from public.ingest_batches b
          where b.entity_id = v_batch.entity_id
            and b.period = v_batch.period
            and b.source = v_batch.source
        )
      returning 1
    )
    select count(*) into v_deleted from superseded;
  end if;

  with promoted as (
    insert into public.journal_entries
      (entity_id, account_id, batch_id, txn_date, description, debit, credit, currency)
    select s.entity_id, s.account_id, s.batch_id, s.txn_date, s.description,
           coalesce(s.debit, 0), coalesce(s.credit, 0), s.currency
    from public.journal_staging s
    where s.batch_id = p_batch_id
      and s.validation_errors is null
      and s.is_anomaly = false
      and s.account_id is not null
      and s.txn_date is not null
    returning 1
  )
  select count(*) into v_loaded from promoted;

  update public.ingest_batches
    set status = 'loaded',
        stats = stats || jsonb_build_object('rows_loaded', v_loaded, 'rows_superseded', v_deleted),
        updated_at = now()
  where id = p_batch_id;

  return jsonb_build_object('rows_loaded', v_loaded, 'rows_superseded', v_deleted);
end;
$$;

comment on function private.load_batch(uuid) is
  'Delete-and-reload promotable staging rows into journal_entries. A spreadsheet-link month replaces the same sheet''s earlier version of that month (an older version is refused once a newer one is loaded); other sources replace (entity, period, source). Advisory-locked on (entity, period).';
revoke all on function private.load_batch(uuid) from public, anon, authenticated;
