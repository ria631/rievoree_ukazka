import { useEffect, useMemo, useState } from "react"
import { useRouterState } from "@tanstack/react-router"
import { Code2 } from "lucide-react"

/**
 * CODE — the real FRONTEND source of the page you're on, not just the backend.
 *
 * Honesty invariant (same as the SQL tab): every line here is the LITERAL repo
 * file, pulled in via Vite `?raw`. It's loaded ON DEMAND (dynamic import) so the
 * source strings never weigh down the initial bundle. This is the client half of
 * "the machinery, made visible": the component that rendered what you're looking
 * at, readable in place.
 */

// path → { file label, dynamic ?raw loader }. Literal import specifiers so Vite
// can code-split each one. Only the current page's source is ever fetched.
const SOURCES: Record<string, { file: string; load: () => Promise<{ default: string }> }> = {
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

export function CodeTab() {
  const path = useRouterState({ select: (s) => s.location.pathname })
  const entry = SOURCES[path]
  const [src, setSrc] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!entry) { setSrc(null); return }
    let alive = true
    setLoading(true)
    entry.load()
      .then((m) => { if (alive) setSrc(m.default) })
      .catch(() => { if (alive) setSrc(null) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [entry])

  const lines = useMemo(() => (src ? src.replace(/\s+$/, "").split("\n") : []), [src])

  if (!entry) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center">
        <p className="font-mono text-xs leading-relaxed text-muted-foreground">
          Open a product page (Dashboard, Reports, P&amp;L, Pivot…) and this tab
          shows its real source — the component that rendered it.
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <Code2 className="size-3.5 text-accent" />
        <span className="font-mono text-[11px] text-foreground">{entry.file}</span>
        <span className="ml-auto font-mono text-[9px] uppercase tracking-widest text-accent">real source · ?raw</span>
      </div>
      <p className="border-b border-border px-4 py-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
        The actual component rendering this page — not a screenshot, not a
        paraphrase. Pulled from the repo at build time.
      </p>

      {loading ? (
        <p className="px-4 py-3 font-mono text-xs text-muted-foreground">loading source…</p>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <pre className="w-max min-w-full px-0 py-2 font-mono text-[11px] leading-relaxed">
            {lines.map((line, i) => (
              <div key={i} className="flex">
                <span className="sticky left-0 w-10 shrink-0 select-none bg-background pr-3 text-right text-muted-foreground/50">
                  {i + 1}
                </span>
                <code className="whitespace-pre pr-4 text-foreground/90">{line || " "}</code>
              </div>
            ))}
          </pre>
        </div>
      )}
    </div>
  )
}
