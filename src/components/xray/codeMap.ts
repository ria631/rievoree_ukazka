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
const MIG = (f: string) => `supabase/migrations/${f}.sql`

export const CODE_MAP: Record<string, CodeTarget> = {
  // ---- Dashboard ----------------------------------------------------------
  "dash-filter": { title: "Entity filter", refs: [
    { file: P("Dashboard"), focus: 'data-tour="dash-filter"', label: "the filter" },
    { file: "src/lib/data/useReport.ts", focus: "export function useReport", label: "the one query" },
  ] },
  "dash-kpis": { title: "KPI tiles", refs: [
    { file: P("Dashboard"), focus: 'data-tour="dash-kpis"', label: "the tiles" },
    { file: AGG, focus: "export function executiveKpis", label: "KPI + MoM delta math" },
    { file: AGG, focus: "export function executiveSeries", label: "18-month series" },
  ] },
  "dash-ratios": { title: "Financial ratios", refs: [
    { file: P("Dashboard"), focus: 'data-tour="dash-ratios"', label: "the tiles" },
    { file: AGG, focus: "export function financialRatios", label: "ratio formulas" },
  ] },
  "dash-combo": { title: "Revenue & operating margin", refs: [
    { file: P("Dashboard"), focus: 'tour="dash-combo"', label: "on the page" },
    { file: CHARTS, focus: "export function RevenueMarginCombo", label: "the chart" },
    { file: AGG, focus: "export function executiveSeries", label: "margin math" },
  ] },
  "dash-growth": { title: "Momentum · MoM growth", refs: [
    { file: P("Dashboard"), focus: 'tour="dash-growth"', label: "on the page" },
    { file: CHARTS, focus: "export function GrowthBars", label: "the chart" },
    { file: AGG, focus: "export function momGrowth", label: "growth math" },
  ] },
  "dash-pnl": { title: "Revenue vs expenses", refs: [
    { file: P("Dashboard"), focus: 'tour="dash-pnl"', label: "on the page" },
    { file: CHARTS, focus: "export function PnlTrend", label: "the chart" },
    { file: AGG, focus: "export function monthlyPnl", label: "monthly roll-up" },
  ] },
  "dash-treemap": { title: "Cost structure", refs: [
    { file: P("Dashboard"), focus: 'tour="dash-treemap"', label: "on the page" },
    { file: CHARTS, focus: "export function ExpenseTreemap", label: "the treemap" },
    { file: AGG, focus: "export function expenseByAccount", label: "cost grouping" },
  ] },

  // ---- P&L ----------------------------------------------------------------
  "pl-filters": { title: "Entity + period filters", refs: [
    { file: P("Pl"), focus: 'data-tour="pl-filters"', label: "the filters" },
  ] },
  "pl-bridge": { title: "Operating-income bridge", refs: [
    { file: P("Pl"), focus: 'tour="pl-bridge"', label: "on the page" },
    { file: AGG, focus: "export function marginBridge", label: "bridge steps" },
    { file: CHARTS, focus: "export function Waterfall", label: "the waterfall" },
  ] },
  "pl-top": { title: "Biggest lines of money", refs: [
    { file: P("Pl"), focus: 'tour="pl-top"', label: "on the page" },
    { file: AGG, focus: "export function topAccounts", label: "ranking" },
    { file: CHARTS, focus: "export function TopAccountsBars", label: "the bars" },
  ] },
  "pl-table": { title: "Income statement", refs: [
    { file: P("Pl"), focus: 'data-tour="pl-table"', label: "the statement" },
    { file: "src/lib/data/pl.ts", focus: "export function buildPl", label: "statement builder" },
  ] },

  // ---- Balance ------------------------------------------------------------
  "balance-check": { title: "A = L + E tie-out", refs: [
    { file: P("Balance"), focus: 'data-tour="balance-check"', label: "the badge" },
    { file: "src/lib/data/balance.ts", focus: "export function buildBalanceSheet", label: "balance sheet math" },
  ] },
  "balance-sections": { title: "Assets · liabilities · equity", refs: [
    { file: P("Balance"), focus: 'data-tour="balance-sections"', label: "the sections" },
    { file: P("Balance"), focus: "function Section(", label: "section table" },
  ] },
  "balance-cash": { title: "Cash position", refs: [
    { file: P("Balance"), focus: 'tour="balance-cash"', label: "on the page" },
    { file: CHARTS, focus: "export function CashTrend", label: "the chart" },
  ] },
  "balance-capital": { title: "Capital structure", refs: [
    { file: P("Balance"), focus: 'tour="balance-capital"', label: "on the page" },
    { file: CHARTS, focus: "export function CompositionBar", label: "the bar" },
  ] },
  "balance-cf": { title: "Cash-flow waterfall", refs: [
    { file: P("Balance"), focus: 'tour="balance-cf"', label: "on the page" },
    { file: "src/lib/data/balance.ts", focus: "export function cashFlowSteps", label: "indirect method" },
    { file: CHARTS, focus: "export function Waterfall", label: "the waterfall" },
  ] },

  // ---- Pivot --------------------------------------------------------------
  "pivot-controls": { title: "Pivot controls", refs: [
    { file: P("Pivot"), focus: 'data-tour="pivot-controls"', label: "the controls" },
  ] },
  "pivot-grid": { title: "Pivot table", refs: [
    { file: P("Pivot"), focus: 'data-tour="pivot-grid"', label: "the table" },
    { file: "src/lib/data/pivot.ts", focus: "export function buildPivot", label: "pivot engine" },
    { file: P("Pivot"), focus: "function HeatCell(", label: "heat shading" },
  ] },
  "pivot-bars": { title: "Magnitude bars", refs: [
    { file: P("Pivot"), focus: 'tour="pivot-bars"', label: "on the page" },
    { file: CHARTS, focus: "export function MagnitudeBars", label: "the bars" },
  ] },

  // ---- Variance -----------------------------------------------------------
  "variance-controls": { title: "Variance controls", refs: [
    { file: P("Variance"), focus: 'data-tour="variance-controls"', label: "the controls" },
  ] },
  "variance-bridge": { title: "Variance bridge", refs: [
    { file: P("Variance"), focus: 'data-tour="variance-bridge"', label: "on the page" },
    { file: "src/lib/data/variance.ts", focus: "export function buildVarianceBridge", label: "driver math" },
  ] },
  "variance-table": { title: "Driver table", refs: [
    { file: P("Variance"), focus: 'data-tour="variance-table"', label: "the table" },
  ] },

  // ---- Aging --------------------------------------------------------------
  "aging-kpis": { title: "Aging totals", refs: [
    { file: P("Aging"), focus: 'data-tour="aging-kpis"', label: "the tiles" },
    { file: "src/lib/data/aging.ts", focus: "export function buildAging", label: "bucketing" },
  ] },
  "aging-toggle": { title: "Receivables / payables", refs: [
    { file: P("Aging"), focus: 'data-tour="aging-toggle"', label: "the toggle" },
  ] },
  "aging-stacked": { title: "Aging by entity", refs: [
    { file: P("Aging"), focus: 'tour="aging-stacked"', label: "on the page" },
    { file: CHARTS, focus: "export function AgingStacked", label: "the chart" },
  ] },
  "aging-risk": { title: "Collection risk", refs: [
    { file: P("Aging"), focus: 'tour="aging-risk"', label: "on the page" },
    { file: CHARTS, focus: "export function CompositionBar", label: "the bar" },
  ] },
  "aging-heat": { title: "Aging heatmap", refs: [
    { file: P("Aging"), focus: 'data-tour="aging-heat"', label: "the table" },
    { file: P("Aging"), focus: "function HeatCell(", label: "heat shading" },
  ] },

  // ---- Reports ------------------------------------------------------------
  "reports-trend": { title: "Clickable trend", refs: [
    { file: P("Reports"), focus: 'tour="reports-trend"', label: "on the page" },
    { file: P("Reports"), focus: "function selectMonth", label: "click → filter" },
  ] },
  "reports-table": { title: "The roll-up behind every report", refs: [
    { file: P("Reports"), focus: 'data-tour="reports-table"', label: "the table" },
    { file: "src/lib/data/useReport.ts", focus: "export function useReport", label: "the query" },
    { file: MIG("20260610000002_report_account_monthly"), focus: "create view public.report_account_monthly", label: "the SQL view" },
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
    { file: "src/lib/data/useConnectors.ts", focus: "export function webhookUrl", label: "webhook URL" },
  ] },
  "connectors-how": { title: "How connectors work", refs: [
    { file: "supabase/functions/connector-webhook/index.ts", focus: "timingSafeEqual(signature", label: "HMAC verify" },
    { file: MIG("20260701000001_simulate_connector_sync"), focus: "create or replace function public.simulate_connector_sync", label: "simulate sync" },
    { file: P("Connectors"), focus: "function HowItWorks", label: "this section" },
  ] },
}
