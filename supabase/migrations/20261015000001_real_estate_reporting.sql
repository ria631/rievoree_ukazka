-- ============================================================================
-- Migration 38 — Real-estate reporting model (reporting v2)
--
-- The showcase becomes a small property group: four SPVs (office, retail,
-- residential, logistics), each owning one building. The reporting pages read
-- a coherent set of books instead of a generic revenue/cost model:
--
--   * journal_entries  + doc_no (every line belongs to a document: sales
--                        invoice SI, purchase invoice PI, bank statement BS,
--                        general journal GJ, opening balance OB)
--                      + flow   (cash-flow category, tagged on bank lines)
--   * invoices         + doc_no, paid_date, lease_id, category — the AR/AP
--                        sub-ledger; open items tie to accounts 1100 / 2000
--   * properties, units, leases — the rent roll
--   * cash_budget      — the monthly cash plan by flow category
--   * views            — report_cash_monthly, report_invoice_monthly,
--                        journal_documents, journal_month_summary
--                        (all security_invoker → the caller's RLS applies)
--   * private.generate_property_books()  — deterministic generator (hashtext,
--                        no random()) for one SPV's full books: chart of
--                        accounts, leases, AR/AP invoices with payments, the
--                        balanced double-entry journal, P&L budget, cash budget
--   * private.load_reporting_demo()      — regenerates the four showcase SPVs
--
-- Data is relative to the last closed month (default: the month before today),
-- 24 months of actuals + 12 months of plan. Re-run load_reporting_demo() to
-- roll the showcase forward. Nothing here is reachable by anon; no client
-- writes (all new tables are read-only to authenticated, tenant-scoped by RLS).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Journal: document number + cash-flow tag
-- ----------------------------------------------------------------------------
alter table public.journal_entries
  add column if not exists doc_no text,
  add column if not exists flow   text;

alter table public.journal_entries drop constraint if exists journal_entries_flow_valid;
alter table public.journal_entries add constraint journal_entries_flow_valid check (
  flow is null or flow in ('opening', 'rent_receipts', 'deposits', 'opex', 'property_tax',
                           'capex', 'interest', 'principal', 'distributions'));

create index if not exists journal_entries_doc_idx on public.journal_entries (entity_id, doc_no);

comment on column public.journal_entries.doc_no is
  'Source document: SI sales invoice, PI purchase invoice, BS bank statement item, GJ general journal, OB opening balance. NULL = loaded from an upload batch.';
comment on column public.journal_entries.flow is
  'Cash-flow category, set on bank (1000) lines only — drives the actual side of the cash budget.';


-- ----------------------------------------------------------------------------
-- 2. Rent roll: properties → units → leases
-- ----------------------------------------------------------------------------
create table if not exists public.properties (
  id             uuid primary key default gen_random_uuid(),
  entity_id      uuid not null references public.entities (id) on delete cascade,
  name           text not null,
  segment        text not null check (segment in ('office', 'retail', 'residential', 'logistics')),
  city           text not null,
  address        text,
  acquired_on    date,
  valuation      numeric(14, 2) not null default 0,   -- latest external market value
  valuation_date date
);
create index if not exists properties_entity_idx on public.properties (entity_id);

create table if not exists public.units (
  id          uuid primary key default gen_random_uuid(),
  entity_id   uuid not null references public.entities (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  code        text not null,
  floor       text,
  use         text not null,
  area_m2     numeric(10, 2) not null check (area_m2 > 0),
  erv_m2      numeric(10, 2) not null default 0,     -- estimated rental value, € per m² per month
  unique (property_id, code)
);
create index if not exists units_entity_idx on public.units (entity_id);

create table if not exists public.leases (
  id                   uuid primary key default gen_random_uuid(),
  entity_id            uuid not null references public.entities (id) on delete cascade,
  unit_id              uuid not null references public.units (id) on delete cascade,
  tenant               text not null,
  start_date           date not null,
  end_date             date not null,
  rent_month           numeric(12, 2) not null,       -- passing base rent (€/month) at the as-of date
  service_charge_month numeric(12, 2) not null default 0,
  parking_month        numeric(12, 2) not null default 0,
  indexation_pct       numeric(5, 2) not null default 0,  -- annual CPI step on each anniversary
  deposit              numeric(12, 2) not null default 0,
  check (end_date > start_date)
);
create index if not exists leases_entity_idx on public.leases (entity_id);
create index if not exists leases_unit_idx on public.leases (unit_id);

comment on table public.leases is
  'Rent roll. Status (active / expired) is derived from start/end vs the as-of date — never stored.';


-- ----------------------------------------------------------------------------
-- 3. Invoices become the AR/AP sub-ledger
-- ----------------------------------------------------------------------------
alter table public.invoices
  add column if not exists doc_no    text,
  add column if not exists paid_date date,
  add column if not exists lease_id  uuid references public.leases (id) on delete set null,
  add column if not exists category  text;

create index if not exists invoices_status_idx on public.invoices (entity_id, kind, status);


-- ----------------------------------------------------------------------------
-- 4. Cash budget (plan side of "Budget flow")
-- ----------------------------------------------------------------------------
create table if not exists public.cash_budget (
  entity_id uuid not null references public.entities (id) on delete cascade,
  period    date not null,
  flow      text not null check (flow in ('rent_receipts', 'deposits', 'opex', 'property_tax',
                                          'capex', 'interest', 'principal', 'distributions')),
  amount    numeric(14, 2) not null,     -- signed: + inflow, − outflow
  primary key (entity_id, period, flow)
);


-- ----------------------------------------------------------------------------
-- 5. RLS + grants — members read their entities, admin+ read all, no writes
-- ----------------------------------------------------------------------------
alter table public.properties  enable row level security;
alter table public.units       enable row level security;
alter table public.leases      enable row level security;
alter table public.cash_budget enable row level security;

drop policy if exists properties_select on public.properties;
create policy properties_select on public.properties for select to authenticated
  using ((select private.is_admin()) or entity_id in (select private.my_entity_ids()));

drop policy if exists units_select on public.units;
create policy units_select on public.units for select to authenticated
  using ((select private.is_admin()) or entity_id in (select private.my_entity_ids()));

drop policy if exists leases_select on public.leases;
create policy leases_select on public.leases for select to authenticated
  using ((select private.is_admin()) or entity_id in (select private.my_entity_ids()));

drop policy if exists cash_budget_select on public.cash_budget;
create policy cash_budget_select on public.cash_budget for select to authenticated
  using ((select private.is_admin()) or entity_id in (select private.my_entity_ids()));

revoke all on public.properties, public.units, public.leases, public.cash_budget from anon, authenticated;
grant select on public.properties, public.units, public.leases, public.cash_budget to authenticated;


-- ----------------------------------------------------------------------------
-- 6. Reporting views — security_invoker, so the caller's RLS on the base
--    tables decides which rows aggregate (same rule as journal_entries_select).
-- ----------------------------------------------------------------------------
create or replace view public.report_cash_monthly
with (security_invoker = true) as
select je.entity_id, je.period, je.flow,
       sum(je.debit)              as inflow,
       sum(je.credit)             as outflow,
       sum(je.debit - je.credit)  as net
from public.journal_entries je
where je.flow is not null
group by je.entity_id, je.period, je.flow;

create or replace view public.report_invoice_monthly
with (security_invoker = true) as
select i.entity_id, i.kind,
       date_trunc('month', i.issued_date::timestamp)::date                     as period,
       count(*)::int                                                            as invoices,
       sum(i.amount)                                                            as invoiced,
       coalesce(sum(i.amount) filter (where i.paid_date is not null), 0)        as settled,
       coalesce(sum(i.amount) filter (where i.paid_date <= i.due_date), 0)      as settled_on_time,
       round(avg(i.paid_date - i.issued_date) filter (where i.paid_date is not null), 1) as avg_days_to_pay
from public.invoices i
group by i.entity_id, i.kind, date_trunc('month', i.issued_date::timestamp);

-- One row per document. Upload batches carry no document number, so their rows
-- group as one "UP" document per batch.
create or replace view public.journal_documents
with (security_invoker = true) as
select d.entity_id, d.doc_no, d.doc_type,
       min(d.txn_date)                              as txn_date,
       min(d.period)                                as period,
       (array_agg(d.description order by d.id))[1]  as description,
       count(*)::int                                as lines,
       sum(d.debit)                                 as debit,
       sum(d.credit)                                as credit,
       sum(d.debit) = sum(d.credit)                 as balanced,
       (array_agg(d.batch_id))[1]                   as batch_id
from (
  select je.id, je.entity_id, je.batch_id, je.txn_date, je.period, je.description, je.debit, je.credit,
         coalesce(je.doc_no, 'UP-' || upper(left(je.batch_id::text, 8)))                as doc_no,
         case when je.doc_no is null then 'UP' else split_part(je.doc_no, '-', 1) end as doc_type
  from public.journal_entries je
) d
group by d.entity_id, d.doc_no, d.doc_type;

-- Posting volume per month and document type (the journal overview's chart
-- and its debit = credit proof).
create or replace view public.journal_month_summary
with (security_invoker = true) as
select jd.entity_id, jd.period, jd.doc_type,
       count(*)::int                              as docs,
       sum(jd.lines)::int                         as lines,
       sum(jd.debit)                              as debit,
       sum(jd.credit)                             as credit,
       count(*) filter (where not jd.balanced)::int as unbalanced
from public.journal_documents jd
group by jd.entity_id, jd.period, jd.doc_type;

revoke all on public.report_cash_monthly, public.report_invoice_monthly, public.journal_documents,
              public.journal_month_summary
  from anon, authenticated;
grant select on public.report_cash_monthly, public.report_invoice_monthly, public.journal_documents,
                public.journal_month_summary
  to authenticated;


-- ----------------------------------------------------------------------------
-- 7. Generator helpers
-- ----------------------------------------------------------------------------
-- Deterministic pseudo-noise in [0, 1) from a text seed.
create or replace function private.h01(p text)
returns numeric language sql immutable set search_path = ''
as $$ select (abs(hashtext(p)) % 10000)::numeric / 10000 $$;

-- Whole months from a to b (first-of-month dates).
create or replace function private.months_between(a date, b date)
returns int language sql immutable set search_path = ''
as $$ select ((extract(year from b) - extract(year from a)) * 12
              + extract(month from b) - extract(month from a))::int $$;

revoke all on function private.h01(text), private.months_between(date, date) from public, anon, authenticated;


-- ----------------------------------------------------------------------------
-- 8. private.generate_property_books — one SPV's complete, balanced books
--
--    Every number is derived from a lease or a supplier contract, so the
--    reports reconcile: open invoices = account 1100/2000 balance, bank lines
--    = cash flow by category, P&L budget and cash budget come from the same
--    rent roll the forecast reads. Idempotent for its own output.
-- ----------------------------------------------------------------------------
create or replace function private.generate_property_books(
  p_entity   uuid,
  p_profile  text,
  p_uploader uuid,
  p_last     date    default null,
  p_live     boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_last    date := coalesce(date_trunc('month', p_last::timestamp)::date,
                             (date_trunc('month', current_date::timestamp) - interval '1 month')::date);
  v_start   date;
  v_asof    date;
  v_horizon date;
  v_batch   uuid;
  v_live    uuid;
  v_prop    uuid;
  v_lines   int;
  v_dep_open numeric;
  v_ar_open  numeric;
  v_pre_open numeric;
  cfg       record;
  ur        record;
  v_t       int;
  v_k       int;
  v_dur     int;
begin
  if p_profile not in ('office', 'retail', 'residential', 'logistics') then
    raise exception 'generate_property_books: unknown profile %', p_profile using errcode = '22023';
  end if;
  v_start   := (v_last - interval '23 months')::date;
  v_asof    := (v_last + interval '1 month' - interval '1 day')::date;
  v_horizon := (v_last + interval '12 months')::date;

  -- Building economics per profile (€; rates in % p.a.; opex per month at the
  -- start of the window, insurance per quarter, property tax per year).
  select * into cfg from (values
    ('office', 'Danube Office Park', 'Bratislava', 'Landererova 12, 811 09 Bratislava',
       22000000, 2100000, 850000, 12000000, 4.40, 72000, 24500000, 5000000, 400000, 3.80,
       14000, 6000, 4500, 9000, 9000, 38000, 'Danubia Bank a.s.'),
    ('retail', 'Riverside Retail Park', 'Trnava', 'Bratislavská 88, 917 01 Trnava',
       15600000, 1500000, 620000, 9500000, 4.60, 57000, 17600000, 4000000, 300000, 2.50,
       10000, 5000, 4000, 12000, 10000, 34000, 'Danubia Bank a.s.'),
    ('residential', 'Lindenhof Residences', 'Bratislava', 'Lipová 5, 851 01 Bratislava',
       7200000, 600000, 240000, 4000000, 4.20, 22000, 8100000, 2000000, 40000, 2.60,
       4500, 2500, 1800, 1500, 3000, 6000, 'Carpathia Savings Bank a.s.'),
    ('logistics', 'Westgate Logistics Hub', 'Senec', 'Priemyselná 3, 903 01 Senec',
       19000000, 1900000, 700000, 11500000, 4.50, 69000, 21200000, 4500000, 350000, 0.60,
       6000, 4000, 3600, 5000, 12000, 52000, 'Carpathia Savings Bank a.s.')
  ) as x(profile, property, city, address, cost, accdep, cash0, loan0, rate, amort_q, valuation,
         capital, dividend, sc_m2, util, rm, mgmt, clean, ins_q, ptax, lender)
  where x.profile = p_profile;

  -- -------- wipe this generator's previous output for the entity ----------
  delete from public.invoices    where entity_id = p_entity;
  delete from public.budgets     where entity_id = p_entity;
  delete from public.cash_budget where entity_id = p_entity;
  delete from public.properties  where entity_id = p_entity;            -- → units, leases
  delete from public.ingest_batches
    where entity_id = p_entity and file_hash like 'rv2-%';              -- → journal, staging

  -- -------- chart of accounts ---------------------------------------------
  insert into public.accounts (entity_id, code, name, type)
  select p_entity, a.code, a.name, a.type::public.account_type
  from (values
    ('1000', 'Bank',                     'asset'),
    ('1100', 'Trade receivables',        'asset'),
    ('1500', 'Investment property',      'asset'),
    ('1590', 'Accumulated depreciation', 'asset'),
    ('2000', 'Trade payables',           'liability'),
    ('2100', 'Tenant deposits',          'liability'),
    ('2200', 'Deferred income',          'liability'),
    ('2500', 'Bank loan',                'liability'),
    ('2900', 'Accruals & prepayments',   'liability'),
    ('3000', 'Share capital',            'equity'),
    ('3100', 'Retained earnings',        'equity'),
    ('4000', 'Rental income',            'revenue'),
    ('4100', 'Service charge income',    'revenue'),
    ('4200', 'Parking income',           'revenue'),
    ('5000', 'Utilities',                'expense'),
    ('5100', 'Repairs & maintenance',    'expense'),
    ('5200', 'Property management',      'expense'),
    ('5300', 'Insurance',                'expense'),
    ('5400', 'Property tax',             'expense'),
    ('5500', 'Letting fees',             'expense'),
    ('5600', 'Cleaning & security',      'expense'),
    ('6000', 'Depreciation',             'expense'),
    ('7000', 'Interest expense',         'expense')
  ) as a(code, name, type)
  on conflict (entity_id, code) do update set name = excluded.name, type = excluded.type;

  -- -------- provenance batch (the ERP ledger export) ------------------------
  insert into public.ingest_batches
    (entity_id, uploaded_by, source, file_name, storage_path, file_hash, period, status)
  values (p_entity, p_uploader, 'manual', 'erp-ledger-' || to_char(v_last, 'YYYY-MM') || '.csv',
          'ingest/' || p_entity::text || '/erp-ledger.csv', 'rv2-books-' || p_entity::text,
          v_last, 'loaded')
  returning id into v_batch;

  -- -------- property + units ----------------------------------------------
  insert into public.properties (entity_id, name, segment, city, address, acquired_on, valuation, valuation_date)
  values (p_entity, cfg.property, p_profile, cfg.city, cfg.address,
          (date_trunc('year', v_start::timestamp) - interval '6 years')::date, cfg.valuation,
          (date_trunc('year', v_last::timestamp) - interval '1 day')::date)
  returning id into v_prop;

  insert into public.units (entity_id, property_id, code, floor, use, area_m2, erv_m2)
  select p_entity, v_prop, x.code, x.floor, x.use, x.area, x.erv
  from (values
    ('office', 'GF-01', 'GF', 'Café',        220, 18.00), ('office', 'GF-02', 'GF', 'Showroom',   310, 16.00),
    ('office', '1.01',  '1',  'Office',      640, 15.50), ('office', '1.02',  '1',  'Office',     580, 15.50),
    ('office', '2.01',  '2',  'Office',     1180, 15.50), ('office', '3.01',  '3',  'Office',     620, 15.80),
    ('office', '3.02',  '3',  'Office',      560, 15.80), ('office', '4.01',  '4',  'Office',    1180, 15.80),
    ('office', '5.01',  '5',  'Office',      600, 16.20), ('office', '5.02',  '5',  'Office',     580, 16.20),
    ('office', '6.01',  '6',  'Office',     1180, 16.20), ('office', '7.01',  '7',  'Office',     520, 17.00),
    ('office', '7.02',  '7',  'Office',      540, 17.00), ('office', 'B-01',  '-1', 'Storage',    160,  6.00),
    ('retail', 'A',     'GF', 'Hypermarket',3400,  9.00), ('retail', 'B',     'GF', 'DIY store', 2600,  8.00),
    ('retail', 'C1',    'GF', 'Retail',      900, 11.00), ('retail', 'C2',    'GF', 'Retail',     450, 13.00),
    ('retail', 'C3',    'GF', 'Retail',      380, 14.00), ('retail', 'C4',    'GF', 'Retail',     420, 13.50),
    ('retail', 'C5',    'GF', 'Retail',      360, 13.00), ('retail', 'C6',    'GF', 'Retail',     160, 16.00),
    ('retail', 'C7',    'GF', 'Restaurant',  240, 15.00), ('retail', 'D1',    'GF', 'Retail',    1200, 10.00),
    ('retail', 'D2',    'GF', 'Retail',     1500,  9.00), ('retail', 'P1',    'Pad', 'Car wash',  300,  7.00),
    ('logistics', 'H1', 'GF', 'Warehouse',  9200,  4.70), ('logistics', 'H2', 'GF', 'Warehouse', 7800,  4.70),
    ('logistics', 'H3', 'GF', 'Warehouse',  6400,  4.60), ('logistics', 'H4', 'GF', 'Warehouse', 5200,  4.60),
    ('logistics', 'H5', 'GF', 'Warehouse',  3600,  4.90), ('logistics', 'O1', 'M',  'Office',     900,  9.50)
  ) as x(profile, code, floor, use, area, erv)
  where x.profile = p_profile;

  if p_profile = 'residential' then
    -- 7 floors × 6 flats: studio 42 m², 2-room 58, 3-room 76, 4-room 94.
    insert into public.units (entity_id, property_id, code, floor, use, area_m2, erv_m2)
    select p_entity, v_prop, f::text || '.' || lpad(n::text, 2, '0'), f::text,
           (array['Studio', '2-room', '3-room', '2-room', 'Studio', '4-room'])[n],
           (array[42, 58, 76, 58, 42, 94])[n],
           (array[14.60, 13.90, 13.20, 13.90, 14.60, 12.80])[n] + 0.10 * (f - 1)
    from generate_series(1, 7) f, generate_series(1, 6) n;
  end if;

  -- -------- leases (spec → real rows) ---------------------------------------
  -- start_off/term in months relative to the last closed month; rent_m2 is the
  -- rent at signing (€/m²/month); delay = typical days paid after due date;
  -- stop_off = month from which the tenant stopped paying (arrears).
  drop table if exists pg_temp.rv2_ls;
  create temp table rv2_ls (
    id uuid default gen_random_uuid(), unit_id uuid, code text, tenant text,
    start_off int, term int, rent_m2 numeric, sc_m2 numeric, parking numeric,
    idx numeric, delay int, stop_off int, dep_m numeric,
    sd date, ed date, area numeric, rent0 numeric, renewed boolean, is_renewal boolean
  );

  insert into pg_temp.rv2_ls (code, tenant, start_off, term, rent_m2, sc_m2, parking, idx, delay, stop_off, dep_m)
  select x.code, x.tenant, x.so, x.term, x.r, x.sc, x.pk, x.idx, x.dl, x.stop, x.dep
  from (values
    ('office', 'GF-01', 'Kaffee Mitte s.r.o.',                     -30,  60, 17.00, 3.80,    0, 2.5, 22, null::int, 3),
    ('office', 'GF-02', 'Urban Bikes s.r.o.',                      -48,  44, 15.20, 3.80,    0, 2.5,  6, null, 3),
    ('office', '1.01',  'Kováč & Partners, advokátska kancelária', -54,  72, 14.50, 3.80,  570, 2.5,  2, null, 3),
    ('office', '1.02',  'StartHub Coworking s.r.o.',               -20,  36, 13.80, 3.80,  190, 3.0, 48, null, 3),
    ('office', '2.01',  'Nordic Insurance Services a.s.',          -66, 120, 14.20, 3.80, 1140, 2.0,  1, null, 3),
    ('office', '3.01',  'Dataline Systems s.r.o.',                 -36,  60, 15.00, 3.80,  380, 2.5,  4, null, 3),
    ('office', '3.02',  'Mediq Clinic s.r.o.',                     -14,  84, 16.00, 3.80,  285, 2.5,  5, null, 3),
    ('office', '4.01',  'Eurocargo Group s.r.o.',                  -58,  60, 14.00, 3.80,  760, 2.5,  2, null, 3),
    ('office', '5.01',  'Brightway Consulting s.r.o.',             -50,  40, 14.80, 3.80,  190, 2.5,  7, null, 3),
    ('office', '5.01',  'Helix Pharma Slovakia s.r.o.',             -7,  60, 16.40, 3.80,  380, 2.5,  2, null, 3),
    ('office', '6.01',  'Alpine Digital Bank a.s.',                -40,  72, 15.20, 3.80,  950, 2.5,  1, null, 3),
    ('office', '7.01',  'Skyline Architects s.r.o.',               -26,  48, 17.20, 3.80,  190, 2.5, 18, null, 3),
    ('office', '7.02',  'Vertex Capital Partners s.r.o.',          -18,  60, 17.50, 3.80,  285, 2.5,  3, null, 3),
    ('office', 'B-01',  'Archivum Records s.r.o.',                 -44,  36,  6.00, 1.00,    0, 2.0,  5, null, 1),
    ('office', 'B-01',  'Archivum Records s.r.o.',                  -8,  36,  6.40, 1.00,    0, 2.0,  5, null, 1),
    ('retail', 'A',     'FreshMarket Hypermarkets s.r.o.',         -84, 180,  8.20, 2.50,    0, 2.0,  1, null, 3),
    ('retail', 'B',     'BuildPro DIY a.s.',                       -70, 120,  7.60, 2.50,    0, 2.0,  2, null, 3),
    ('retail', 'C1',    'SportZone s.r.o.',                        -30,  60, 10.50, 2.50,    0, 2.5, 20, null, 3),
    ('retail', 'C2',    'Pet World s.r.o.',                        -22,  60, 12.50, 2.50,    0, 2.5,  6, null, 3),
    ('retail', 'C3',    'Fashion Corner s.r.o.',                   -28,  48, 14.00, 2.50,    0, 2.5,  9,   -3, 3),
    ('retail', 'C4',    'Drogerie Plus s.r.o.',                    -12,  60, 13.00, 2.50,    0, 2.5,  3, null, 3),
    ('retail', 'C5',    'Toy Planet s.r.o.',                       -40,  34, 12.80, 2.50,    0, 2.5,  4, null, 3),
    ('retail', 'C6',    'Optika Vision s.r.o.',                    -50,  84, 15.50, 2.50,    0, 2.5,  2, null, 3),
    ('retail', 'C7',    'Pizzeria Napoli s.r.o.',                  -16,  60, 14.00, 2.50,    0, 2.5, 52, null, 3),
    ('retail', 'D1',    'ElectroMax s.r.o.',                       -64,  72,  9.80, 2.50,    0, 2.5,  2, null, 3),
    ('retail', 'D2',    'HomeStyle Furniture s.r.o.',              -36,  60,  8.60, 2.50,    0, 2.5,  3, null, 3),
    ('retail', 'P1',    'SpeedWash s.r.o.',                        -26, 120,  6.80, 1.00,    0, 2.0,  6, null, 3),
    ('logistics', 'H1', 'Baltic Freight s.r.o.',                   -60, 120,  4.30, 0.60,    0, 2.0,  2, null, 3),
    ('logistics', 'O1', 'Baltic Freight s.r.o.',                   -60, 120,  9.00, 1.20,    0, 2.0,  2, null, 3),
    ('logistics', 'H2', 'QuickParcel Slovakia s.r.o.',             -34,  84,  4.60, 0.60,    0, 2.5,  4, null, 3),
    ('logistics', 'H3', 'AutoParts Central s.r.o.',                -46,  48,  4.40, 0.60,    0, 2.5,  3, null, 3),
    ('logistics', 'H4', 'Coldchain Foods s.r.o.',                  -65,  60,  4.20, 0.60,    0, 2.0,  5, null, 3),
    ('logistics', 'H5', 'E-Shop Fulfilment s.r.o.',                -10,  60,  4.90, 0.60,    0, 2.5, 25, null, 3)
  ) as x(profile, code, tenant, so, term, r, sc, pk, idx, dl, stop, dep)
  where x.profile = p_profile;

  if p_profile = 'residential' then
    -- Each flat: a chain of 12–42-month tenancies with 1–2-month voids.
    for ur in select un.code, un.erv_m2, un.area_m2 from public.units un
              where un.property_id = v_prop order by un.code loop
      v_t := -24 - (abs(hashtext(ur.code || 'first')) % 16);
      v_k := 0;
      while v_t <= 0 loop
        v_dur := 12 + (abs(hashtext(ur.code || 'dur' || v_k)) % 31);
        insert into pg_temp.rv2_ls (code, tenant, start_off, term, rent_m2, sc_m2, parking, idx, delay, stop_off, dep_m)
        values (
          ur.code,
          substr('ABDEFGHJKLMNPRSTVZ', 1 + abs(hashtext(ur.code || 'i' || v_k)) % 18, 1) || '. ' ||
            (array['Kováč', 'Horváth', 'Varga', 'Tóth', 'Nagy', 'Baláž', 'Szabó', 'Molnár',
                   'Lukáč', 'Novák', 'Krajčí', 'Polák', 'Hudák', 'Bartoš', 'Šimko', 'Kollár',
                   'Fehér', 'Marek', 'Urban', 'Benko', 'Hrivnák', 'Mikuš', 'Gajdoš', 'Sloboda'])
            [1 + abs(hashtext(ur.code || 's' || v_k)) % 24],
          v_t, v_dur,
          round(ur.erv_m2 * power(1.03, v_t / 12.0) * (0.95 + 0.08 * private.h01(ur.code || 'r' || v_k)), 2),
          cfg.sc_m2,
          case when ur.area_m2 >= 58 and private.h01(ur.code || 'p' || v_k) < 0.55 then 65 else 0 end,
          2.0,
          case when private.h01(ur.code || 'late' || v_k) < 0.07 then 27
               else 2 + abs(hashtext(ur.code || 'd' || v_k)) % 8 end,
          case when ur.code = '4.03' and v_t + v_dur > 0 then -1 end,   -- one flat in arrears
          2);
        v_t := v_t + v_dur + 1 + abs(hashtext(ur.code || 'void' || v_k)) % 2;
        v_k := v_k + 1;
      end loop;
    end loop;
  end if;

  update pg_temp.rv2_ls s set
    unit_id = un.id,
    area    = un.area_m2,
    sd      = (v_last + make_interval(months => s.start_off))::date,
    ed      = (v_last + make_interval(months => s.start_off + s.term) - interval '1 day')::date,
    rent0   = round(un.area_m2 * s.rent_m2, 2)
  from public.units un
  where un.property_id = v_prop and un.code = s.code;

  update pg_temp.rv2_ls s set
    renewed    = exists (select 1 from pg_temp.rv2_ls n where n.code = s.code and n.tenant = s.tenant and n.sd = s.ed + 1),
    is_renewal = exists (select 1 from pg_temp.rv2_ls o where o.code = s.code and o.tenant = s.tenant and o.ed + 1 = s.sd);

  insert into public.leases (id, entity_id, unit_id, tenant, start_date, end_date, rent_month,
                             service_charge_month, parking_month, indexation_pct, deposit)
  select s.id, p_entity, s.unit_id, s.tenant, s.sd, s.ed,
         round(s.rent0 * power(1 + s.idx / 100,
               floor(private.months_between(s.sd, least(v_last, date_trunc('month', s.ed::timestamp)::date)) / 12.0)), 2),
         round(s.area * s.sc_m2, 2), s.parking, s.idx, round(s.rent0 * s.dep_m, 2)
  from pg_temp.rv2_ls s;

  -- -------- AR: rent is billed monthly IN ADVANCE ---------------------------
  -- The invoice for month t goes out ~24th of t−1 (Dr 1100 / Cr 2200 deferred
  -- income), is due on the 5th of t, and the rent is recognised as income on
  -- the 1st of t (Dr 2200 / Cr 4000…). So at every month end the next month's
  -- rent is already billed but not yet due — exactly what a landlord's aging
  -- looks like. Most tenants pay a few days early; delay ≥ 10 marks a chronic
  -- late payer; stop_off a tenant who stopped paying.
  drop table if exists pg_temp.rv2_ar;
  create temp table rv2_ar as
  select q.*, q.rent + q.sc + q.parking as amount,
         'SI-' || to_char(q.issued, 'YYYY') || '-' ||
           lpad((row_number() over (partition by extract(year from q.issued) order by q.issued, q.code, q.tenant))::text, 4, '0') as doc_no
  from (
    select s.id as lease_id, s.tenant, s.code, m.t::date as t,
           round(s.rent0 * power(1 + s.idx / 100, floor(private.months_between(s.sd, m.t::date) / 12.0)), 2) as rent,
           round(s.area * s.sc_m2, 2) as sc,
           s.parking::numeric(12, 2) as parking,
           m.t::date - 7 as issued,
           m.t::date + 4 as due,
           case
             when s.stop_off is not null and m.t::date >= (v_last + make_interval(months => s.stop_off))::date then null
             else nullif(least(greatest(v_start,
                                        m.t::date + 4 + case when s.delay < 10 then s.delay - 8 else s.delay - 3 end
                                        + (7 * private.h01(s.code || s.tenant || s.start_off || m.t::text))::int),
                               v_asof + 1), v_asof + 1)
           end as paid
    from pg_temp.rv2_ls s
    cross join lateral generate_series(greatest(s.sd, v_start)::timestamp,
                                       least(s.ed, (v_last + interval '1 month')::date)::timestamp, interval '1 month') m(t)
  ) q;

  -- invoices billed before the window (for its first month) open the books
  select coalesce(sum(r.amount), 0) into v_ar_open from pg_temp.rv2_ar r where r.issued < v_start;

  -- -------- AP: supplier invoices -----------------------------------------
  drop table if exists pg_temp.rv2_ap;
  create temp table rv2_ap (
    supplier text, category text, code text, flow text,
    issued date, due date, amount numeric, descr text, hold boolean default false, paid date, doc_no text
  );

  -- monthly grid: k = months since window start, yi = calendar-year index
  insert into pg_temp.rv2_ap (supplier, category, code, flow, issued, due, amount, descr)
  select v.supplier, v.category, v.code, v.flow, v.issued, v.due, round(v.amount, 2), v.descr
  from (
    select g.t::date as t, (g.t + interval '1 month' - interval '1 day')::date as eom,
           private.months_between(v_start, g.t::date) as k,
           (extract(year from g.t) - extract(year from v_start))::int as yi,
           extract(month from g.t)::int as mo
    from generate_series(v_start::timestamp, v_last::timestamp, interval '1 month') g(t)
  ) m
  cross join lateral (values
    ('Metro Energy a.s.', 'utilities', '5000', 'opex', m.eom, m.eom + 14,
       cfg.util * power(1.04, m.k / 12.0) * (0.92 + 0.16 * private.h01(p_profile || 'util' || m.t))
         * (case when p_profile = 'residential'
                 then (array[1.45, 1.40, 1.15, 0.85, 0.65, 0.55, 0.50, 0.50, 0.60, 0.90, 1.20, 1.40])[m.mo]
                 else (array[1.35, 1.30, 1.10, 0.90, 0.80, 0.95, 1.10, 1.10, 0.85, 0.95, 1.15, 1.30])[m.mo] end),
       'Electricity, heat & water ' || to_char(m.t, 'MM/YYYY')),
    ('TechFix Facility s.r.o.', 'repairs', '5100', 'opex', m.t + 19, m.t + 49,
       cfg.rm * power(1.03, m.k / 12.0) * (0.6 + 0.8 * private.h01(p_profile || 'rm' || m.t)),
       'Planned maintenance ' || to_char(m.t, 'MM/YYYY')),
    ('Rievoree Asset Management s.r.o.', 'management', '5200', 'opex', m.t, m.t + 14,
       cfg.mgmt * power(1.03, m.yi),
       'Property management fee ' || to_char(m.t, 'MM/YYYY')),
    ('CleanGuard Services s.r.o.', 'cleaning', '5600', 'opex', m.eom, m.eom + 21,
       cfg.clean * power(1.04, m.yi) * (0.98 + 0.04 * private.h01(p_profile || 'cl' || m.t)),
       'Cleaning & security ' || to_char(m.t, 'MM/YYYY'))
  ) as v(supplier, category, code, flow, issued, due, amount, descr);

  -- lumpy repairs (~1 month in 5); quarterly insurance and the annual property
  -- tax are invoiced up front (prepayment, 2900) and expensed monthly below
  insert into pg_temp.rv2_ap (supplier, category, code, flow, issued, due, amount, descr)
  select 'TechFix Facility s.r.o.', 'repairs', '5100', 'opex', g.t::date + 9, g.t::date + 39,
         round(cfg.rm * (1.8 + 2.0 * private.h01(p_profile || 'rmx' || g.t)), 2),
         (array['Lift overhaul', 'Roof leak repair', 'HVAC compressor replacement',
                'Fire-safety system upgrade', 'Car-park barrier repair'])[1 + abs(hashtext(p_profile || 'rmw' || g.t)) % 5]
  from generate_series(v_start::timestamp, v_last::timestamp, interval '1 month') g(t)
  where private.h01(p_profile || 'rml' || g.t) < 0.2
  union all
  select 'Allied Property Insurance a.s.', 'insurance', '2900', 'opex', g.t::date + 4, g.t::date + 34,
         round(cfg.ins_q * power(1.05, extract(year from g.t) - extract(year from v_start)), 2),
         'Property insurance Q' || extract(quarter from g.t) || '/' || extract(year from g.t)
  from generate_series(v_start::timestamp, v_last::timestamp, interval '1 month') g(t)
  where extract(month from g.t) in (1, 4, 7, 10)
  union all
  select 'Municipality of ' || cfg.city, 'property_tax', '2900', 'property_tax',
         g.t::date + 14, (g.t + interval '2 months' - interval '1 day')::date,
         round(cfg.ptax * power(1.05, extract(year from g.t) - extract(year from v_start)), 2),
         'Property tax ' || extract(year from g.t)
  from generate_series(v_start::timestamp, v_last::timestamp, interval '1 month') g(t)
  where extract(month from g.t) = 4;

  -- letting agent fee on every new (non-renewal) lease signed in the window
  insert into pg_temp.rv2_ap (supplier, category, code, flow, issued, due, amount, descr)
  select 'Prime Lease Agents s.r.o.', 'letting', '5500', 'opex', s.sd + 9, s.sd + 39,
         round(s.rent0 * case when p_profile = 'residential' then 0.5 else 1.5 end, 2),
         'Letting fee — ' || s.tenant || ' (' || s.code || ')'
  from pg_temp.rv2_ls s
  where s.sd >= v_start and s.sd + 9 <= v_asof and not s.is_renewal;

  -- capital projects (capitalised to 1500, paid as capex)
  insert into pg_temp.rv2_ap (supplier, category, code, flow, issued, due, amount, descr)
  select x.supplier, 'capex', '1500', 'capex', (v_last + make_interval(months => x.off))::date + 12,
         (v_last + make_interval(months => x.off))::date + 42, x.amount, x.descr
  from (values
    ('office',      -7, 'Interio Build s.r.o.',         'Lobby & reception refurbishment',  185000),
    ('retail',     -11, 'RoadLine Construction s.r.o.', 'Parking signage & EV chargers',     38000),
    ('residential',-14, 'Fasády Slovakia s.r.o.',       'Façade repair & insulation',        46500),
    ('logistics',   -3, 'SolarGrid Systems s.r.o.',     'Rooftop PV installation (480 kWp)', 242000)
  ) as x(profile, off, supplier, descr, amount)
  where x.profile = p_profile;

  -- one disputed invoice left unpaid (shows up as overdue AP)
  insert into pg_temp.rv2_ap (supplier, category, code, flow, issued, due, amount, descr, hold)
  select 'TechFix Facility s.r.o.', 'repairs', '5100', 'opex', (v_last + make_interval(months => x.off))::date + 6,
         (v_last + make_interval(months => x.off))::date + 36, x.amount, x.descr, true
  from (values
    ('office',    -2, 7800, 'HVAC repair — disputed, works incomplete'),
    ('logistics', -3, 5400, 'Dock door repairs — disputed')
  ) as x(profile, off, amount, descr)
  where x.profile = p_profile;

  update pg_temp.rv2_ap a set paid =
    case when a.hold then null
         else nullif(least(greatest(a.issued + 1, a.due - 5 + (7 * private.h01(a.supplier || a.issued || a.amount))::int),
                           v_asof + 1), v_asof + 1) end;

  update pg_temp.rv2_ap a set doc_no = n.doc_no
  from (
    select ctid as rid, 'PI-' || to_char(issued, 'YYYY') || '-' ||
           lpad((row_number() over (partition by extract(year from issued) order by issued, supplier, amount))::text, 4, '0') as doc_no
    from pg_temp.rv2_ap
  ) n
  where a.ctid = n.rid;

  -- -------- bank movements (one BS item each) --------------------------------
  drop table if exists pg_temp.rv2_bank;
  create temp table rv2_bank (d date, flow text, contra text, amount numeric, inflow boolean, descr text, doc_no text);

  insert into pg_temp.rv2_bank (d, flow, contra, amount, inflow, descr)
  -- tenant receipts
  select r.paid, 'rent_receipts', '1100', r.amount, true, 'Receipt — ' || r.tenant || ' (' || r.doc_no || ')'
  from pg_temp.rv2_ar r where r.paid is not null
  union all
  -- supplier payments
  select a.paid, a.flow, '2000', a.amount, false, 'Payment — ' || a.supplier || ' (' || a.doc_no || ')'
  from pg_temp.rv2_ap a where a.paid is not null
  union all
  -- deposits received / refunded
  select s.sd + 3, 'deposits', '2100', round(s.rent0 * s.dep_m, 2), true, 'Deposit received — ' || s.tenant
  from pg_temp.rv2_ls s where s.sd >= v_start and s.sd + 3 <= v_asof and not s.is_renewal
  union all
  select s.ed + 20, 'deposits', '2100', round(s.rent0 * s.dep_m, 2), false, 'Deposit refunded — ' || s.tenant
  from pg_temp.rv2_ls s where s.ed >= v_start and s.ed + 20 <= v_asof and not s.renewed
    and s.stop_off is null
  union all
  -- debt service: monthly interest on the amortising balance, quarterly principal
  select l.eom, 'interest', '7000',
         round((cfg.loan0 - cfg.amort_q * l.q_before) * cfg.rate / 100 / 12, 2), false,
         'Loan interest ' || to_char(l.t, 'MM/YYYY') || ' — ' || cfg.lender
  from (
    select g.t::date as t, (g.t + interval '1 month' - interval '1 day')::date as eom,
           (select count(*) from generate_series(v_start::timestamp, g.t - interval '1 month', interval '1 month') q(m)
             where extract(month from q.m) in (3, 6, 9, 12)) as q_before
    from generate_series(v_start::timestamp, v_last::timestamp, interval '1 month') g(t)
  ) l
  union all
  select (g.t + interval '1 month' - interval '1 day')::date, 'principal', '2500', cfg.amort_q, false,
         'Loan principal Q' || extract(quarter from g.t) || '/' || extract(year from g.t) || ' — ' || cfg.lender
  from generate_series(v_start::timestamp, v_last::timestamp, interval '1 month') g(t)
  where extract(month from g.t) in (3, 6, 9, 12)
  union all
  select (g.t + interval '1 month' - interval '1 day')::date, 'distributions', '3100', cfg.dividend, false,
         'Dividend to shareholders ' || extract(year from g.t)
  from generate_series(v_start::timestamp, v_last::timestamp, interval '1 month') g(t)
  where extract(month from g.t) = 6;

  update pg_temp.rv2_bank b set doc_no = n.doc_no
  from (
    select ctid as rid, 'BS-' || to_char(d, 'YYYY-MM') || '-' ||
           lpad((row_number() over (partition by date_trunc('month', d::timestamp) order by d, inflow desc, descr))::text, 3, '0') as doc_no
    from pg_temp.rv2_bank
  ) n
  where b.ctid = n.rid;

  -- -------- the journal ------------------------------------------------------
  select coalesce(sum(round(s.rent0 * s.dep_m, 2)), 0) into v_dep_open
  from pg_temp.rv2_ls s where s.sd < v_start and s.ed >= v_start;

  -- 2900 at the window start: the unexpired part of a premium / tax already
  -- invoiced (debit), or tax accrued but not yet invoiced (credit).
  v_pre_open := case when (extract(month from v_start)::int - 1) % 3 = 0 then 0
                     else cfg.ins_q * (3 - (extract(month from v_start)::int - 1) % 3) / 3.0 end
              + case when extract(month from v_start) >= 5
                     then cfg.ptax * (13 - extract(month from v_start)) / 12.0
                     else -cfg.ptax * (extract(month from v_start) - 1) / 12.0 end;
  v_pre_open := round(v_pre_open, 2);

  insert into public.journal_entries
    (entity_id, account_id, batch_id, txn_date, description, debit, credit, currency, doc_no, flow)
  select p_entity, ac.id, v_batch, j.d, j.descr, j.dr, j.cr, 'EUR', j.doc, j.flow
  from (
    -- opening balances (retained earnings is the balancing figure)
    select v_start as d, 'OB-' || to_char(v_start, 'YYYY-MM') || '-01' as doc, x.code, x.descr, x.dr, x.cr, x.flow
    from (values
      ('1500', 'Opening balance — investment property', cfg.cost::numeric, 0::numeric, null::text),
      ('1590', 'Opening balance — accumulated depreciation', 0, cfg.accdep, null),
      ('1000', 'Opening balance — bank', cfg.cash0, 0, 'opening'),
      ('1100', 'Opening balance — rent billed in advance', v_ar_open, 0, null),
      ('2200', 'Opening balance — deferred income', 0, v_ar_open, null),
      ('2900', 'Opening balance — prepayments & accruals', greatest(v_pre_open, 0), greatest(-v_pre_open, 0), null),
      ('2500', 'Opening balance — bank loan', 0, cfg.loan0, null),
      ('2100', 'Opening balance — tenant deposits', 0, v_dep_open, null),
      ('3000', 'Opening balance — share capital', 0, cfg.capital, null),
      ('3100', 'Opening balance — retained earnings', 0,
         cfg.cost - cfg.accdep + cfg.cash0 + v_pre_open - cfg.loan0 - v_dep_open - cfg.capital, null)
    ) as x(code, descr, dr, cr, flow)
    union all
    -- sales invoices: billed in advance → deferred income
    select r.issued, r.doc_no, '1100', 'Invoice ' || r.doc_no || ' — ' || r.tenant, r.amount, 0, null
    from pg_temp.rv2_ar r where r.issued >= v_start
    union all
    select r.issued, r.doc_no, '2200', 'Rent ' || to_char(r.t, 'MM/YYYY') || ' — unit ' || r.code || ' (billed in advance)', 0, r.rent, null
    from pg_temp.rv2_ar r where r.issued >= v_start
    union all
    select r.issued, r.doc_no, '2200', 'Service charge advance ' || to_char(r.t, 'MM/YYYY'), 0, r.sc, null
    from pg_temp.rv2_ar r where r.issued >= v_start
    union all
    select r.issued, r.doc_no, '2200', 'Parking ' || to_char(r.t, 'MM/YYYY'), 0, r.parking, null
    from pg_temp.rv2_ar r where r.issued >= v_start
    union all
    -- on the 1st of each month the month's rent becomes income
    select x.t, 'GJ-' || to_char(x.t, 'YYYY-MM') || '-02', x.code, x.descr, x.dr, x.cr, null
    from (
      select r.t, sum(r.amount) as amt, sum(r.rent) as rent, sum(r.sc) as sc, sum(r.parking) as park
      from pg_temp.rv2_ar r where r.t <= v_last group by r.t
    ) m
    cross join lateral (values
      (m.t, '2200', 'Deferred rent released for ' || to_char(m.t, 'MM/YYYY'), m.amt, 0::numeric),
      (m.t, '4000', 'Rental income ' || to_char(m.t, 'MM/YYYY'), 0::numeric, m.rent),
      (m.t, '4100', 'Service charge income ' || to_char(m.t, 'MM/YYYY'), 0::numeric, m.sc),
      (m.t, '4200', 'Parking income ' || to_char(m.t, 'MM/YYYY'), 0::numeric, m.park)
    ) as x(t, code, descr, dr, cr)
    union all
    -- monthly expense of the prepaid insurance premium and property tax
    select x.d, 'GJ-' || to_char(g.t, 'YYYY-MM') || '-03', x.code, x.descr, x.dr, x.cr, null
    from generate_series(v_start::timestamp, v_last::timestamp, interval '1 month') g(t)
    cross join lateral (
      select (g.t + interval '1 month' - interval '1 day')::date as d,
             round(cfg.ins_q * power(1.05, extract(year from g.t) - extract(year from v_start)) / 3, 2) as ins,
             round(cfg.ptax * power(1.05, extract(year from g.t) - extract(year from v_start)) / 12, 2) as tax
    ) a
    cross join lateral (values
      (a.d, '5300', 'Insurance ' || to_char(g.t, 'MM/YYYY') || ' (1/3 of the quarterly premium)', a.ins, 0::numeric),
      (a.d, '5400', 'Property tax ' || to_char(g.t, 'MM/YYYY') || ' (1/12 of the annual tax)', a.tax, 0::numeric),
      (a.d, '2900', 'Prepayments released ' || to_char(g.t, 'MM/YYYY'), 0::numeric, a.ins + a.tax)
    ) as x(d, code, descr, dr, cr)
    union all
    -- purchase invoices
    select a.issued, a.doc_no, a.code, a.supplier || ' — ' || a.descr, a.amount, 0, null from pg_temp.rv2_ap a
    union all
    select a.issued, a.doc_no, '2000', 'Invoice ' || a.doc_no || ' — ' || a.supplier, 0, a.amount, null from pg_temp.rv2_ap a
    union all
    -- bank statement items: the bank line carries the cash-flow tag
    select b.d, b.doc_no, '1000', b.descr, case when b.inflow then b.amount else 0 end,
           case when b.inflow then 0 else b.amount end, b.flow from pg_temp.rv2_bank b
    union all
    select b.d, b.doc_no, b.contra, b.descr, case when b.inflow then 0 else b.amount end,
           case when b.inflow then b.amount else 0 end, null from pg_temp.rv2_bank b
    union all
    -- monthly depreciation (building = 70% of cost, 50 years)
    select (g.t + interval '1 month' - interval '1 day')::date, 'GJ-' || to_char(g.t, 'YYYY-MM') || '-01', x.code,
           'Depreciation ' || to_char(g.t, 'MM/YYYY') || ' — building', x.dr, x.cr, null
    from generate_series(v_start::timestamp, v_last::timestamp, interval '1 month') g(t)
    cross join lateral (values
      ('6000', round(cfg.cost * 0.70 * 0.02 / 12, 2), 0::numeric),
      ('1590', 0::numeric, round(cfg.cost * 0.70 * 0.02 / 12, 2))
    ) as x(code, dr, cr)
  ) j
  join public.accounts ac on ac.entity_id = p_entity and ac.code = j.code
  where j.dr <> 0 or j.cr <> 0;
  get diagnostics v_lines = row_count;

  -- -------- AR/AP sub-ledger ---------------------------------------------------
  insert into public.invoices (entity_id, kind, counterparty, issued_date, due_date, amount, status,
                               doc_no, paid_date, lease_id, category)
  select p_entity, 'ar', r.tenant, r.issued, r.due, r.amount,
         case when r.paid is null then 'open' else 'paid' end, r.doc_no, r.paid, r.lease_id, 'rent'
  from pg_temp.rv2_ar r
  union all
  select p_entity, 'ap', a.supplier, a.issued, a.due, a.amount,
         case when a.paid is null then 'open' else 'paid' end, a.doc_no, a.paid, null, a.category
  from pg_temp.rv2_ap a;

  -- -------- P&L budget (prepared before each year; next 12 months too) --------
  -- Revenue: leases signed before the budget year at contract rent; anything
  -- vacant at budget time is assumed let from April at ERV (+ a letting fee).
  drop table if exists pg_temp.rv2_bud;
  create temp table rv2_bud (t date, code text, amount numeric);

  insert into pg_temp.rv2_bud (t, code, amount)
  select r.t, x.code, round(x.amount, 2)
  from (
    select gr.t,
      sum(case when s.sd is not null
               then s.rent0 * power(1 + s.idx / 100, floor(private.months_between(s.sd, gr.t) / 12.0))
               when gr.mo >= 4 then gr.area_m2 * gr.erv_m2 * power(1.03, gr.off / 12.0) else 0 end) as rent,
      sum(case when s.sd is not null then s.area * s.sc_m2
               when gr.mo >= 4 then gr.area_m2 * cfg.sc_m2 else 0 end) as sc,
      sum(case when s.sd is not null then s.parking else 0 end) as park,
      sum(case when s.sd is null and gr.mo = 4
               then gr.area_m2 * gr.erv_m2 * power(1.03, gr.off / 12.0)
                    * case when p_profile = 'residential' then 0.5 else 1.5 end else 0 end) as letting
    from (
      select un.id as unit_id, un.area_m2, un.erv_m2, g.t::date as t, extract(month from g.t)::int as mo,
             private.months_between(v_last, g.t::date) as off
      from public.units un
      cross join generate_series(v_start::timestamp, v_horizon::timestamp, interval '1 month') g(t)
      where un.property_id = v_prop
    ) gr
    left join lateral (
      select * from pg_temp.rv2_ls l
      where l.unit_id = gr.unit_id and l.sd <= gr.t and l.ed >= gr.t
        and l.sd < date_trunc('year', gr.t::timestamp)::date
      limit 1
    ) s on true
    group by gr.t
  ) r
  cross join lateral (values ('4000', r.rent), ('4100', r.sc), ('4200', r.park), ('5500', r.letting)) as x(code, amount);

  insert into pg_temp.rv2_bud (t, code, amount)
  select m.t, x.code, round(x.amount, 2)
  from (
    select g.t::date as t, private.months_between(v_start, g.t::date) as k,
           (extract(year from g.t) - extract(year from v_start))::int as yi,
           extract(month from g.t)::int as mo,
           (select count(*) from generate_series(v_start::timestamp, g.t - interval '1 month', interval '1 month') q(m)
             where extract(month from q.m) in (3, 6, 9, 12)) as q_before
    from generate_series(v_start::timestamp, v_horizon::timestamp, interval '1 month') g(t)
  ) m
  cross join lateral (values
    ('5000', cfg.util * power(1.04, m.k / 12.0) * 0.93
             * (case when p_profile = 'residential'
                     then (array[1.45, 1.40, 1.15, 0.85, 0.65, 0.55, 0.50, 0.50, 0.60, 0.90, 1.20, 1.40])[m.mo]
                     else (array[1.35, 1.30, 1.10, 0.90, 0.80, 0.95, 1.10, 1.10, 0.85, 0.95, 1.15, 1.30])[m.mo] end)),
    ('5100', cfg.rm * power(1.03, m.k / 12.0) * 1.15),
    ('5200', cfg.mgmt * power(1.03, m.yi)),
    ('5300', cfg.ins_q * power(1.05, m.yi) / 3),
    ('5400', cfg.ptax * power(1.03, m.yi) / 12),
    ('5600', cfg.clean * power(1.04, m.yi)),
    ('6000', cfg.cost * 0.70 * 0.02 / 12),
    ('7000', (cfg.loan0 - cfg.amort_q * m.q_before) * (cfg.rate - 0.30) / 100 / 12)
  ) as x(code, amount);

  insert into public.budgets (entity_id, period, account_code, amount)
  select p_entity, b.t, b.code, b.amount from pg_temp.rv2_bud b
  on conflict (entity_id, period, account_code) do update set amount = excluded.amount;

  -- -------- cash budget (same plan, on a cash basis) --------------------------
  insert into public.cash_budget (entity_id, period, flow, amount)
  select p_entity, cb.t, cb.flow, round(sum(cb.amount), 2)
  from (
    -- rent, service charge and parking collected in the month billed (98.5%)
    select b.t, 'rent_receipts' as flow, b.amount * 0.985 as amount
    from pg_temp.rv2_bud b where b.code in ('4000', '4100', '4200')
    union all
    -- operating invoices paid the month after they are incurred
    select (b.t + interval '1 month')::date, 'opex', -b.amount
    from pg_temp.rv2_bud b where b.code in ('5000', '5100', '5200', '5500', '5600')
    union all
    -- the quarterly insurance premium, paid the month after it is invoiced
    select g.t::date, 'opex', -cfg.ins_q * power(1.05, extract(year from g.t) - extract(year from v_start))
    from generate_series(v_start::timestamp, v_horizon::timestamp, interval '1 month') g(t)
    where extract(month from g.t) in (2, 5, 8, 11)
    union all
    -- the annual property tax, due end of May
    select g.t::date, 'property_tax', -cfg.ptax * power(1.03, extract(year from g.t) - extract(year from v_start))
    from generate_series(v_start::timestamp, v_horizon::timestamp, interval '1 month') g(t)
    where extract(month from g.t) = 5
    union all
    select b.t, 'interest', -b.amount from pg_temp.rv2_bud b where b.code = '7000'
    union all
    select g.t::date, 'principal', -cfg.amort_q
    from generate_series(v_start::timestamp, v_horizon::timestamp, interval '1 month') g(t)
    where extract(month from g.t) in (3, 6, 9, 12)
    union all
    select g.t::date, 'distributions', -cfg.dividend
    from generate_series(v_start::timestamp, v_horizon::timestamp, interval '1 month') g(t)
    where extract(month from g.t) = 6
    union all
    select (v_last + make_interval(months => x.off))::date, 'capex', -x.amount
    from (values
      ('office',      -8, 175000), ('office',       2, 260000),
      ('retail',     -11,  35000), ('retail',       2, 120000),
      ('residential',-14,  40000), ('residential',  3,  30000),
      ('logistics',   -3, 220000), ('logistics',    6,  90000)
    ) as x(profile, off, amount)
    where x.profile = p_profile
  ) cb
  where cb.t between v_start and v_horizon
  group by cb.t, cb.flow;

  -- -------- live review batch (office only): an upload waiting for approval --
  if p_live then
    insert into public.ingest_batches
      (entity_id, uploaded_by, source, file_name, storage_path, file_hash, period, status)
    values (p_entity, p_uploader, 'manual',
            'facility-costs-' || to_char(v_last + interval '1 month', 'YYYY-MM') || '.csv',
            'ingest/' || p_entity::text || '/facility-costs.csv',
            'rv2-live-' || md5(p_entity::text || v_last::text) || md5(v_last::text),
            (v_last + interval '1 month')::date, 'queued')
    returning id into v_live;

    insert into public.journal_staging
      (batch_id, entity_id, row_num, account_code, txn_date, description, debit, credit, currency, raw)
    select v_live, p_entity, x.n, x.code, x.d, x.descr, x.dr, x.cr, 'EUR',
           jsonb_build_object('account_code', x.code, 'txn_date', x.d, 'description', x.descr,
                              'debit', x.dr, 'credit', x.cr, 'currency', 'EUR')
    from (
    -- the five supplier bills + their payable (so the batch balances)
    select c.n, c.code, c.d, c.descr, c.dr, 0::numeric as cr from (values
      (1, '5000', (v_last + interval '1 month')::date + 4,
          'Metro Energy — heating catch-up bill (meter fault)',
          round(cfg.util * power(1.04, 24 / 12.0) * 4.2, 2)),
      (2, '5100', (v_last + interval '1 month')::date + 6,
          'TechFix — planned maintenance',
          round(cfg.rm * power(1.03, 24 / 12.0) * 0.95, 2)),
      (3, '5200', (v_last + interval '1 month')::date,
          'Rievoree AM — management fee',
          round(cfg.mgmt * power(1.03, extract(year from v_last) - extract(year from v_start)), 2)),
      (4, '5600', (v_last + interval '1 month')::date + 9,
          'CleanGuard — cleaning & security',
          round(cfg.clean * power(1.04, extract(year from v_last) - extract(year from v_start)), 2)),
      (5, '5100', (v_last + interval '1 month')::date + 8,
          'TechFix — lift service contract',
          round(cfg.rm * 0.35, 2))
    ) as c(n, code, d, descr, dr)
    union all
    select 6, '2000', (v_last + interval '1 month')::date + 10, 'Supplier invoices — facility manager export', 0,
           round(cfg.util * power(1.04, 24 / 12.0) * 4.2, 2) + round(cfg.rm * power(1.03, 24 / 12.0) * 0.95, 2)
           + round(cfg.mgmt * power(1.03, extract(year from v_last) - extract(year from v_start)), 2)
           + round(cfg.clean * power(1.04, extract(year from v_last) - extract(year from v_start)), 2)
           + round(cfg.rm * 0.35, 2)
    ) as x(n, code, d, descr, dr, cr);

    perform private.transform_batch(v_live);
    perform private.detect_anomalies(v_live);
  end if;

  return jsonb_build_object(
    'entity_id', p_entity, 'profile', p_profile,
    'first_month', v_start, 'last_month', v_last,
    'journal_lines', v_lines,
    'leases', (select count(*) from pg_temp.rv2_ls),
    'invoices', (select count(*) from pg_temp.rv2_ar) + (select count(*) from pg_temp.rv2_ap),
    'live_batch', v_live);
end;
$$;

revoke all on function private.generate_property_books(uuid, text, uuid, date, boolean)
  from public, anon, authenticated;


-- ----------------------------------------------------------------------------
-- 9. private.load_reporting_demo — rebuild the four showcase SPVs
--    (matched by slug, so it works whatever their ids are). Full reset of
--    their books, uploads included. Service role / SQL editor only.
-- ----------------------------------------------------------------------------
create or replace function private.load_reporting_demo(p_last date default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uploader uuid;
  v_entity   uuid;
  v_out      jsonb := '[]'::jsonb;
  r          record;
begin
  select id into v_uploader from public.profiles where lower(email) = 'manager@demo.local' limit 1;
  if v_uploader is null then
    select id into v_uploader from public.profiles
    where role in ('super_admin', 'admin') order by created_at limit 1;
  end if;
  if v_uploader is null then
    raise exception 'load_reporting_demo: need manager@demo.local or an admin profile to own the batches'
      using errcode = 'P0002';
  end if;

  for r in
    select * from (values
      ('northwind', 'Danube Office Park s.r.o.',     'office',      true),
      ('acme',      'Riverside Retail Park s.r.o.',  'retail',      false),
      ('globex',    'Lindenhof Residences s.r.o.',   'residential', false),
      ('initech',   'Westgate Logistics Hub s.r.o.', 'logistics',   false)
    ) as s(slug, name, profile, live)
  loop
    insert into public.entities (name, slug, base_currency, is_sample)
    values (r.name, r.slug, 'EUR', true)
    on conflict (slug) do update set name = excluded.name, is_sample = true, is_active = true
    returning id into v_entity;

    delete from public.journal_entries      where entity_id = v_entity;
    delete from public.ingest_batches       where entity_id = v_entity;
    delete from public.pipeline_events      where entity_id = v_entity;
    delete from public.report_refresh_queue where entity_id = v_entity;
    delete from public.accounts             where entity_id = v_entity;

    v_out := v_out || jsonb_build_array(
      private.generate_property_books(v_entity, r.profile, v_uploader, p_last, r.live));
  end loop;

  refresh materialized view private.mv_account_monthly;
  perform private.reset_demo_state();   -- memberships back to the seeded shape
  return v_out;
end;
$$;

revoke all on function private.load_reporting_demo(date) from public, anon, authenticated;


-- ----------------------------------------------------------------------------
-- 10. Self-serve sandboxes in "demo" mode get freshly generated books (an
--     office SPV) instead of a copy of the old journal. Both bodies are
--     otherwise identical to migration 34.
-- ----------------------------------------------------------------------------
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
  v_source  uuid;   -- Northwind (the chart-of-accounts template)
  v_entity  uuid;   -- the caller's personal entity
  v_created boolean := false;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  perform private.deny_if_demo();
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
     and not exists (select 1 from public.journal_entries where entity_id = v_entity)
  then
    perform private.generate_property_books(v_entity, 'office', v_uid);
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
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  perform private.deny_if_demo();
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

  if p_mode = 'demo' then
    perform private.generate_property_books(v_entity, 'office', v_uid);
    refresh materialized view private.mv_account_monthly;
  end if;

  return jsonb_build_object('entity_id', v_entity);
end;
$$;
