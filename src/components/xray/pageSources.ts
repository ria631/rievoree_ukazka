/**
 * Map of route → the real source file that renders it, loaded ON DEMAND via
 * Vite `?raw` (dynamic import, so the strings never bloat the initial bundle).
 * Shared by the Code tab (in-panel) and the full-screen code overlay.
 */
export interface PageSource {
  file: string
  load: () => Promise<{ default: string }>
}

export const PAGE_SOURCES: Record<string, PageSource> = {
  "/dashboard": { file: "src/pages/Dashboard.tsx", load: () => import("@/pages/Dashboard.tsx?raw") },
  "/reports": { file: "src/pages/Reports.tsx", load: () => import("@/pages/Reports.tsx?raw") },
  "/pl": { file: "src/pages/Pl.tsx", load: () => import("@/pages/Pl.tsx?raw") },
  "/balance": { file: "src/pages/Balance.tsx", load: () => import("@/pages/Balance.tsx?raw") },
  "/pivot": { file: "src/pages/Pivot.tsx", load: () => import("@/pages/Pivot.tsx?raw") },
  "/variance": { file: "src/pages/Variance.tsx", load: () => import("@/pages/Variance.tsx?raw") },
  "/aging": { file: "src/pages/Aging.tsx", load: () => import("@/pages/Aging.tsx?raw") },
  "/ingest": { file: "src/pages/Ingest.tsx", load: () => import("@/pages/Ingest.tsx?raw") },
  "/connectors": { file: "src/pages/Connectors.tsx", load: () => import("@/pages/Connectors.tsx?raw") },
  "/account": { file: "src/pages/Account.tsx", load: () => import("@/pages/Account.tsx?raw") },
  "/users": { file: "src/pages/Users.tsx", load: () => import("@/pages/Users.tsx?raw") },
}
