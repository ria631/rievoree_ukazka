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
import { prewarmHighlighter } from "@/lib/code-xray"
import { useXrayPanel } from "@/components/xray/XrayPanelContext"
import { CODE_MAP } from "@/components/xray/codeMap"
import { CodeXrayButton } from "@/components/xray/CodeInspect"
import { STEPS, CHAPTERS, type Chapter } from "@/components/tour/steps"
import { AskFeedback } from "@/components/tour/slots"

/**
 * Guided tour — the part that SELLS the project. It drives the real app: for
 * every chart, table and control it spotlights that one element and an
 * animated cursor clicks the real controls, so the visitor watches the app
 * respond. Each step says what the element shows, how to read it, what it means
 * for the money, and how its data is pulled and protected — with a button that
 * opens the element's real code. The script lives in tour/steps.tsx; this file
 * is the engine.
 *
 * Layout: on a desktop the card lives in a RAIL on the left and the page slides
 * right to make room, so the card never covers what it explains and never
 * jumps around; a thin connector runs from the card to the spotlighted element.
 * On a narrow screen it's a bottom sheet. Motion (spotlight, connector) is one
 * requestAnimationFrame loop writing styles directly — React renders the card's
 * content once per step.
 */
const SEEN_KEY = "xray-tour-choice"
const DEMO_PASSWORD = "demo123456"
const MANAGER = "manager@demo.local"
const HEADER = 64
const PAD = 10 // spotlight padding around the target
const RAIL_X = 14
const RAIL_W = 368
const RAIL_MIN_VW = 1100 // below this the card is a bottom sheet
const SHEET_VH = 0.44

// Pacing — unhurried, so a visitor can follow every move.
const READ_BEFORE_ACT = 1500 // let the card be read before the cursor moves
const CURSOR_MS = 1050 // cursor glide to the next control
const CLICK_BEAT = 300 // hover a moment before clicking
const ACTION_HOLD = 1.6 // × each action's own wait: time to see the result
const STEP_WATCHDOG = 30000 // no step may hold the tour longer than this

const sel = (id: string) => `[data-tour="${id}"]`
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

interface Box { x: number; y: number; w: number; h: number }

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

/** Resolve once the page has stopped scrolling (or after `max`). */
async function scrollSettled(alive: () => boolean, max = 1800) {
  let last = window.scrollY, still = 0
  const t0 = performance.now()
  while (alive() && performance.now() - t0 < max) {
    await sleep(50)
    if (Math.abs(window.scrollY - last) < 0.5) { if (++still >= 3) return } else { still = 0; last = window.scrollY }
  }
}

const inFixed = (el: HTMLElement) => !!el.closest('[data-slot="sheet-content"], header')
const railMode = () => window.innerWidth >= RAIL_MIN_VW

/** Bring the target into the free part of the screen (beside the rail, or above the sheet). */
function scrollIntoFree(el: HTMLElement) {
  if (inFixed(el)) { el.scrollIntoView({ block: "nearest", behavior: "smooth" }); return }
  const r = el.getBoundingClientRect()
  const vh = window.innerHeight
  const top0 = HEADER + 18
  const bottom = railMode() ? vh - 18 : vh * (1 - SHEET_VH) - 14
  const room = bottom - top0
  const want = r.height < room - 16 ? top0 + (room - r.height) / 2 : top0
  const delta = r.top - want
  if (Math.abs(delta) > 6) window.scrollTo({ top: window.scrollY + delta, behavior: "smooth" })
}

const lerp = (a: number, b: number, k: number) => (Math.abs(b - a) < 0.3 ? b : a + (b - a) * k)

interface Cursor { x: number; y: number; on: boolean; instant: boolean; click: number }

/** Mutable animation state, read/written by the frame loop (never React state). */
interface Stage {
  sel: string | null
  el: HTMLElement | null
  elSel: string | null
  wantDim: boolean
  hole: Box | null
  dim: number
  link: number // connector opacity
  seenAt: number // last frame the target was on screen
}
const freshStage = (): Stage => ({ sel: null, el: null, elSel: null, wantDim: false, hole: null, dim: 0, link: 0, seenAt: 0 })

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
  // The step whose text the card shows. It switches only after the old text
  // has faded out — no flash of the new step's text in the old state.
  const [readyStep, setReadyStep] = useState(-1)
  const [rail, setRail] = useState(true)
  const [caption, setCaption] = useState<string | null>(null)
  const [cursor, setCursor] = useState<Cursor>({ x: 0, y: 0, on: false, instant: true, click: 0 })
  const [live, setLive] = useState<string[]>([])
  const [auto, setAuto] = useState(false)
  const [hovering, setHovering] = useState(false)
  const [menu, setMenu] = useState(false)

  const email = session?.user.email ?? ""
  const isDemo = email.toLowerCase().endsWith("@demo.local")
  const step = STEPS[i]
  const ready = running && readyStep === i

  // Refs the async step runner and the frame loop read (they outlive renders).
  const runId = useRef(0)
  const dir = useRef(1) // travel direction, for skipping an optional step
  const live$ = useRef({ path, email, role, isDemo, running })
  live$.current = { path, email, role, isDemo, running }
  const stage = useRef<Stage>(freshStage())
  const cardRef = useRef<HTMLDivElement>(null)
  const dimRef = useRef<HTMLDivElement>(null)
  const panelRefs = useRef<(HTMLDivElement | null)[]>([])
  const ringRef = useRef<HTMLDivElement>(null)
  const linkRef = useRef<SVGPathElement>(null)
  const dotRef = useRef<SVGCircleElement>(null)
  const linkSvgRef = useRef<SVGSVGElement>(null)
  const cursorRef = useRef(cursor)
  cursorRef.current = cursor

  // First visit: offer the choice (guided vs self). Remembered per browser.
  useEffect(() => {
    if (!autoOffer) return
    try { if (localStorage.getItem(SEEN_KEY) !== "1") setChoice("pending") } catch { /* private mode */ }
  }, [autoOffer])
  function remember() { try { localStorage.setItem(SEEN_KEY, "1") } catch { /* ignore */ } }

  // While touring: the page slides right to make room for the rail (CSS on
  // html.tour-rail), gets room below it (so the last element of a page can
  // still be centred), and scroll-anchoring is off (a table that grows must not
  // drag the page away from the element being explained).
  useEffect(() => {
    if (!running) return
    const html = document.documentElement, body = document.body
    const prev = [html.style.overflowAnchor, body.style.paddingBottom]
    const apply = () => {
      const on = railMode()
      setRail(on)
      html.classList.toggle("tour-rail", on)
      html.style.setProperty("--tour-left", `${RAIL_X + RAIL_W + 26}px`)
    }
    apply()
    html.style.overflowAnchor = "none"
    body.style.paddingBottom = "55vh"
    window.addEventListener("resize", apply)
    prewarmHighlighter() // "Show the code" opens instantly
    return () => {
      window.removeEventListener("resize", apply)
      html.classList.remove("tour-rail")
      html.style.overflowAnchor = prev[0]; body.style.paddingBottom = prev[1]
    }
  }, [running])

  // ── The frame loop: spotlight, rail position, connector — eased, straight to the DOM.
  useEffect(() => {
    if (!running) return
    const st = stage.current
    let raf = 0
    let prev = performance.now()
    const frame = (t: number) => {
      const dt = Math.min(64, t - prev); prev = t
      const k = (base: number) => 1 - Math.pow(1 - base, dt / 16.7) // frame-rate independent easing
      const vw = window.innerWidth, vh = window.innerHeight

      // 1 · the target (cached; re-queried only if it changed or re-mounted)
      if (!st.sel) st.el = null
      else if (!st.el || !st.el.isConnected || st.elSel !== st.sel) { st.el = document.querySelector<HTMLElement>(st.sel); st.elSel = st.sel }
      let r: DOMRect | null = null
      if (st.el) { const b = st.el.getBoundingClientRect(); if (b.width > 0 && b.height > 0) r = b }

      // 2 · the spotlight glides to the target; it fades rather than blinking
      if (r) {
        const want = { x: r.left - PAD, y: r.top - PAD, w: r.width + PAD * 2, h: r.height + PAD * 2 }
        if (!st.hole || st.dim < 0.02) st.hole = want
        else {
          const e = k(0.2)
          st.hole = { x: lerp(st.hole.x, want.x, e), y: lerp(st.hole.y, want.y, e), w: lerp(st.hole.w, want.w, e), h: lerp(st.hole.h, want.h, e) }
        }
      }
      // Dim only around a target that is actually there: while the next one is
      // still loading (or never shows up) the old hole fades out instead of
      // lingering over an empty spot.
      if (r) st.seenAt = t
      const present = !!r || t - st.seenAt < 250
      st.dim = lerp(st.dim, st.wantDim && st.hole && present ? 1 : 0, k(0.14))
      if (st.dim < 0.01 && !st.wantDim) st.hole = null
      const dim = dimRef.current
      if (dim) {
        dim.style.opacity = st.dim.toFixed(3)
        const h = st.hole
        if (h) {
          const [top, left, right, bottom] = panelRefs.current
          if (top) Object.assign(top.style, { top: "0px", left: "0px", width: `${vw}px`, height: `${Math.max(0, h.y)}px` })
          if (left) Object.assign(left.style, { top: `${h.y}px`, left: "0px", width: `${Math.max(0, h.x)}px`, height: `${h.h}px` })
          if (right) Object.assign(right.style, { top: `${h.y}px`, left: `${h.x + h.w}px`, width: `${Math.max(0, vw - h.x - h.w)}px`, height: `${h.h}px` })
          if (bottom) Object.assign(bottom.style, { top: `${h.y + h.h}px`, left: "0px", width: `${vw}px`, height: `${Math.max(0, vh - h.y - h.h)}px` })
          const ring = ringRef.current
          if (ring) Object.assign(ring.style, { transform: `translate3d(${h.x}px, ${h.y}px, 0)`, width: `${h.w}px`, height: `${h.h}px` })
        }
      }

      // 3 · the rail sits below the header AND the demo banner while it's on screen
      const card = cardRef.current
      const isRail = vw >= RAIL_MIN_VW
      if (card && isRail) {
        const banner = document.querySelector(sel("demo-banner"))?.getBoundingClientRect()
        const top = Math.max(HEADER, banner && banner.bottom > 0 ? banner.bottom : 0) + 12
        card.style.top = `${top}px`
        card.style.maxHeight = `${vh - top - 14}px`
      }

      // 4 · the connector: from the card's edge to the spotlighted element
      const path = linkRef.current, dot = dotRef.current, svg = linkSvgRef.current
      if (path && dot && svg) {
        const c = card?.getBoundingClientRect()
        const h = st.hole
        const show = isRail && !!c && !!h && !!r && st.wantDim && h.x > (c?.right ?? 0) + 24
        st.link = lerp(st.link, show && st.dim > 0.5 ? 1 : 0, k(0.12))
        svg.style.opacity = st.link.toFixed(3)
        if (show && c && h) {
          const ty = Math.min(Math.max(h.y + Math.min(h.h / 2, 60), HEADER + 16), vh - 16)
          const sy = Math.min(Math.max(ty, c.top + 28), c.bottom - 28)
          const x0 = c.right + 2, x1 = h.x - 3
          const bend = Math.min(90, (x1 - x0) / 2)
          path.setAttribute("d", `M ${x0} ${sy} C ${x0 + bend} ${sy}, ${x1 - bend} ${ty}, ${x1} ${ty}`)
          dot.setAttribute("cx", String(x1)); dot.setAttribute("cy", String(ty))
        }
      }

      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [running])

  async function moveCursorTo(el: Element) {
    const r = el.getBoundingClientRect()
    const vw = window.innerWidth, vh = window.innerHeight
    const x = Math.min(vw - 30, Math.max(10, r.left + Math.min(r.width / 2, 160)))
    const y = Math.min(vh - 30, Math.max(70, r.top + Math.min(r.height / 2, 40)))
    if (!cursorRef.current.on) {
      // Reach out from the card.
      const c = cardRef.current?.getBoundingClientRect()
      setCursor((p) => ({ ...p, x: c ? c.right - 40 : vw / 2, y: c ? c.top + 40 : vh / 2, on: true, instant: true }))
      await sleep(80)
    }
    setCursor((p) => ({ ...p, x, y, instant: false }))
    await sleep(CURSOR_MS)
  }

  /** Wait until the session is the given demo identity (bounded). */
  async function awaitManager(alive: () => boolean, ms = 8000) {
    const t0 = performance.now()
    while (alive() && performance.now() - t0 < ms) {
      if (live$.current.email === MANAGER && live$.current.role === "manager") return true
      await sleep(120)
    }
    return false
  }

  // ── The step runner: identity → route → X-ray → find target → scroll → read → act.
  useEffect(() => {
    if (!running) return
    const s = STEPS[i]
    const id = ++runId.current
    const alive = () => runId.current === id && live$.current.running
    const st = stage.current
    // New step: the spotlight stays on the previous element while the next one
    // is found (then glides over); if that element is gone (another page) the
    // dim fades out rather than framing an empty spot. The card fades out.
    st.wantDim = !!s.target
    setPhase("entering"); setCaption(null); setLive([]); setMenu(false)
    setCursor((p) => ({ ...p, on: false }))
    // Watchdog: whatever happens (a missing element, a slow network), the step
    // releases the tour — Next and Auto keep working.
    const guard = window.setTimeout(() => {
      if (runId.current !== id) return
      runId.current++
      setReadyStep(i); setPhase("idle"); setCaption(null); setCursor((p) => ({ ...p, on: false }))
    }, STEP_WATCHDOG)
    ;(async () => {
      closeCode()
      await sleep(200) // the old text fades out first
      if (!alive()) return
      setReadyStep(i)
      if (s.as === "manager" && live$.current.isDemo && live$.current.email !== MANAGER) {
        setCaption("Switching you to the Manager demo…")
        await supabase.auth.signInWithPassword({ email: MANAGER, password: DEMO_PASSWORD })
        await awaitManager(alive)
        setCaption(null)
      }
      if (!alive()) return
      if (s.route && live$.current.path !== s.route) { navigate({ to: s.route }); await sleep(300) }
      if (!alive()) return
      if (s.xray === "keep") { /* leave the panel as is */ }
      else if (s.xray) openTo(s.xray)
      else setOpen(false)

      if (s.target) {
        const el = await waitFor(sel(s.target), s.optional ? 3500 : 6000, alive)
        if (!alive()) return
        if (!el) {
          // Its subject isn't here (e.g. no batch is waiting for review): skip on.
          if (s.optional) {
            const n = i + dir.current
            if (n >= 0 && n < STEPS.length) { window.clearTimeout(guard); setI(n); return }
            st.wantDim = false
          } else st.sel = sel(s.target) // still loading: it lights up the moment it appears
        } else {
          if (s.xray) await sleep(420) // let the drawer finish sliding in
          st.sel = sel(s.target)
          await sleep(60)
          scrollIntoFree(el)
          await scrollSettled(alive)
        }
      }
      if (!alive()) return

      if (s.actions?.length) {
        await sleep(READ_BEFORE_ACT)
        if (!alive()) return
        setPhase("acting")
        for (const a of s.actions) {
          if (!alive()) return
          if (a.demoOnly && !live$.current.isDemo) continue
          const t = await waitFor(sel(a.to), 4500, alive)
          if (!alive()) return
          if (!t || a.skipIf?.(t)) continue
          if (a.spot) st.sel = sel(a.spot)
          setCaption(a.say)
          const tr = t.getBoundingClientRect()
          if (!inFixed(t) && (tr.top < HEADER + 10 || tr.bottom > window.innerHeight - 20)) {
            t.scrollIntoView({ block: "center", behavior: "smooth" })
            await scrollSettled(alive)
          }
          await moveCursorTo(t)
          if (!alive()) return
          await sleep(CLICK_BEAT)
          setCursor((p) => ({ ...p, click: p.click + 1 }))
          await sleep(160)
          if (a.control) tourControl(a.control[0], a.control[1])
          else t.click()
          if (a.awaitIdentity === "manager") await awaitManager(alive)
          await sleep((a.wait ?? 1100) * ACTION_HOLD + 300)
        }
        if (!alive()) return
        if (s.target) {
          st.sel = sel(s.target)
          const el = document.querySelector<HTMLElement>(sel(s.target))
          if (el) {
            const r = el.getBoundingClientRect()
            // Off screen — or grown past the fold by what the action opened.
            const grown = r.bottom > window.innerHeight - 10 && r.top > HEADER + 40
            if (r.bottom < HEADER + 40 || r.top > window.innerHeight - 80 || grown) { scrollIntoFree(el); await scrollSettled(alive) }
          }
        }
        await sleep(450)
        setCaption(null)
        setCursor((p) => ({ ...p, on: false }))
      }
      window.clearTimeout(guard)
      setPhase("idle")
    })()
    return () => window.clearTimeout(guard)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, i, replay])

  // Live figures, read straight off the page (data-live), refreshed as it reacts.
  useEffect(() => {
    if (!running || !step.live) { setLive([]); return }
    const from = typeof step.live === "string" ? sel(step.live) : step.target ? sel(step.target) : null
    if (!from) return
    let last = ""
    const read = () => {
      const root = document.querySelector(from)
      if (!root) return
      const els = [...(root.matches("[data-live]") ? [root] : []), ...root.querySelectorAll("[data-live]")]
      const items = els.map((e) => (e as HTMLElement).dataset.live ?? "").filter(Boolean).slice(0, 6)
      const key = items.join("|")
      if (key !== last) { last = key; setLive(items) } // re-render only when a figure changed
    }
    read()
    const t = setInterval(read, 700)
    return () => clearInterval(t)
  }, [running, i, step.live, step.target])

  // Auto-play: real reading time per step, counted down visibly, paused while
  // the mouse is on the card (or the code view is open).
  const autoMs = (() => {
    const words = `${step.body} ${step.money ?? ""} ${step.tech ?? ""}`.split(/\s+/).length
    const extra = step.render || step.ask ? 9000 : 0
    return Math.min(30000, Math.max(9000, words * 330) + extra)
  })()
  const last = i >= STEPS.length - 1
  const autoArmed = running && auto && !last
  const autoCounting = autoArmed && phase === "idle" && ready && !code
  const autoPaused = autoCounting && hovering
  const [remaining, setRemaining] = useState(0)
  useEffect(() => { setRemaining(autoMs) }, [i, autoMs, auto])
  useEffect(() => {
    if (!autoCounting || autoPaused) return
    const t = setInterval(() => setRemaining((r) => r - 250), 250)
    return () => clearInterval(t)
  }, [autoCounting, autoPaused])
  useEffect(() => {
    if (autoCounting && !autoPaused && remaining <= 0) next()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining, autoCounting, autoPaused])

  function go(n: number) { const to = Math.max(0, Math.min(STEPS.length - 1, n)); dir.current = to >= i ? 1 : -1; setI(to) }
  function next() { if (last) end(); else go(i + 1) }
  function back() { if (i > 0) go(i - 1) }
  function start() {
    remember(); setChoice("made"); setInspecting(false)
    stage.current = freshStage()
    dir.current = 1
    setI(0); setReadyStep(-1); setReplay((r) => r + 1); setRunning(true)
  }
  function chooseSelf() { remember(); setChoice("made") }
  function end() {
    runId.current++
    setRunning(false); setOpen(false); setReadyStep(-1)
    setCursor((p) => ({ ...p, on: false })); setAuto(false)
    stage.current = freshStage()
  }

  // The card shows the step it has switched to (see readyStep).
  const cs = STEPS[readyStep >= 0 ? readyStep : i]
  const chapterSteps = STEPS.filter((s) => s.chapter === cs.chapter)
  const inChapter = chapterSteps.findIndex((s) => s.id === cs.id) + 1
  const target = cs.code ? CODE_MAP[cs.code] : null

  return (
    <>
      {/* Launch dock: the tour + the X-RAY CODE inspector, stacked in the corner
          (narrow, so it stays clear of the page content). */}
      {!running && (
        <div className="fixed bottom-5 left-4 z-50 flex flex-col items-start gap-2">
          <CodeXrayButton />
          <button onClick={start}
            className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2.5 font-mono text-xs font-bold uppercase tracking-widest text-accent-foreground shadow-soft transition hover:brightness-110">
            <ScanLine className="size-3.5" strokeWidth={2.25} /> Take the tour
          </button>
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

      {/* Spotlight: four dim panels around a hole + a ring, and the connector
          from the card. Written by the frame loop (eased) — it glides between
          elements and fades instead of blinking. */}
      {running && (
        <div ref={dimRef} aria-hidden className="pointer-events-none fixed inset-0 z-[55]" style={{ opacity: 0 }}>
          {[0, 1, 2, 3].map((n) => (
            <div key={n} ref={(el) => { panelRefs.current[n] = el }} className="fixed bg-black/60" />
          ))}
          <div ref={ringRef} className="fixed left-0 top-0 rounded-xl ring-2 ring-accent will-change-transform"
            style={{ boxShadow: "0 0 0 2px rgba(163,230,53,0.35), 0 0 40px -4px rgba(163,230,53,0.55)" }} />
        </div>
      )}
      {running && (
        <svg ref={linkSvgRef} aria-hidden className="pointer-events-none fixed inset-0 z-[59] h-full w-full" style={{ opacity: 0 }}>
          <path ref={linkRef} fill="none" stroke="rgb(163 230 53 / 0.75)" strokeWidth={1.5} strokeDasharray="4 4" />
          <circle ref={dotRef} r={4} fill="rgb(163 230 53)" />
        </svg>
      )}

      {/* The agent's cursor — slow, deliberate moves */}
      <AnimatePresence>
        {running && cursor.on && (
          <motion.div key="cursor" className="pointer-events-none fixed left-0 top-0 z-[68]"
            initial={{ opacity: 0, x: cursor.x, y: cursor.y }}
            animate={{ opacity: 1, x: cursor.x, y: cursor.y }}
            exit={{ opacity: 0, transition: { duration: 0.35 } }}
            transition={cursor.instant ? { duration: 0 } : { x: { duration: CURSOR_MS / 1000, ease: [0.25, 0.9, 0.3, 1] }, y: { duration: CURSOR_MS / 1000, ease: [0.25, 0.9, 0.3, 1] }, opacity: { duration: 0.3 } }}>
            <AnimatePresence>
              {cursor.click > 0 && (
                <motion.span key={cursor.click} className="absolute -left-5 -top-5 size-10 rounded-full border-2 border-accent"
                  initial={{ scale: 0.3, opacity: 0.9 }} animate={{ scale: 1.7, opacity: 0 }} transition={{ duration: 0.7 }} />
              )}
            </AnimatePresence>
            <svg width="26" height="30" viewBox="0 0 26 30" className="drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">
              <path d="M2 2 L2 24 L8 18.5 L12.5 28 L16.5 26 L12 16.8 L20 16.8 Z" fill="#fff" stroke="#0b0f0a" strokeWidth="1.6" strokeLinejoin="round" />
            </svg>
            <span className="absolute left-5 top-6 whitespace-nowrap rounded-full bg-accent px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest text-accent-foreground shadow-soft">guide</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* The step card — a rail on the left (desktop) or a bottom sheet. It never
          moves between steps; only its content cross-fades. */}
      {running && (
        <div ref={cardRef} role="dialog" aria-label={`Tour: ${cs.title}`} data-step={step.id} data-phase={phase} data-ready={ready ? "1" : "0"}
          onMouseEnter={() => setHovering(true)} onMouseLeave={() => setHovering(false)}
          className={cn("fixed z-[60] flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[0_24px_70px_-20px_rgba(0,0,0,0.9)] ring-1 ring-accent/25",
            rail ? "" : "inset-x-2 bottom-2")}
          style={rail ? { left: RAIL_X, width: RAIL_W, top: HEADER + 12 } : { maxHeight: `${SHEET_VH * 100}vh` }}>

          {/* Header: chapter, chapter list, auto, close */}
          <div className="relative flex items-center gap-2 px-4 pt-3.5">
            <span className="font-mono text-[10px] uppercase tracking-widest text-accent">{cs.chapter}</span>
            <span className="font-mono text-[10px] tabular-nums text-muted-foreground">{inChapter}/{chapterSteps.length}</span>
            <div className="ml-auto flex items-center gap-1">
              <button onClick={() => setAuto((a) => !a)} title={auto ? "Stop auto-play" : "Auto-play the tour"} data-tour="tour-auto"
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
            {menu && <ChapterMenu current={cs.chapter} onPick={(c) => { setMenu(false); go(STEPS.findIndex((s) => s.chapter === c)) }} />}
          </div>
          <div className="mx-4 mt-2.5 h-1 overflow-hidden rounded-full bg-border">
            <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${((i + 1) / STEPS.length) * 100}%` }} />
          </div>

          {/* Body — scrolls on its own if long; never scrolls the page behind it. */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-3 pt-3"
            style={{ opacity: ready ? 1 : 0, transition: `opacity ${ready ? 320 : 160}ms ease` }}>
            <h3 className="text-[17px] font-semibold leading-snug tracking-tight">{cs.title}</h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{cs.body}</p>

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

            {cs.chapter === "Welcome" && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {CHAPTERS.slice(1).map((c) => (
                  <button key={c} onClick={() => go(STEPS.findIndex((s) => s.chapter === c))}
                    className="rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground ring-1 ring-border transition hover:text-accent hover:ring-accent/60">
                    {c}
                  </button>
                ))}
              </div>
            )}

            {cs.money && (
              <div className="mt-3 border-l-2 border-accent/60 pl-3">
                <p className="font-mono text-[9px] uppercase tracking-widest text-accent">What it tells you</p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-foreground/90">{cs.money}</p>
              </div>
            )}
            {cs.tech && (
              <div className="mt-3 rounded-lg bg-secondary/60 px-3 py-2">
                <p className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                  <Database className="size-3" /> {cs.chapter === "Welcome" ? "How to use the tour" : "Under the hood · how it's pulled & protected"}
                </p>
                <p className="mt-1 text-[12px] leading-relaxed text-foreground/80">{cs.tech}</p>
              </div>
            )}

            {cs.render && <div className="mt-3">{cs.render()}</div>}
            {cs.ask && <div className="mt-3"><AskFeedback step={cs.id} question={cs.ask} /></div>}
          </div>

          {/* Auto-play countdown — visible, and paused while you read */}
          {autoArmed && (
            <AutoBar remaining={remaining} total={autoMs} paused={autoPaused} waiting={!autoCounting} />
          )}

          {/* Footer */}
          <div className="flex items-center gap-2 border-t border-border px-4 py-2.5">
            <button onClick={back} disabled={i === 0}
              className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground transition hover:text-foreground disabled:opacity-40">← Back</button>
            <div className="ml-auto flex items-center gap-1.5">
              {cs.actions?.length ? (
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
              <button onClick={next} data-tour="tour-next"
                className="rounded-full bg-foreground px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-background transition hover:scale-[1.03]">
                {last ? "Done" : "Next →"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/** The auto-play countdown: seconds left + a draining bar; says why it's paused. */
function AutoBar({ remaining, total, paused, waiting }: { remaining: number; total: number; paused: boolean; waiting: boolean }) {
  const frac = Math.max(0, Math.min(1, remaining / total))
  return (
    <div data-tour="tour-countdown" className="border-t border-border px-4 pb-2 pt-2">
      <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-widest">
        <span className={cn("inline-flex items-center gap-1.5", paused ? "text-[#e3c35a]" : "text-accent")}>
          {paused ? <Pause className="size-3" /> : <Play className="size-3" />}
          {waiting ? "auto · watching the demo…" : paused ? "auto · paused while you read" : "auto · next step in"}
        </span>
        {!waiting && <span className="tabular-nums text-foreground">{Math.max(0, Math.ceil(remaining / 1000))}s</span>}
      </div>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-border">
        <div className={cn("h-full rounded-full transition-[width] duration-300 ease-linear", paused ? "bg-[#d6b53f]" : "bg-accent")}
          style={{ width: `${(waiting ? 1 : frac) * 100}%` }} />
      </div>
    </div>
  )
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
