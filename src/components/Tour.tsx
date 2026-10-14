import { useEffect, useRef, useState } from "react"
import { useNavigate, useRouterState } from "@tanstack/react-router"
import { AnimatePresence, motion } from "motion/react"
import {
  ScanLine, X, Wand2, MousePointerClick, Code2, List, Play, Pause, RotateCcw, Database, Check, Radio,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/auth/useAuth"
import { tourControl } from "@/lib/tourBus"
import { useXrayPanel } from "@/components/xray/XrayPanelContext"
import { CODE_MAP } from "@/components/xray/codeMap"
import { CodeXrayButton } from "@/components/xray/CodeInspect"
import { Spotlight, type Rect } from "@/components/Spotlight"
import { STEPS, CHAPTERS, type Side, type Chapter } from "@/components/tour/steps"
import { AskFeedback } from "@/components/tour/slots"

/**
 * Guided tour — the part that SELLS the project. It drives the real app: for
 * every chart, table and control it spotlights that one element, anchors its
 * card right next to it (never on top of it), and an animated cursor clicks the
 * real controls so the visitor watches the app respond. Each step says what the
 * element shows, how to read it, what it means for the money, and how its data
 * is pulled and protected — with a button that opens the element's real code.
 * The script lives in tour/steps.tsx; this file is the engine.
 */
const SEEN_KEY = "xray-tour-choice"
const DEMO_PASSWORD = "demo123456"
const MANAGER = "manager@demo.local"
const HEADER = 64
const GAP = 18
const MARGIN = 14
const PAD = 10 // spotlight padding around the target
const DOCK_H = 232 // height of the bottom-docked card

const sel = (id: string) => `[data-tour="${id}"]`
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function shown(el: Element | null): el is HTMLElement {
  if (!el) return false
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0
}

async function waitFor(selector: string, timeout: number, alive: () => boolean) {
  const t0 = performance.now()
  while (alive() && performance.now() - t0 < timeout) {
    const el = document.querySelector(selector)
    if (shown(el)) return el
    await sleep(100)
  }
  return null
}

/** Scroll so the target AND its card fit on screen together. */
function scrollForCard(el: HTMLElement, cw: number) {
  if (el.closest('[data-slot="sheet-content"], header')) { el.scrollIntoView({ block: "nearest" }); return }
  const r = el.getBoundingClientRect()
  const vw = window.innerWidth, vh = window.innerHeight
  const top0 = HEADER + 20
  const sideFits = r.right + PAD + GAP + cw <= vw - MARGIN || r.left - PAD - GAP - cw >= MARGIN
  // Side room → centre it; otherwise pin it under the header so the card (or the
  // bottom dock) fits beneath. The tour adds space below the page so even the
  // last element on a page can be lifted this high.
  const want = sideFits && r.height < vh - top0 - 24 ? top0 + (vh - top0 - r.height) / 2 - 20 : top0
  const delta = r.top - want
  if (Math.abs(delta) > 6) window.scrollTo({ top: window.scrollY + delta, behavior: "smooth" })
}

interface Placement { left: number; top: number; side: Side | "none" | "dock" }

function place(r: Rect | null, cw: number, ch: number, prefer: Side[] = []): Placement {
  const vw = window.innerWidth, vh = window.innerHeight
  if (!r) return { left: Math.max(MARGIN, (vw - cw) / 2), top: Math.max(HEADER + 24, (vh - ch) / 2), side: "none" }
  const R = { top: r.top - PAD, left: r.left - PAD, right: r.left + r.width + PAD, bottom: r.top + r.height + PAD }
  const clampY = (t: number) => Math.min(Math.max(t, HEADER + 8), vh - ch - MARGIN)
  const clampX = (l: number) => Math.min(Math.max(l, MARGIN), vw - cw - MARGIN)
  const opts: Record<Side, () => Placement | null> = {
    right: () => (R.right + GAP + cw <= vw - MARGIN ? { left: R.right + GAP, top: clampY(R.top), side: "right" } : null),
    left: () => (R.left - GAP - cw >= MARGIN ? { left: R.left - GAP - cw, top: clampY(R.top), side: "left" } : null),
    bottom: () => (R.bottom + GAP + ch <= vh - MARGIN ? { left: clampX(R.left), top: R.bottom + GAP, side: "bottom" } : null),
    top: () => (R.top - GAP - ch >= HEADER + 4 ? { left: clampX(R.left), top: R.top - GAP - ch, side: "top" } : null),
  }
  for (const s of [...prefer, "right", "left", "bottom", "top"] as Side[]) {
    const p = opts[s]()
    if (p) return p
  }
  // No clean side (a wide AND tall target on a smaller screen): the card becomes
  // a low strip docked to the bottom edge, and the page is scrolled so the target
  // sits above it — the card never lands on top of what it's explaining.
  return { left: MARGIN, top: vh - DOCK_H - MARGIN, side: "dock" }
}

interface Cursor { x: number; y: number; on: boolean; instant: boolean; click: number }

export function Tour({ autoOffer }: { autoOffer?: boolean }) {
  const navigate = useNavigate()
  const path = useRouterState({ select: (s) => s.location.pathname })
  const { session, role } = useAuth()
  const { openTo, setOpen, openCode, closeCode, code, setInspecting } = useXrayPanel()

  const [running, setRunning] = useState(false)
  const [i, setI] = useState(0)
  const [replay, setReplay] = useState(0)
  const [choice, setChoice] = useState<"pending" | "made">("made")
  const [phase, setPhase] = useState<"entering" | "acting" | "idle">("idle")
  const [caption, setCaption] = useState<string | null>(null)
  const [targetSel, setTargetSel] = useState<string | null>(null)
  const [rect, setRect] = useState<Rect | null>(null)
  const [cursor, setCursor] = useState<Cursor>({ x: 0, y: 0, on: false, instant: true, click: 0 })
  const [live, setLive] = useState<string[]>([])
  const [auto, setAuto] = useState(false)
  const [hovering, setHovering] = useState(false)
  const [menu, setMenu] = useState(false)
  const [size, setSize] = useState({ w: 384, h: 380 })

  const email = session?.user.email ?? ""
  const isDemo = email.toLowerCase().endsWith("@demo.local")
  const step = STEPS[i]

  // Refs the async step runner reads (it outlives renders).
  const runId = useRef(0)
  const live$ = useRef({ path, email, role, isDemo, running, size })
  live$.current = { path, email, role, isDemo, running, size }
  const cardRef = useRef<HTMLDivElement>(null)
  const cursorRef = useRef(cursor)
  cursorRef.current = cursor
  const lastPos = useRef<Placement | null>(null)
  const dockedRef = useRef(false)

  // First visit: offer the choice (guided vs self). Remembered per browser.
  useEffect(() => {
    if (!autoOffer) return
    try { if (localStorage.getItem(SEEN_KEY) !== "1") setChoice("pending") } catch { /* private mode */ }
  }, [autoOffer])
  function remember() { try { localStorage.setItem(SEEN_KEY, "1") } catch { /* ignore */ } }

  // While touring: room below the page (so any element can be scrolled up to sit
  // above the card) and no browser scroll-anchoring (a table that grows after a
  // re-pivot must not drag the page away from the element being explained).
  useEffect(() => {
    if (!running) return
    const html = document.documentElement, body = document.body
    const prev = [html.style.overflowAnchor, body.style.paddingBottom]
    html.style.overflowAnchor = "none"
    body.style.paddingBottom = "75vh"
    return () => { html.style.overflowAnchor = prev[0]; body.style.paddingBottom = prev[1] }
  }, [running])

  // Card size → placement.
  useEffect(() => {
    const el = cardRef.current
    if (!el) return
    // Only the floating card's size drives placement — never the docked strip's,
    // or the two layouts would flip back and forth.
    const ro = new ResizeObserver(() => { if (!dockedRef.current) setSize({ w: el.offsetWidth, h: el.offsetHeight }) })
    ro.observe(el)
    return () => ro.disconnect()
  }, [running])

  async function moveCursorTo(el: Element) {
    const r = el.getBoundingClientRect()
    const vw = window.innerWidth, vh = window.innerHeight
    const x = Math.min(vw - 30, Math.max(10, r.left + Math.min(r.width / 2, 160)))
    const y = Math.min(vh - 30, Math.max(70, r.top + Math.min(r.height / 2, 40)))
    if (!cursorRef.current.on) {
      // Reach out from the card.
      const c = cardRef.current?.getBoundingClientRect()
      setCursor((p) => ({ ...p, x: c ? c.left + c.width - 40 : vw / 2, y: c ? c.top + 30 : vh / 2, on: true, instant: true }))
      await sleep(60)
    }
    setCursor((p) => ({ ...p, x, y, instant: false }))
    await sleep(760)
  }

  // ── The step runner: identity → route → X-ray → find target → scroll → act.
  useEffect(() => {
    if (!running) return
    const s = STEPS[i]
    const id = ++runId.current
    const alive = () => runId.current === id && live$.current.running
    setPhase("entering"); setCaption(null); setLive([]); setMenu(false)
    setCursor((p) => ({ ...p, on: false }))
    ;(async () => {
      closeCode()
      if (s.as === "manager" && live$.current.isDemo && live$.current.email !== MANAGER) {
        setCaption("Signing you in as the Manager demo…")
        await supabase.auth.signInWithPassword({ email: MANAGER, password: DEMO_PASSWORD })
        const t0 = performance.now()
        while (alive() && live$.current.role !== "manager" && performance.now() - t0 < 5000) await sleep(100)
        setCaption(null)
      }
      if (!alive()) return
      if (s.route && live$.current.path !== s.route) { navigate({ to: s.route }); await sleep(250) }
      if (!alive()) return
      if (s.xray === "keep") { /* leave the panel as is */ }
      else if (s.xray) openTo(s.xray)
      else setOpen(false)

      setTargetSel(null)
      if (s.target) {
        const el = await waitFor(sel(s.target), 8000, alive)
        if (!alive()) return
        if (el) {
          if (s.xray) await sleep(380) // let the drawer finish sliding in
          scrollForCard(el, live$.current.size.w)
          setTargetSel(sel(s.target))
          await sleep(650)
        }
      }
      if (!alive()) return

      if (s.actions?.length) {
        setPhase("acting")
        for (const a of s.actions) {
          if (!alive()) return
          if (a.demoOnly && !live$.current.isDemo) continue
          const t = await waitFor(sel(a.to), 4500, alive)
          if (!alive()) return
          if (!t || a.skipIf?.(t)) continue
          if (a.spot) setTargetSel(sel(a.spot))
          setCaption(a.say)
          await moveCursorTo(t)
          if (!alive()) return
          setCursor((p) => ({ ...p, click: p.click + 1 }))
          await sleep(170)
          if (a.control) tourControl(a.control[0], a.control[1])
          else t.click()
          await sleep(a.wait ?? 1100)
        }
        if (!alive()) return
        if (s.target) {
          setTargetSel(sel(s.target))
          const el = document.querySelector<HTMLElement>(sel(s.target))
          if (el) {
            const r = el.getBoundingClientRect()
            if (r.bottom < HEADER + 40 || r.top > window.innerHeight - 80) scrollForCard(el, live$.current.size.w)
          }
        }
        setCaption(null)
      }
      setPhase("idle")
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, i, replay])

  // Track the target every frame (drawer sliding, charts growing, scrolling).
  useEffect(() => {
    if (!running || !targetSel) { setRect(null); return }
    let raf = 0, last = ""
    const loop = () => {
      const el = document.querySelector(targetSel)
      if (shown(el)) {
        const r = el.getBoundingClientRect()
        const key = `${Math.round(r.top)}|${Math.round(r.left)}|${Math.round(r.width)}|${Math.round(r.height)}`
        if (key !== last) { last = key; setRect({ top: r.top, left: r.left, width: r.width, height: r.height }) }
      } else if (last !== "none") { last = "none"; setRect(null) }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [running, targetSel])

  // Live figures, read straight off the page (data-live), refreshed as it reacts.
  useEffect(() => {
    if (!running || !step.live) { setLive([]); return }
    const from = typeof step.live === "string" ? sel(step.live) : step.target ? sel(step.target) : null
    if (!from) return
    const read = () => {
      const root = document.querySelector(from)
      if (!root) return
      const els = [...(root.matches("[data-live]") ? [root] : []), ...root.querySelectorAll("[data-live]")]
      setLive(els.map((e) => (e as HTMLElement).dataset.live ?? "").filter(Boolean).slice(0, 6))
    }
    read()
    const t = setInterval(read, 600)
    return () => clearInterval(t)
  }, [running, i, step.live, step.target])

  // Auto-play: after a step has finished acting, give it reading time, then go on.
  const autoMs = (() => {
    const words = `${step.body} ${step.money ?? ""} ${step.tech ?? ""}`.split(/\s+/).length
    return Math.min(20000, Math.max(6500, words * 250))
  })()
  const autoWaiting = running && auto && phase === "idle" && !hovering && !code && !step.ask && !step.render
  useEffect(() => {
    if (!autoWaiting) return
    const t = setTimeout(() => next(), autoMs)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoWaiting, i, autoMs])

  function go(n: number) { setI(Math.max(0, Math.min(STEPS.length - 1, n))) }
  function next() { if (i >= STEPS.length - 1) end(); else go(i + 1) }
  function back() { if (i > 0) go(i - 1) }
  function start() {
    remember(); setChoice("made"); setInspecting(false)
    setI(0); setReplay((r) => r + 1); setRunning(true)
  }
  function chooseSelf() { remember(); setChoice("made") }
  function end() {
    runId.current++
    setRunning(false); setOpen(false); setTargetSel(null); setRect(null)
    setCursor((p) => ({ ...p, on: false })); setAuto(false)
  }

  const chapterSteps = STEPS.filter((s) => s.chapter === step.chapter)
  const inChapter = chapterSteps.findIndex((s) => s.id === step.id) + 1
  const target = step.code ? CODE_MAP[step.code] : null

  // Where the card goes: next to the target, never over it.
  const computed = place(rect, size.w, size.h, step.prefer)
  // While the next target is being found, hold the last floating position (a
  // docked strip is never held — the new step gets measured as a card first).
  const held = !rect && phase === "entering" && step.target && lastPos.current?.side !== "dock" ? lastPos.current : null
  const pos = held ?? computed
  if (rect) lastPos.current = computed
  const docked = pos.side === "dock"
  dockedRef.current = docked
  const arrow = rect && pos.side !== "none" && !docked ? arrowStyle(pos, rect, size) : null
  const dockW = typeof window === "undefined" ? 0 : Math.min(window.innerWidth - MARGIN * 2, 1120)
  const cardStyle: React.CSSProperties = docked
    ? { left: (window.innerWidth - dockW) / 2, top: window.innerHeight - DOCK_H - MARGIN, width: dockW, height: DOCK_H }
    : { left: pos.left, top: pos.top }

  return (
    <>
      {/* Launch dock: the tour + the X-RAY CODE inspector, side by side. */}
      {!running && (
        <div className="fixed bottom-5 left-5 z-50 flex flex-wrap items-center gap-2.5">
          <button onClick={start}
            className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2.5 font-mono text-xs font-bold uppercase tracking-widest text-accent-foreground shadow-soft transition hover:brightness-110">
            <ScanLine className="size-3.5" strokeWidth={2.25} /> Take the tour
          </button>
          <CodeXrayButton />
        </div>
      )}

      {/* First-visit choice — guided agent vs explore yourself */}
      <AnimatePresence>
        {choice === "pending" && !running && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, y: 20, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
              className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-soft ring-1 ring-border md:p-8">
              <span className="font-mono text-xs font-semibold uppercase tracking-widest text-accent">Welcome to the demo</span>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">How do you want to look around?</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">It's read-only — nothing you do is saved.</p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <button onClick={start}
                  className="flex flex-col items-start gap-2 rounded-xl border border-accent bg-accent/10 p-4 text-left transition hover:bg-accent/15">
                  <Wand2 className="size-5 text-accent" />
                  <span className="font-semibold">Show me everything</span>
                  <span className="text-xs leading-relaxed text-muted-foreground">
                    I point at every chart and table, click things for you, and explain how each number is made and protected.
                  </span>
                </button>
                <button onClick={chooseSelf}
                  className="flex flex-col items-start gap-2 rounded-xl border border-border p-4 text-left transition hover:border-accent/60 hover:bg-foreground/[0.03]">
                  <MousePointerClick className="size-5 text-foreground" />
                  <span className="font-semibold">I'll explore myself</span>
                  <span className="text-xs leading-relaxed text-muted-foreground">
                    Click around freely. “X-ray code” (bottom-left) opens the real code of any chart you click.
                  </span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {running && <Spotlight rect={rect} pad={PAD} />}

      {/* The agent's cursor */}
      <AnimatePresence>
        {running && cursor.on && (
          <motion.div key="cursor" className="pointer-events-none fixed left-0 top-0 z-[68]"
            initial={{ opacity: 0, x: cursor.x, y: cursor.y }}
            animate={{ opacity: 1, x: cursor.x, y: cursor.y }}
            exit={{ opacity: 0 }}
            transition={cursor.instant ? { duration: 0 } : { x: { duration: 0.72, ease: [0.22, 1, 0.36, 1] }, y: { duration: 0.72, ease: [0.22, 1, 0.36, 1] }, opacity: { duration: 0.2 } }}>
            <AnimatePresence>
              {cursor.click > 0 && (
                <motion.span key={cursor.click} className="absolute -left-5 -top-5 size-10 rounded-full border-2 border-accent"
                  initial={{ scale: 0.3, opacity: 0.9 }} animate={{ scale: 1.6, opacity: 0 }} transition={{ duration: 0.55 }} />
              )}
            </AnimatePresence>
            <svg width="26" height="30" viewBox="0 0 26 30" className="drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">
              <path d="M2 2 L2 24 L8 18.5 L12.5 28 L16.5 26 L12 16.8 L20 16.8 Z" fill="#fff" stroke="#0b0f0a" strokeWidth="1.6" strokeLinejoin="round" />
            </svg>
            <span className="absolute left-5 top-6 whitespace-nowrap rounded-full bg-accent px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest text-accent-foreground shadow-soft">guide</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* The step card — anchored next to the element it explains */}
      {running && (
        <div ref={cardRef} role="dialog" aria-label={`Tour: ${step.title}`} data-step={step.id} data-phase={phase}
          onMouseEnter={() => setHovering(true)} onMouseLeave={() => setHovering(false)}
          className={cn("fixed z-[60] flex flex-col rounded-2xl border border-border bg-card shadow-[0_24px_70px_-20px_rgba(0,0,0,0.9)] ring-1 ring-accent/25 transition-[left,top] duration-300 ease-out",
            docked ? "" : "max-h-[calc(100vh-96px)] w-[min(92vw,384px)]")}
          style={cardStyle}>
          {arrow && <span aria-hidden className="absolute size-3.5 rotate-45 border-border bg-card" style={arrow} />}

          {/* Header: chapter, chapter list, auto, close */}
          <div className="relative flex items-center gap-2 px-4 pt-3.5">
            <span className="font-mono text-[10px] uppercase tracking-widest text-accent">{step.chapter}</span>
            <span className="font-mono text-[10px] tabular-nums text-muted-foreground">{inChapter}/{chapterSteps.length}</span>
            <div className="ml-auto flex items-center gap-1">
              <button onClick={() => setAuto((a) => !a)} title={auto ? "Pause auto-play" : "Auto-play the tour"}
                className={cn("inline-flex items-center gap-1 rounded-full px-2 py-1 font-mono text-[9px] uppercase tracking-widest transition",
                  auto ? "bg-accent text-accent-foreground" : "text-muted-foreground ring-1 ring-border hover:text-foreground")}>
                {auto ? <Pause className="size-3" /> : <Play className="size-3" />} auto
              </button>
              <button onClick={() => setMenu((m) => !m)} aria-label="Chapters" title="Jump to a chapter"
                className={cn("rounded-full p-1.5 transition", menu ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground")}>
                <List className="size-3.5" />
              </button>
              <button onClick={end} aria-label="End tour" className="rounded-full p-1.5 text-muted-foreground hover:text-foreground"><X className="size-3.5" /></button>
            </div>
            {menu && <ChapterMenu current={step.chapter} onPick={(c) => { setMenu(false); go(STEPS.findIndex((s) => s.chapter === c)) }} />}
          </div>
          <div className="mx-4 mt-2.5 h-1 overflow-hidden rounded-full bg-border">
            <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${((i + 1) / STEPS.length) * 100}%` }} />
          </div>

          <div className={cn("min-h-0 flex-1 overflow-y-auto px-4 pb-3 pt-3", docked && "grid gap-x-8 md:grid-cols-2 md:content-start")}>
            <div>
            <h3 className="text-[17px] font-semibold leading-snug tracking-tight">{step.title}</h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{step.body}</p>

            {caption && (
              <p className="mt-3 flex items-center gap-2 rounded-lg bg-accent/10 px-3 py-2 font-mono text-[11px] text-accent">
                <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-accent" /> {caption}
              </p>
            )}

            {live.length > 0 && (
              <div className="mt-3 rounded-lg border border-border bg-background/50 px-3 py-2">
                <p className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                  <Radio className="size-3 text-accent" /> live on this page
                </p>
                <ul className="mt-1 space-y-0.5 font-mono text-[11px] tabular-nums text-foreground/90">
                  {live.map((l) => <li key={l}>{l}</li>)}
                </ul>
              </div>
            )}

            {step.chapter === "Welcome" && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {CHAPTERS.slice(1).map((c) => (
                  <button key={c} onClick={() => go(STEPS.findIndex((s) => s.chapter === c))}
                    className="rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground ring-1 ring-border transition hover:text-accent hover:ring-accent/60">
                    {c}
                  </button>
                ))}
              </div>
            )}

            </div>
            <div>
            {step.money && (
              <div className={cn("border-l-2 border-accent/60 pl-3", docked ? "mt-1" : "mt-3")}>
                <p className="font-mono text-[9px] uppercase tracking-widest text-accent">What it tells you</p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-foreground/90">{step.money}</p>
              </div>
            )}
            {step.tech && (
              <div className="mt-3 rounded-lg bg-secondary/60 px-3 py-2">
                <p className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                  <Database className="size-3" /> {step.chapter === "Welcome" ? "How to use the tour" : "Under the hood · how it's pulled & protected"}
                </p>
                <p className="mt-1 text-[12px] leading-relaxed text-foreground/80">{step.tech}</p>
              </div>
            )}

            {step.render && <div className="mt-3">{step.render()}</div>}
            {step.ask && <div className="mt-3"><AskFeedback step={step.id} question={step.ask} /></div>}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center gap-2 border-t border-border px-4 py-2.5">
            <button onClick={back} disabled={i === 0}
              className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground transition hover:text-foreground disabled:opacity-40">← Back</button>
            <div className="ml-auto flex items-center gap-1.5">
              {step.actions?.length ? (
                <button onClick={() => setReplay((r) => r + 1)} disabled={phase !== "idle"} title="Show it again"
                  className="rounded-full p-2 text-muted-foreground ring-1 ring-border transition hover:text-foreground disabled:opacity-40">
                  <RotateCcw className="size-3.5" />
                </button>
              ) : null}
              {target && (
                <button onClick={() => openCode({ kind: "target", target })}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[#0b0f0a] px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-accent ring-1 ring-accent/70 transition hover:ring-accent">
                  <Code2 className="size-3.5" /> Show the code
                </button>
              )}
              <button onClick={next}
                className="rounded-full bg-foreground px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-background transition hover:scale-[1.03]">
                {i >= STEPS.length - 1 ? "Done" : "Next →"}
              </button>
            </div>
          </div>
          {autoWaiting && (
            <div className="h-0.5 overflow-hidden rounded-b-2xl bg-transparent">
              <div key={i} className="h-full bg-accent" style={{ animation: `tour-progress ${autoMs}ms linear forwards` }} />
            </div>
          )}
        </div>
      )}
    </>
  )
}

/** A small diamond on the card edge pointing at the target. */
function arrowStyle(pos: Placement, r: Rect, size: { w: number; h: number }): React.CSSProperties {
  const midY = Math.min(Math.max(r.top + r.height / 2 - pos.top, 22), size.h - 22)
  const midX = Math.min(Math.max(r.left + r.width / 2 - pos.left, 22), size.w - 22)
  switch (pos.side) {
    case "right": return { left: -7.5, top: midY - 7, borderLeftWidth: 1, borderBottomWidth: 1 }
    case "left": return { right: -7.5, top: midY - 7, borderRightWidth: 1, borderTopWidth: 1 }
    case "bottom": return { top: -7.5, left: midX - 7, borderLeftWidth: 1, borderTopWidth: 1 }
    case "top": return { bottom: -7.5, left: midX - 7, borderRightWidth: 1, borderBottomWidth: 1 }
    default: return {}
  }
}

function ChapterMenu({ current, onPick }: { current: Chapter; onPick: (c: Chapter) => void }) {
  const at = CHAPTERS.indexOf(current)
  return (
    <div className="absolute right-3 top-10 z-10 w-56 rounded-xl bg-card p-1.5 shadow-soft ring-1 ring-border">
      <p className="px-2.5 pb-1 pt-1.5 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">Jump to</p>
      {CHAPTERS.map((c, k) => {
        const n = STEPS.filter((s) => s.chapter === c).length
        return (
          <button key={c} onClick={() => onPick(c)}
            className={cn("flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition hover:bg-secondary",
              c === current && "bg-accent/10 text-accent")}>
            <span className="grid size-4 place-items-center">
              {k < at ? <Check className="size-3 text-accent" /> : <span className={cn("size-1.5 rounded-full", c === current ? "bg-accent" : "bg-border")} />}
            </span>
            <span className="flex-1">{c}</span>
            <span className="font-mono text-[10px] text-muted-foreground">{n}</span>
          </button>
        )
      })}
    </div>
  )
}
