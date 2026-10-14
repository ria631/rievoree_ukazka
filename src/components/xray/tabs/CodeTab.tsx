import { useEffect, useState } from "react"
import { useRouterState } from "@tanstack/react-router"
import { ArrowUpRight, Code2, Database, FileCode2, Maximize2, MousePointerClick } from "lucide-react"
import { useXrayPanel } from "@/components/xray/XrayPanelContext"
import { CODE_MAP, type CodeTarget } from "@/components/xray/codeMap"
import { ROUTE_FILE } from "@/components/xray/sources"

/**
 * CODE — a map of THIS page's code, not a cramped editor. Every chart, table and
 * control currently on the page is listed with the real files behind it (where
 * it's drawn, the component, the math / SQL). Clicking one opens the
 * full-screen IDE on exactly those blocks, highlighted. Reading code belongs in
 * the full-screen editor; a 500px side panel is for finding it.
 */
interface Item { id: string; target: CodeTarget }

function scanPage(): Item[] {
  const seen = new Set<string>()
  const out: Item[] = []
  document.querySelectorAll<HTMLElement>("[data-tour]").forEach((el) => {
    const id = el.dataset.tour ?? ""
    const target = CODE_MAP[id]
    if (!target || seen.has(id)) return
    if (el.closest('header, [data-slot="sheet-content"]')) return // page content only
    seen.add(id)
    out.push({ id, target })
  })
  return out
}

export function CodeTab() {
  const { openCode, setInspecting, setOpen } = useXrayPanel()
  const path = useRouterState({ select: (s) => s.location.pathname })
  const file = ROUTE_FILE[path]
  const [items, setItems] = useState<Item[]>([])

  // The page renders its charts asynchronously — rescan until it settles.
  useEffect(() => {
    let last = ""
    const scan = () => {
      const next = scanPage()
      const key = next.map((i) => i.id).join("|")
      if (key !== last) { last = key; setItems(next) }
    }
    scan()
    const t = window.setInterval(scan, 1200)
    return () => window.clearInterval(t)
  }, [path])

  if (!file) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center">
        <p className="font-mono text-xs leading-relaxed text-muted-foreground">
          Open a product page (Dashboard, P&amp;L, Rent roll, Journal…) and this tab maps
          every chart and table on it to the real code behind it.
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* The page's own file */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#1e1e1e] ring-1 ring-white/10">
          <Code2 className="size-4 text-accent" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-xs text-foreground">{file.split("/").pop()}</p>
          <p className="truncate font-mono text-[10px] text-muted-foreground">{file}</p>
        </div>
        <button data-tour="code-fullscreen" onClick={() => openCode({ kind: "page" })}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-accent-foreground transition hover:brightness-110">
          <Maximize2 className="size-3.5" /> Open in editor
        </button>
      </div>

      <p className="px-4 pt-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
        Everything on this page, and the real files behind it. Click one — the
        full-screen editor opens with its exact lines highlighted.
      </p>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-4 py-3">
        {items.length === 0 && (
          <p className="font-mono text-[11px] text-muted-foreground/70">reading the page…</p>
        )}
        {items.map(({ id, target }) => (
          <button key={id} onClick={() => openCode({ kind: "target", target })}
            className="group w-full rounded-xl px-3 py-2.5 text-left ring-1 ring-border transition hover:bg-white/[0.03] hover:ring-accent/60">
            <span className="flex items-center justify-between gap-2">
              <span className="text-[13px] text-foreground">{target.title}</span>
              <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground transition group-hover:text-accent" />
            </span>
            <span className="mt-1.5 flex flex-wrap gap-1">
              {target.refs.map((r, k) => {
                const sql = r.file.endsWith(".sql")
                const Icon = sql ? Database : FileCode2
                return (
                  <span key={k} className="inline-flex items-center gap-1 rounded-md bg-[#1e1e1e] px-1.5 py-0.5 font-mono text-[10px] text-white/75 ring-1 ring-white/10">
                    <Icon className={sql ? "size-3 text-[#4fc1ff]" : "size-3 text-[#519aba]"} />
                    {r.file.split("/").pop()}
                    <span className="text-white/35">· {r.label}</span>
                  </span>
                )
              })}
            </span>
          </button>
        ))}
      </div>

      <div className="border-t border-border px-4 py-3">
        <button onClick={() => { setOpen(false); setInspecting(true) }}
          className="inline-flex items-center gap-2 font-mono text-[11px] text-muted-foreground transition hover:text-accent">
          <MousePointerClick className="size-3.5" /> Or point at it: X-ray code → click any chart on the page
        </button>
      </div>
    </div>
  )
}
