/**
 * Element → the exact code behind it. Each on-screen element the tour or the
 * X-RAY CODE inspector can point at (keyed by its `data-tour` id) maps to one or
 * more REAL files, each focused on a needle line: where the element is drawn,
 * the component that renders it, and the math / SQL that produces its numbers.
 * The code view opens these as tabs and highlights the block starting at the
 * needle. scripts/check-code-map.mjs verifies every needle exists (CI).
 */
export interface CodeRef { file: string; focus: string; label: string }
export interface CodeTarget { title: string; refs: CodeRef[] }

const P = (name: string) => `src/pages/${name}.tsx`
const CHARTS = "src/components/charts/FinancialCharts.tsx"
const AGG = "src/lib/data/aggregate.ts"
const D = (name: string) => `src/lib/data/${name}.ts`
const RE = "supabase/migrations/20261015000001_real_estate_reporting.sql"
const MIG = (f: string) => `supabase/migrations/${f}.sql`
const SHEET = MIG("20261016000003_sheet_link_connector")

export const CODE_MAP: Record<string, CodeTarget> = {
  // ---- Dashboard ----------------------------------------------------------
  "dash-filter": { title: "Property filter", refs: [
    { file: P("Dashboard"), focus: 'data-tour="dash-filter"', label: "the filter" },
    { file: "src/components/report/Kit.tsx", focus: "export function useEntityScope", label: "shared scope" },
    { file: D("useReport"), focus: "export function useReport", label: "the one query" },
    { file: D("fetchAll"), focus: "export async function fetchAll", label: "1000-row paging" },
  ] },
  "dash-kpis": { title: "KPI tiles", refs: [
    { file: P("Dashboard"), focus: 'data-tour="dash-kpis"', label: "the tiles" },
    { file: AGG, focus: "export function kpiOf", label: "value + m/m delta" },
    { file: AGG, focus: "export function monthlySeries", label: "monthly series" },
    { file: D("rentroll"), focus: "export function occupancySeries", label: "occupancy history" },
  ] },
  "dash-ratios": { title: "Lender ratios", refs: [
    { file: P("Dashboard"), focus: "const dscr =", label: "DSCR & LTV" },
    { file: D("rentroll"), focus: "export function rollKpis", label: "WALT" },
  ] },
  "dash-noi": { title: "Revenue, costs & NOI", refs: [
    { file: P("Dashboard"), focus: 'tour="dash-noi"', label: "on the page" },
    { file: CHARTS, focus: "export function NoiTrend", label: "the chart" },
    { file: AGG, focus: "export function classify", label: "which line is what" },
  ] },
  "dash-buildings": { title: "NOI by building", refs: [
    { file: P("Dashboard"), focus: 'tour="dash-buildings"', label: "on the page" },
    { file: AGG, focus: "export function noiByEntity", label: "NOI per SPV" },
    { file: CHARTS, focus: "export function RankBars", label: "the bars" },
  ] },
  "dash-costs": { title: "Operating cost structure", refs: [
    { file: P("Dashboard"), focus: 'tour="dash-costs"', label: "on the page" },
    { file: CHARTS, focus: "export function ExpenseTreemap", label: "the treemap" },
    { file: AGG, focus: "export function opexByAccount", label: "cost grouping" },
  ] },

  // ---- P&L ----------------------------------------------------------------
  "pl-filters": { title: "Property + period", refs: [
    { file: P("Pl"), focus: 'data-tour="pl-filters"', label: "the filters" },
    { file: D("pl"), focus: "export function scopeOptions", label: "YTD / LTM / FY / month" },
  ] },
  "pl-bridge": { title: "From revenue to profit", refs: [
    { file: P("Pl"), focus: 'tour="pl-bridge"', label: "on the page" },
    { file: D("pl"), focus: "export function profitBridge", label: "bridge steps" },
    { file: CHARTS, focus: "export function Waterfall", label: "the waterfall" },
  ] },
  "pl-variance": { title: "Variances vs budget", refs: [
    { file: P("Pl"), focus: 'tour="pl-variance"', label: "on the page" },
    { file: D("pl"), focus: "export function lineVariances", label: "favourable sign" },
    { file: CHARTS, focus: "export function VarianceBars", label: "diverging bars" },
  ] },
  "pl-table": { title: "Income statement", refs: [
    { file: P("Pl"), focus: 'data-tour="pl-table"', label: "the statement" },
    { file: D("pl"), focus: "export function buildPl", label: "NOI structure" },
    { file: D("useBudget"), focus: "export function useBudget", label: "budget query" },
    { file: RE, focus: "-------- P&L budget", label: "how the budget is built" },
  ] },

  // ---- Rent roll ----------------------------------------------------------
  "roll-filters": { title: "Property + unit status", refs: [
    { file: P("RentRoll"), focus: 'data-tour="roll-filters"', label: "the filters" },
  ] },
  "roll-kpis": { title: "Rent-roll KPIs", refs: [
    { file: P("RentRoll"), focus: 'data-tour="roll-kpis"', label: "the tiles" },
    { file: D("rentroll"), focus: "export function rollKpis", label: "occupancy, WALT, reversion" },
    { file: D("rentroll"), focus: "export function buildRentRoll", label: "one row per unit" },
  ] },
  "roll-expiry": { title: "Lease expiry profile", refs: [
    { file: P("RentRoll"), focus: 'tour="roll-expiry"', label: "on the page" },
    { file: D("rentroll"), focus: "export function expiryProfile", label: "rent by years left" },
    { file: CHARTS, focus: "export function ExpiryBars", label: "the chart" },
  ] },
  "roll-tenants": { title: "Tenant concentration", refs: [
    { file: P("RentRoll"), focus: 'tour="roll-tenants"', label: "on the page" },
    { file: D("rentroll"), focus: "export function tenantConcentration", label: "share of rent" },
  ] },
  "roll-table": { title: "Units & leases", refs: [
    { file: P("RentRoll"), focus: 'tour="roll-table"', label: "the table" },
    { file: D("useRentRoll"), focus: "export function useRentRollData", label: "three RLS queries" },
    { file: RE, focus: "create table if not exists public.leases", label: "the leases table" },
  ] },

  // ---- Receivables & payables ---------------------------------------------
  "rp-filters": { title: "Receivables / payables", refs: [
    { file: P("Receivables"), focus: 'data-tour="rp-filters"', label: "the switch" },
  ] },
  "rp-kpis": { title: "Credit-control KPIs", refs: [
    { file: P("Receivables"), focus: 'data-tour="rp-kpis"', label: "the tiles" },
    { file: D("receivables"), focus: "export function arApKpis", label: "DSO, overdue, on time" },
    { file: D("useInvoices"), focus: "export function useOpenItems", label: "open items query" },
  ] },
  "rp-tieout": { title: "Sub-ledger ↔ GL tie-out", refs: [
    { file: P("Receivables"), focus: 'tour="rp-tieout"', label: "on the page" },
    { file: D("receivables"), focus: "export function ledgerBalance", label: "GL control account" },
    { file: "src/components/report/Kit.tsx", focus: "export function TieOut", label: "the proof" },
  ] },
  "rp-aging": { title: "Aging buckets", refs: [
    { file: P("Receivables"), focus: 'tour="rp-aging"', label: "on the page" },
    { file: D("receivables"), focus: "export function agingBy", label: "days past due" },
    { file: CHARTS, focus: "export function AgingStacked", label: "stacked bars" },
  ] },
  "rp-settlement": { title: "Collection track record", refs: [
    { file: P("Receivables"), focus: 'tour="rp-settlement"', label: "on the page" },
    { file: D("receivables"), focus: "export function settlementSeries", label: "on time / late / open" },
    { file: RE, focus: "create or replace view public.report_invoice_monthly", label: "the SQL view" },
  ] },
  "rp-parties": { title: "Who owes the most", refs: [
    { file: P("Receivables"), focus: 'tour="rp-parties"', label: "on the page" },
    { file: D("receivables"), focus: "export function byCounterparty", label: "per counterparty" },
  ] },
  "rp-items": { title: "Open items", refs: [
    { file: P("Receivables"), focus: 'tour="rp-items"', label: "the list" },
    { file: D("useInvoices"), focus: "export function useOpenItems", label: "the query" },
  ] },

  // ---- Budget flow --------------------------------------------------------
  "cf-filters": { title: "Property + year", refs: [
    { file: P("BudgetFlow"), focus: 'data-tour="cf-filters"', label: "the filters" },
  ] },
  "cf-kpis": { title: "Cash KPIs", refs: [
    { file: P("BudgetFlow"), focus: 'data-tour="cf-kpis"', label: "the tiles" },
    { file: D("cashflow"), focus: "export function buildCashModel", label: "the cash model" },
  ] },
  "cf-balance": { title: "Cash balance: plan vs actual", refs: [
    { file: P("BudgetFlow"), focus: 'tour="cf-balance"', label: "on the page" },
    { file: CHARTS, focus: "export function CashPlanChart", label: "the chart" },
    { file: D("cashflow"), focus: "const buffer =", label: "minimum buffer" },
  ] },
  "cf-bridge": { title: "Where the cash went", refs: [
    { file: P("BudgetFlow"), focus: 'tour="cf-bridge"', label: "on the page" },
    { file: D("cashflow"), focus: "export function cashBridge", label: "bridge steps" },
  ] },
  "cf-table": { title: "Cash budget", refs: [
    { file: P("BudgetFlow"), focus: "function CashTable", label: "the matrix" },
    { file: D("useCash"), focus: "export function useCashActual", label: "actuals query" },
    { file: RE, focus: "create or replace view public.report_cash_monthly", label: "bank lines by flow" },
  ] },

  // ---- Forecast -----------------------------------------------------------
  "fc-controls": { title: "Scenarios", refs: [
    { file: P("Forecast"), focus: 'data-tour="fc-controls"', label: "the controls" },
    { file: D("forecast"), focus: "export const SCENARIOS", label: "base / downside / upside" },
  ] },
  "fc-drivers": { title: "Forecast drivers", refs: [
    { file: P("Forecast"), focus: 'data-tour="fc-drivers"', label: "the sliders" },
    { file: D("forecast"), focus: "export interface Drivers", label: "what each driver means" },
  ] },
  "fc-kpis": { title: "Forecast KPIs", refs: [
    { file: P("Forecast"), focus: "const dscr =", label: "12-month totals" },
  ] },
  "fc-chart": { title: "NOI actual → forecast", refs: [
    { file: P("Forecast"), focus: 'tour="fc-chart"', label: "on the page" },
    { file: D("forecast"), focus: "export function runForecast", label: "the engine" },
    { file: CHARTS, focus: "export function ForecastChart", label: "the chart" },
  ] },
  "fc-outlook": { title: "Full-year outlook", refs: [
    { file: P("Forecast"), focus: 'tour="fc-outlook"', label: "the table" },
    { file: D("forecast"), focus: "function outlook(", label: "actual + forecast vs budget" },
  ] },
  "fc-events": { title: "Lease events", refs: [
    { file: P("Forecast"), focus: 'tour="fc-events"', label: "the list" },
    { file: D("forecast"), focus: "events.push(", label: "expiries & vacancies" },
  ] },

  // ---- Journal ------------------------------------------------------------
  "jr-filters": { title: "Property, month, search", refs: [
    { file: P("Journal"), focus: 'data-tour="jr-filters"', label: "the filters" },
  ] },
  "jr-types": { title: "Document types", refs: [
    { file: P("Journal"), focus: 'data-tour="jr-types"', label: "the chips" },
    { file: D("journal"), focus: "export const DOC_TYPES", label: "SI · PI · BS · GJ" },
  ] },
  "jr-kpis": { title: "Journal KPIs", refs: [
    { file: P("Journal"), focus: 'data-tour="jr-kpis"', label: "the tiles" },
    { file: D("useJournal"), focus: "export function useJournalSummary", label: "the query" },
    { file: RE, focus: "create or replace view public.journal_month_summary", label: "the SQL view" },
  ] },
  "jr-proof": { title: "Debits = credits", refs: [
    { file: P("Journal"), focus: 'tour="jr-proof"', label: "on the page" },
    { file: MIG("20260605000003_journal"), focus: "constraint journal_entries_amounts_valid", label: "one side per line" },
  ] },
  "jr-volume": { title: "Posting volume", refs: [
    { file: P("Journal"), focus: 'tour="jr-volume"', label: "on the page" },
    { file: D("journal"), focus: "export function volumeByMonth", label: "docs per month" },
    { file: CHARTS, focus: "export function VolumeStacked", label: "the chart" },
  ] },
  "jr-tb": { title: "Trial balance", refs: [
    { file: P("Journal"), focus: 'tour="jr-tb"', label: "the table" },
    { file: D("journal"), focus: "export function trialBalance", label: "debits & credits per account" },
  ] },
  "jr-docs": { title: "Documents", refs: [
    { file: P("Journal"), focus: 'tour="jr-docs"', label: "the table" },
    { file: D("useJournal"), focus: "export function useJournalDocuments", label: "server-side paging" },
    { file: MIG("20261016000001_journal_documents_mv"), focus: "create materialized view if not exists private.mv_journal_documents", label: "one row per document (materialized)" },
  ] },

  // ---- X-ray --------------------------------------------------------------
  "xray-calls": { title: "Live calls", refs: [
    { file: "src/lib/xray/instrumentedFetch.ts", focus: "export function createInstrumentedFetch", label: "the fetch seam" },
    { file: "src/components/xray/tabs/CallsTab.tsx", focus: "export function CallsTab", label: "this panel" },
  ] },
  "xray-rls": { title: "Row-level security", refs: [
    { file: "src/components/xray/tabs/RlsTab.tsx", focus: "async function runAs", label: "run as a role" },
    { file: MIG("20260605000001_identity_and_tenancy"), focus: "create policy entities_select", label: "the RLS policy" },
    { file: MIG("20261013000001_security_hardening_demo_lockdown"), focus: "create or replace function private.is_admin", label: "admin hardening" },
  ] },
  "xray-sql": { title: "The real SQL", refs: [
    { file: MIG("20260605000001_identity_and_tenancy"), focus: "create policy entities_select", label: "RLS policy" },
    { file: MIG("20260626000007_scoped_admin"), focus: "create or replace function public.approve_batch", label: "approve gate" },
  ] },
  "xray-pipeline": { title: "Pipeline events", refs: [
    { file: "src/lib/xray/usePipelineEvents.ts", focus: "export function usePipelineEvents", label: "realtime feed" },
    { file: MIG("20260610000006_pg_cron_refresh_and_housekeeping"), focus: "perform cron.schedule(", label: "pg_cron" },
    { file: MIG("20260610000007_notify_review"), focus: "perform net.http_post(", label: "pg_net" },
  ] },

  // ---- Upload / review ----------------------------------------------------
  "role-switch": { title: "Demo role switch", refs: [
    { file: "src/app/AppShell.tsx", focus: "function DemoRoleSwitch", label: "the switch" },
    { file: MIG("20261013000001_security_hardening_demo_lockdown"), focus: "create or replace function private.deny_if_demo", label: "demo lockdown" },
  ] },
  "ingest-guide": { title: "What to upload", refs: [
    { file: P("Ingest"), focus: "function UploadGuide", label: "the guide" },
  ] },
  "ingest-upload": { title: "Upload form", refs: [
    { file: P("Ingest"), focus: "async function submit", label: "submit flow" },
    { file: "src/lib/data/parseCsv.ts", focus: "export function parseCsvToRows", label: "CSV parsing" },
    { file: "src/lib/data/useBatches.ts", focus: "export function useUploadBatch", label: "upload call" },
  ] },
  "ingest-batches": { title: "Batches", refs: [
    { file: P("Ingest"), focus: 'data-tour="ingest-batches"', label: "the table" },
    { file: "src/lib/data/useBatches.ts", focus: "export function useBatches", label: "the query" },
  ] },
  "batch-detail": { title: "Batch review", refs: [
    { file: "src/components/BatchDetail.tsx", focus: "export function BatchDetail", label: "the review" },
    { file: MIG("20260607000002_etl_transform"), focus: "stddev_samp(m) as sd", label: "z-score screen" },
    { file: MIG("20261013000003_demo_block_ingest_writes"), focus: "create or replace function private.block_demo_writes", label: "demo write block" },
  ] },
  "connectors-add": { title: "Add a connector", refs: [
    { file: P("Connectors"), focus: "function CreateConnector", label: "the form" },
    { file: SHEET, focus: "create or replace function public.create_connector", label: "create (validated link)" },
    { file: SHEET, focus: "create or replace function private.normalize_sheet_url", label: "Sheets link → CSV" },
    { file: SHEET, focus: "create or replace function private.connector_url_ok", label: "public https only" },
  ] },
  "connectors-showcase": { title: "Sync a spreadsheet link", refs: [
    { file: D("useConnectors"), focus: "export function useSheetSync", label: "sync + poll" },
    { file: SHEET, focus: "create or replace function public.sync_url_connector", label: "fetch (pg_net)" },
    { file: SHEET, focus: "create or replace function private.parse_csv_rows", label: "CSV parsed in SQL" },
    { file: SHEET, focus: "create or replace function private.process_url_fetch", label: "preview / ingest" },
    { file: P("Connectors"), focus: "function SyncResult", label: "the result panel" },
  ] },
  "connectors-how": { title: "How connectors work", refs: [
    { file: SHEET, focus: "create or replace function private.run_connector_syncs", label: "hourly (pg_cron)" },
    { file: "supabase/functions/connector-webhook/index.ts", focus: "timingSafeEqual(signature", label: "HMAC verify" },
    { file: P("Connectors"), focus: "function HowItWorks", label: "this section" },
  ] },
}
