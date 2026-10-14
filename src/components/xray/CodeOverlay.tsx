import { useEffect, useMemo, useRef, useState } from "react"
import { useRouterState } from "@tanstack/react-router"
import { AnimatePresence, motion } from "motion/react"
import { X, Code2, FileCode2, Folder, Database, Crosshair } from "lucide-react"
import { cn } from "@/lib/utils"
import { highlightCode } from "@/lib/code-xray"
import { useXrayPanel } from "./XrayPanelContext"
import { SOURCES, ROUTE_FILE, langOf, explorerTree } from "./sources"

/**
 * Full-screen code view — a VS Code (Dark+) window over the whole viewport.
 * Opens on (a) this page's source, (b) ONE element's code — the place it's drawn,
 * the component that renders it and the math/SQL behind its numbers, as tabs,
 * each scrolled to and highlighting the exact block — or (c) any file from the
 * Explorer. Every line is the literal repo file (`?raw`), never a re-typing.
 */
interface Tab { file: string; focus?: string; label?: string }

const LANG_LABEL = { tsx: "TypeScript JSX", typescript: "TypeScript", sql: "PostgreSQL", css: "CSS" } as const

/** The block that starts at the needle: a JSX element up to its closing tag, a
 *  function up to its closing brace, or a SQL statement up to its `;`. */
export function findBlock(lines: string[], needle: string): [number, number] | null {
  let start = lines.findIndex((l) => l.includes(needle))
  if (start < 0) return null
  const ind = (s: string) => s.length - s.trimStart().length
  // Needle is an attribute line inside a multi-line opening tag → climb to the tag.
  if (/^\s*[\w-]+=/.test(lines[start])) {
    for (let j = start - 1; j >= Math.max(0, start - 12); j--) {
      if (lines[j].trimStart().startsWith("<") && ind(lines[j]) < ind(lines[start])) { start = j; break }
    }
  }
  const isSql = /^\s*(create|perform|select|insert|update|alter|grant|revoke|do\b)/i.test(lines[start]) ||
    /\bas \w+$/.test(lines[start].trim())
  if (isSql) {
    let inDollar = false
    for (let j = start; j < Math.min(lines.length, start + 90); j++) {
      const n = (lines[j].match(/\$\$/g) ?? []).length
      if (n % 2 === 1) inDollar = !inDollar
      if (!inDollar && /;\s*(--.*)?$/.test(lines[j])) return [start, j]
    }
    return [start, Math.min(lines.length - 1, start + 24)]
  }
  const I = ind(lines[start])
  let end = start
  for (let j = start + 1; j < Math.min(lines.length, start + 90); j++) {
    const l = lines[j]
    if (!l.trim()) continue
    const k = ind(l)
    if (k < I) break
    if (k === I) {
      if (/^\s*(<\/|\)|\}|\]|\/>)/.test(l)) end = j
      break
    }
    end = j
  }
  return [start, end]
}

export function CodeOverlay() {
  const { code, closeCode } = useXrayPanel()
  const path = useRouterState({ select: (s) => s.location.pathname })

  // Tabs for whatever was asked to open.
  const initialTabs = useMemo<Tab[]>(() => {
    if (!code) return []
    if (code.kind === "target") return code.target.refs.map((r) => ({ file: r.file, focus: r.focus, label: r.label }))
    if (code.kind === "file") return [{ file: code.file }]
    const f = ROUTE_FILE[path]
    return f ? [{ file: f, label: "this page" }] : []
  }, [code, path])

  const [tabs, setTabs] = useState<Tab[]>([])
  const [active, setActive] = useState(0)
  useEffect(() => { setTabs(initialTabs); setActive(0) }, [initialTabs])

  const tab = tabs[active]
  const [raw, setRaw] = useState<string | null>(null)
  const [html, setHtml] = useState<string | null>(null)
  const [range, setRange] = useState<[number, number] | null>(null)
  const codeRef = useRef<HTMLDivElement>(null)

  // Load + highlight the active tab's file.
  useEffect(() => {
    if (!tab) return
    const load = SOURCES[tab.file]
    if (!load) return
    let alive = true
    setRaw(null); setHtml(null); setRange(null)
    load().then(async (m) => {
      if (!alive) return
      const src = m.default
      setRaw(src)
      setRange(tab.focus ? findBlock(src.split("\n"), tab.focus) : null)
      try {
        const out = await highlightCode(src, langOf(tab.file))
        if (alive) setHtml(out)
      } catch { /* fall back to plain text */ }
    }).catch(() => {})
    return () => { alive = false }
  }, [tab])

  // Mark the focused lines and bring them to the middle of the editor.
  useEffect(() => {
    const root = codeRef.current
    if (!root || html == null) return
    const lines = root.querySelectorAll<HTMLElement>(".line")
    lines.forEach((l) => l.classList.remove("xray-hl", "xray-hl-first", "xray-hl-last"))
    if (!range) { root.scrollTop = 0; return }
    const [a, b] = range
    for (let i = a; i <= b && i < lines.length; i++) lines[i].classList.add("xray-hl")
    lines[a]?.classList.add("xray-hl-first")
    lines[Math.min(b, lines.length - 1)]?.classList.add("xray-hl-last")
    requestAnimationFrame(() => lines[a]?.scrollIntoView({ block: "center" }))
  }, [html, range])

  // Esc closes.
  useEffect(() => {
    if (!code) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeCode() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [code, closeCode])

  function openFromExplorer(file: string) {
    const at = tabs.findIndex((t) => t.file === file && !t.focus)
    if (at >= 0) { setActive(at); return }
    setTabs((cur) => [...cur, { file }])
    setActive(tabs.length)
  }
  function closeTab(i: number) {
    if (tabs.length === 1) { closeCode(); return }
    setTabs((cur) => cur.filter((_, k) => k !== i))
    setActive((a) => (a > i ? a - 1 : a === i ? Math.max(0, i - 1) : a))
  }

  const file = tab?.file ?? ""
  const name = file.split("/").pop() ?? ""
  const dir = file.split("/").slice(0, -1)
  const title = code?.kind === "target" ? code.target.title : null
  const tree = useMemo(() => explorerTree(), [])

  return (
    <AnimatePresence>
      {code && tab && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          className="fixed inset-0 z-[70] flex flex-col bg-[#1e1e1e] font-mono text-[#d4d4d4]">
          {/* Title bar */}
          <div className="flex h-9 shrink-0 items-center bg-[#323233] px-3 text-[12px] text-white/55">
            <div className="flex gap-2">
              <button onClick={closeCode} aria-label="Close" className="size-3 rounded-full bg-[#ff5f57]" />
              <span className="size-3 rounded-full bg-[#febc2e]" />
              <span className="size-3 rounded-full bg-[#28c840]" />
            </div>
            <span className="mx-auto truncate">{name} — xray-reporting-engine</span>
            <button onClick={closeCode} aria-label="Close code view"
              className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-[11px] text-white/70 transition hover:bg-white/10 hover:text-white">
              Close <kbd className="rounded bg-white/10 px-1 text-[10px]">Esc</kbd> <X className="size-3.5" />
            </button>
          </div>

          <div className="flex min-h-0 flex-1">
            {/* Explorer */}
            <aside className="hidden w-64 shrink-0 flex-col overflow-y-auto bg-[#252526] py-2 text-[12px] md:flex">
              <p className="px-4 pb-2 text-[10px] uppercase tracking-widest text-white/40">Explorer</p>
              {tree.map((g) => (
                <div key={g.folder} className="mb-1">
                  <div className="flex items-center gap-1.5 px-3 py-0.5 text-white/45">
                    <Folder className="size-3.5" /> <span className="truncate">{g.folder}</span>
                  </div>
                  {g.files.map((f) => {
                    const on = f === file
                    const Icon = f.endsWith(".sql") ? Database : FileCode2
                    return (
                      <button key={f} onClick={() => openFromExplorer(f)}
                        className={cn("flex w-full items-center gap-1.5 py-0.5 pl-8 pr-3 text-left transition",
                          on ? "bg-[#37373d] text-white" : "text-white/65 hover:bg-white/5 hover:text-white")}>
                        <Icon className={cn("size-3.5 shrink-0", f.endsWith(".sql") ? "text-[#4fc1ff]" : "text-[#519aba]")} />
                        <span className="truncate">{f.split("/").pop()}</span>
                      </button>
                    )
                  })}
                </div>
              ))}
            </aside>

            <div className="flex min-w-0 flex-1 flex-col">
              {/* Tabs — one per related file */}
              <div className="flex shrink-0 items-stretch overflow-x-auto bg-[#252526] text-[12px]">
                {tabs.map((t, i) => {
                  const on = i === active
                  return (
                    <div key={`${t.file}-${t.focus ?? ""}-${i}`}
                      className={cn("group flex shrink-0 items-center gap-2 border-r border-black/30 pl-3 pr-2",
                        on ? "bg-[#1e1e1e] text-white shadow-[inset_0_1px_0_#A3E635]" : "text-white/55 hover:text-white/85")}>
                      <button onClick={() => setActive(i)} className="flex items-center gap-2 py-2">
                        <Code2 className={cn("size-3.5", on ? "text-accent" : "text-white/40")} />
                        <span>{t.file.split("/").pop()}</span>
                        {t.label && <span className="text-[10px] text-white/40">· {t.label}</span>}
                      </button>
                      <button onClick={() => closeTab(i)} aria-label="Close tab"
                        className="rounded p-0.5 text-white/30 opacity-0 transition group-hover:opacity-100 hover:bg-white/10 hover:text-white">
                        <X className="size-3" />
                      </button>
                    </div>
                  )
                })}
              </div>

              {/* Breadcrumb + what's highlighted */}
              <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-black/40 px-4 py-1.5 text-[11px]">
                <span className="text-white/35">{[...dir, name].join("  ›  ")}</span>
                {range && (
                  <span className="inline-flex items-center gap-1.5 rounded bg-[#A3E635]/12 px-2 py-0.5 text-[#c6f36b]">
                    <Crosshair className="size-3" />
                    {title ? `${title} — ${tab.label ?? "here"}` : "highlighted"} · lines {range[0] + 1}–{range[1] + 1}
                  </span>
                )}
              </div>

              {/* Code */}
              <div ref={codeRef} className="code-shiki min-h-0 flex-1 overflow-auto">
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
            {title && <span className="hidden sm:inline">◎ {title}</span>}
            <span className="ml-auto">{LANG_LABEL[langOf(file)]}</span>
            <span>UTF-8</span>
            <span className="hidden md:inline">real repo source · Esc to close</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
