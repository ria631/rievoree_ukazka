import { useEffect, useState } from "react"
import { useRouterState } from "@tanstack/react-router"
import { AnimatePresence, motion } from "motion/react"
import { X, Code2 } from "lucide-react"
import { highlightCode } from "@/lib/code-xray"
import { useXrayPanel } from "./XrayPanelContext"
import { PAGE_SOURCES } from "./pageSources"

/**
 * Full-screen code reveal — the current page's REAL source shown as a VS Code
 * (Dark+) editor across the whole viewport, like the landing's X-ray editor.
 * Opened from the Code tab's "Full screen" button. Mounted once in AppShell.
 */
export function CodeOverlay() {
  const { codeFullscreen, setCodeFullscreen } = useXrayPanel()
  const path = useRouterState({ select: (s) => s.location.pathname })
  const entry = PAGE_SOURCES[path]
  const [raw, setRaw] = useState<string | null>(null)
  const [html, setHtml] = useState<string | null>(null)

  useEffect(() => {
    if (!codeFullscreen || !entry) return
    let alive = true
    setRaw(null); setHtml(null)
    entry.load().then((m) => { if (alive) setRaw(m.default) }).catch(() => {})
    return () => { alive = false }
  }, [codeFullscreen, entry])

  useEffect(() => {
    if (raw == null) return
    let alive = true
    highlightCode(raw, "tsx").then((out) => { if (alive) setHtml(out) }).catch(() => {})
    return () => { alive = false }
  }, [raw])

  // Esc closes.
  useEffect(() => {
    if (!codeFullscreen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setCodeFullscreen(false) }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [codeFullscreen, setCodeFullscreen])

  const file = entry?.file ?? ""
  const dir = file.split("/").slice(0, -1).join("/")
  const name = file.split("/").pop()

  return (
    <AnimatePresence>
      {codeFullscreen && entry && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] flex flex-col bg-[#1e1e1e] font-mono text-[#d4d4d4]">
          {/* Title bar */}
          <div className="flex h-9 shrink-0 items-center bg-[#323233] px-3 text-[12px] text-white/55">
            <div className="flex gap-2">
              <span className="size-3 rounded-full bg-white/20" />
              <span className="size-3 rounded-full bg-white/20" />
              <span className="size-3 rounded-full bg-white/20" />
            </div>
            <span className="mx-auto truncate">{dir}/{name} — xray-reporting-engine</span>
            <button onClick={() => setCodeFullscreen(false)} aria-label="Close code view"
              className="rounded p-1 text-white/60 transition hover:bg-white/10 hover:text-white">
              <X className="size-4" />
            </button>
          </div>

          <div className="flex min-h-0 flex-1">
            {/* Tab strip */}
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex shrink-0 items-center bg-[#252526] text-[12px]">
                <span className="flex items-center gap-2 border-r border-black/30 bg-[#1e1e1e] px-4 py-2 text-white">
                  <Code2 className="size-3.5 text-accent" /> {name}
                </span>
                <span className="ml-auto px-4 text-[10px] uppercase tracking-widest text-accent">real source · ?raw @ build</span>
              </div>
              <div className="shrink-0 border-b border-black/40 px-4 py-1 text-[11px] text-white/35">
                {dir.split("/").join("  ›  ")}  ›  {name}
              </div>
              <div className="code-shiki min-h-0 flex-1 overflow-auto">
                {html != null ? (
                  // Safe: Shiki's escaped output of our OWN build-time source (?raw).
                  <div dangerouslySetInnerHTML={{ __html: html }} />
                ) : (
                  <pre className="px-6 py-6 text-[13px] leading-[1.7] text-white/70">{raw ?? "loading source…"}</pre>
                )}
              </div>
            </div>
          </div>

          {/* Status bar */}
          <div className="flex h-6 shrink-0 items-center gap-4 bg-accent px-3 text-[11px] font-medium text-accent-foreground">
            <span>⎇ main</span>
            <span className="ml-auto">TypeScript JSX</span>
            <span>UTF-8</span>
            <span className="hidden sm:inline">the real component rendering this page · press Esc to close</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
