import { useEffect, useState } from "react"
import { useRouterState } from "@tanstack/react-router"
import { Code2, Maximize2 } from "lucide-react"
import { highlightCode } from "@/lib/code-xray"
import { useXrayPanel } from "@/components/xray/XrayPanelContext"
import { PAGE_SOURCES } from "@/components/xray/pageSources"

/**
 * CODE — the real FRONTEND source of the page you're on, shown as a proper
 * VS Code (Dark+) editor, just like the landing's X-ray editor: Shiki syntax
 * highlighting + gutter line numbers, not a plain dump.
 *
 * Honesty invariant (same as the SQL tab): every line is the LITERAL repo file,
 * pulled in via Vite `?raw` ON DEMAND (dynamic import) so the source strings
 * never weigh down the initial bundle. This is the client half of "the
 * machinery, made visible".
 */
export function CodeTab() {
  const { openCode } = useXrayPanel()
  const path = useRouterState({ select: (s) => s.location.pathname })
  const entry = PAGE_SOURCES[path]
  const [raw, setRaw] = useState<string | null>(null)
  const [html, setHtml] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Load the real source for this route (on demand).
  useEffect(() => {
    if (!entry) { setRaw(null); setHtml(null); return }
    let alive = true
    setLoading(true); setHtml(null)
    entry.load()
      .then((m) => { if (alive) setRaw(m.default) })
      .catch(() => { if (alive) setRaw(null) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [entry])

  // Syntax-highlight it (Shiki Dark+), same engine as the landing editor.
  useEffect(() => {
    if (raw == null) { setHtml(null); return }
    let alive = true
    highlightCode(raw, "tsx")
      .then((out) => { if (alive) setHtml(out) })
      .catch(() => { if (alive) setHtml(null) })
    return () => { alive = false }
  }, [raw])

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

  const dir = entry.file.split("/").slice(0, -1).join("/")
  const name = entry.file.split("/").pop()

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#1e1e1e] font-mono text-[#d4d4d4]">
      {/* Tab strip — one open file */}
      <div className="flex shrink-0 items-center bg-[#252526] text-[12px]">
        <span className="flex items-center gap-2 border-r border-black/30 bg-[#1e1e1e] px-4 py-2 text-white">
          <Code2 className="size-3.5 text-accent" /> {name}
        </span>
        <button data-tour="code-fullscreen" onClick={() => openCode({ kind: "page" })}
          className="ml-auto inline-flex items-center gap-1.5 px-4 py-2 text-[10px] uppercase tracking-widest text-accent transition hover:text-white">
          <Maximize2 className="size-3.5" /> Full screen
        </button>
      </div>
      {/* Breadcrumb */}
      <div className="shrink-0 border-b border-black/40 px-4 py-1 text-[11px] text-white/35">
        {dir.split("/").join("  ›  ")}  ›  {name}
      </div>

      {/* Code */}
      <div className="code-shiki min-h-0 flex-1 overflow-auto">
        {loading && <pre className="px-4 py-4 text-[12.5px] text-white/50">loading source…</pre>}
        {!loading && html != null && (
          // Safe: Shiki's escaped output of our OWN build-time source (?raw).
          <div dangerouslySetInnerHTML={{ __html: html }} />
        )}
        {!loading && html == null && raw != null && (
          <pre className="px-4 py-4 text-[12.5px] leading-[1.65] text-white/70">{raw}</pre>
        )}
      </div>

      {/* Status bar — matches the landing editor */}
      <div className="flex h-6 shrink-0 items-center gap-4 bg-accent px-3 text-[11px] font-medium text-accent-foreground">
        <span>⎇ main</span>
        <span className="ml-auto">TypeScript JSX</span>
        <span>UTF-8</span>
        <span className="hidden sm:inline">the component rendering this page</span>
      </div>
    </div>
  )
}
