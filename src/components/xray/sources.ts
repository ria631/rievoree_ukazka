import type { XrayLang } from "@/lib/code-xray"

/**
 * Every real file the X-ray code view can open, keyed by its repo path and
 * loaded ON DEMAND via Vite `?raw` (each is its own tiny lazy chunk, so none of
 * it weighs on the initial bundle). Honesty invariant: what the viewer shows is
 * the literal file from this repo — pages, the chart components, the finance
 * math, the X-ray seam, and the SQL migrations / edge functions behind them.
 */
type Loader = () => Promise<{ default: string }>

export const SOURCES: Record<string, Loader> = {
  // Pages
  "src/pages/Dashboard.tsx": () => import("@/pages/Dashboard.tsx?raw"),
  "src/pages/Reports.tsx": () => import("@/pages/Reports.tsx?raw"),
  "src/pages/Pl.tsx": () => import("@/pages/Pl.tsx?raw"),
  "src/pages/Balance.tsx": () => import("@/pages/Balance.tsx?raw"),
  "src/pages/Pivot.tsx": () => import("@/pages/Pivot.tsx?raw"),
  "src/pages/Variance.tsx": () => import("@/pages/Variance.tsx?raw"),
  "src/pages/Aging.tsx": () => import("@/pages/Aging.tsx?raw"),
  "src/pages/Ingest.tsx": () => import("@/pages/Ingest.tsx?raw"),
  "src/pages/Connectors.tsx": () => import("@/pages/Connectors.tsx?raw"),
  "src/pages/Account.tsx": () => import("@/pages/Account.tsx?raw"),
  "src/pages/Users.tsx": () => import("@/pages/Users.tsx?raw"),
  // App shell + components
  "src/app/AppShell.tsx": () => import("@/app/AppShell.tsx?raw"),
  "src/components/charts/FinancialCharts.tsx": () => import("@/components/charts/FinancialCharts.tsx?raw"),
  "src/components/BatchDetail.tsx": () => import("@/components/BatchDetail.tsx?raw"),
  "src/components/DataGenerator.tsx": () => import("@/components/DataGenerator.tsx?raw"),
  "src/components/xray/tabs/RlsTab.tsx": () => import("@/components/xray/tabs/RlsTab.tsx?raw"),
  "src/components/xray/tabs/CallsTab.tsx": () => import("@/components/xray/tabs/CallsTab.tsx?raw"),
  "src/components/xray/tabs/PipelineTab.tsx": () => import("@/components/xray/tabs/PipelineTab.tsx?raw"),
  "src/components/Tour.tsx": () => import("@/components/Tour.tsx?raw"),
  // Finance math + data access
  "src/lib/data/aggregate.ts": () => import("@/lib/data/aggregate.ts?raw"),
  "src/lib/data/balance.ts": () => import("@/lib/data/balance.ts?raw"),
  "src/lib/data/pl.ts": () => import("@/lib/data/pl.ts?raw"),
  "src/lib/data/pivot.ts": () => import("@/lib/data/pivot.ts?raw"),
  "src/lib/data/variance.ts": () => import("@/lib/data/variance.ts?raw"),
  "src/lib/data/aging.ts": () => import("@/lib/data/aging.ts?raw"),
  "src/lib/data/useReport.ts": () => import("@/lib/data/useReport.ts?raw"),
  "src/lib/data/useInvoices.ts": () => import("@/lib/data/useInvoices.ts?raw"),
  "src/lib/data/parseCsv.ts": () => import("@/lib/data/parseCsv.ts?raw"),
  "src/lib/data/useBatches.ts": () => import("@/lib/data/useBatches.ts?raw"),
  "src/lib/data/useConnectors.ts": () => import("@/lib/data/useConnectors.ts?raw"),
  "src/lib/xray/instrumentedFetch.ts": () => import("@/lib/xray/instrumentedFetch.ts?raw"),
  "src/lib/xray/usePipelineEvents.ts": () => import("@/lib/xray/usePipelineEvents.ts?raw"),
  // Database (migrations) + edge functions
  "supabase/migrations/20260605000001_identity_and_tenancy.sql": () => import("../../../supabase/migrations/20260605000001_identity_and_tenancy.sql?raw"),
  "supabase/migrations/20260610000002_report_account_monthly.sql": () => import("../../../supabase/migrations/20260610000002_report_account_monthly.sql?raw"),
  "supabase/migrations/20260610000004_pipeline_events_and_refresh_queue.sql": () => import("../../../supabase/migrations/20260610000004_pipeline_events_and_refresh_queue.sql?raw"),
  "supabase/migrations/20260607000002_etl_transform.sql": () => import("../../../supabase/migrations/20260607000002_etl_transform.sql?raw"),
  "supabase/migrations/20260626000007_scoped_admin.sql": () => import("../../../supabase/migrations/20260626000007_scoped_admin.sql?raw"),
  "supabase/migrations/20260610000006_pg_cron_refresh_and_housekeeping.sql": () => import("../../../supabase/migrations/20260610000006_pg_cron_refresh_and_housekeeping.sql?raw"),
  "supabase/migrations/20260610000007_notify_review.sql": () => import("../../../supabase/migrations/20260610000007_notify_review.sql?raw"),
  "supabase/migrations/20260701000001_simulate_connector_sync.sql": () => import("../../../supabase/migrations/20260701000001_simulate_connector_sync.sql?raw"),
  "supabase/migrations/20261013000001_security_hardening_demo_lockdown.sql": () => import("../../../supabase/migrations/20261013000001_security_hardening_demo_lockdown.sql?raw"),
  "supabase/migrations/20261013000003_demo_block_ingest_writes.sql": () => import("../../../supabase/migrations/20261013000003_demo_block_ingest_writes.sql?raw"),
  "supabase/functions/connector-webhook/index.ts": () => import("../../../supabase/functions/connector-webhook/index.ts?raw"),
}

export function langOf(file: string): XrayLang {
  if (file.endsWith(".sql")) return "sql"
  if (file.endsWith(".tsx")) return "tsx"
  if (file.endsWith(".css")) return "css"
  return "typescript"
}

/** Route → the page file that renders it (the "this page" view). */
export const ROUTE_FILE: Record<string, string> = {
  "/dashboard": "src/pages/Dashboard.tsx",
  "/reports": "src/pages/Reports.tsx",
  "/pl": "src/pages/Pl.tsx",
  "/balance": "src/pages/Balance.tsx",
  "/pivot": "src/pages/Pivot.tsx",
  "/variance": "src/pages/Variance.tsx",
  "/aging": "src/pages/Aging.tsx",
  "/ingest": "src/pages/Ingest.tsx",
  "/connectors": "src/pages/Connectors.tsx",
  "/account": "src/pages/Account.tsx",
  "/users": "src/pages/Users.tsx",
}

/** Explorer grouping for the IDE sidebar. */
export function explorerTree(): { folder: string; files: string[] }[] {
  const groups = new Map<string, string[]>()
  for (const f of Object.keys(SOURCES)) {
    const folder = f.split("/").slice(0, -1).join("/")
    groups.set(folder, [...(groups.get(folder) ?? []), f])
  }
  return [...groups.entries()].map(([folder, files]) => ({ folder, files }))
}
