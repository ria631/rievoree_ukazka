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
 *
 * Motion model (why it's smooth): React renders the card's CONTENT once per
 * step. Everything that moves — the dimmed spotlight, the ring, the card's
 * position, its pointer — is driven by one requestAnimationFrame loop that
 * writes styles directly and EASES toward the target, so the spotlight glides
 * from element to element instead of vanishing and reappearing, and the card
 * picks its side only once the page has finished scrolling (no hopping).
 */
const SEEN_KEY = "xray-tour-choice"
const DEMO_PASSWORD = "demo123456"
const MANAGER = "manager@demo.local"
const HEADER = 64
const GAP = 18
const MARGIN = 14
const PAD = 10 // spotlight padding around the target
const DOCK_H = 232 // height of the bottom-docked card

// Pacing — unhurried, so a visitor can follow every move.
const READ_BEFORE_ACT = 1400 // let the card be read before the cursor moves
const CURSOR_MS = 1050 // cursor glide to the next control
const CLICK_BEAT = 300 // hover a moment before clicking
const ACTION_HOLD = 1.6 // × each action's own wait: time to see the result

const sel = (id: string) => `[data-tour="${id}"]`
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

interface Rect { top: number; left: number; width: number; height: number }
interface Box { x: number; y: number; w: number; h: number }
type Mode = Side | "dock" | "center"

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

/** Scroll so the target AND its card fit on screen together. */
function scrollForCard(el: HTMLElement, cw: number) {
  if (inFixed(el)) { el.scrollIntoView({ block: "nearest", behavior: "smooth" }); return }
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

/** Where the card sits for a given side, or null if it doesn't fit there. */
function coordsFor(mode: Mode, r: Rect | null, cw: number, ch: number): { x: number; y: number } | null {
  const vw = window.innerWidth, vh = window.innerHeight
  if (mode === "center" || !r) return { x: Math.max(MARGIN, (vw - cw) / 2), y: Math.max(HEADER + 24, (vh - ch) / 2) }
  if (mode === "dock") return null
  const R = { top: r.top - PAD, left: r.left - PAD, right: r.left + r.width + PAD, bottom: r.top + r.height + PAD }
  const clampY = (t: number) => Math.min(Math.max(t, HEADER + 8), vh - ch - MARGIN)
  const clampX = (l: number) => Math.min(Math.max(l, MARGIN), vw - cw - MARGIN)
  switch (mode) {
    case "right": return R.right + GAP + cw <= vw - MARGIN ? { x: R.right + GAP, y: clampY(R.top) } : null
    case "left": return R.left - GAP - cw >= MARGIN ? { x: R.left - GAP - cw, y: clampY(R.top) } : null
    case "bottom": return R.bottom + GAP + ch <= vh - MARGIN ? { x: clampX(R.left), y: R.bottom + GAP } : null
    case "top": return R.top - GAP - ch >= HEADER + 4 ? { x: clampX(R.left), y: R.top - GAP - ch } : null
  }
}

/** The first side with room; if none (a wide AND tall target on a smaller
 *  screen) the card docks as a low strip at the bottom — never on the target. */
function chooseMode(r: Rect, cw: number, ch: number, prefer: Side[] = []): Mode {
  for (const s of [...prefer, "right", "left", "bottom", "top"] as Side[]) if (coordsFor(s, r, cw, ch)) return s
  return "dock"
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
  card: { x: number; y: number } | null
  mode: Mode | null
  prefer: Side[]
  size: { w: number; h: number }
  lastR: Rect | null
  stable: number
  invalid: number
  scrollDone: boolean
  stepIdx: number
  showAt: number // the card may re-appear only after it has faded out
  docked: boolean // mirrors the React layout state (the loop must not translate a docked strip)
}
const freshStage = (): Stage => ({
  sel: null, el: null, elSel: null, wantDim: false, hole: null, dim: 0, card: null, mode: null,
  prefer: [], size: { w: 384, h: 380 }, lastR: null, stable: 0, invalid: 0, scrollDone: true,
  stepIdx: -1, showAt: 0, docked: false,
})

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
  // The step index whose card has arrived. Derived per step, so the moment the
  // step changes the card is already "not ready" — no flash of new text at the old spot.
  const [readyStep, setReadyStep] = useState(-1)
  const [docked, setDocked] = useState(false)
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
  const live$ = useRef({ path, email, role, isDemo, running })
  live$.current = { path, email, role, isDemo, running }
  const stage = useRef<Stage>(freshStage())
  const cardRef = useRef<HTMLDivElement>(null)
  const arrowRef = useRef<HTMLSpanElement>(null)
  const dimRef = useRef<HTMLDivElement>(null)
  const panelRefs = useRef<(HTMLDivElement | null)[]>([])
  const ringRef = useRef<HTMLDivElement>(null)
  const cursorRef = useRef(cursor)
  cursorRef.current = cursor

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
    prewarmHighlighter() // "Show the code" opens instantly
    return () => { html.style.overflowAnchor = prev[0]; body.style.paddingBottom = prev[1] }
  }, [running])

  // The floating card's measured size (never the docked strip's — or the two
  // layouts would decide each other back and forth).
  useEffect(() => {
    const el = cardRef.current
    if (!el) return
    const ro = new ResizeObserver(() => { if (stage.current.mode !== "dock") stage.current.size = { w: el.offsetWidth, h: el.offsetHeight } })
    ro.observe(el)
    return () => ro.disconnect()
  }, [running])

  // ── The frame loop: spotlight + card + pointer, eased, written straight to the DOM.
  useEffect(() => {
    if (!running) return
    const st = stage.current
    let raf = 0
    let prev = performance.now()
    const frame = (t: number) => {
      const dt = Math.min(64, t - prev); prev = t
      const k = (base: number) => 1 - Math.pow(1 - base, dt / 16.7) // frame-rate independent easing

      // 1 · the target (cached; re-queried only if it changed or re-mounted)
      if (!st.sel) st.el = null
      else if (!st.el || !st.el.isConnected || st.elSel !== st.sel) { st.el = document.querySelector<HTMLElement>(st.sel); st.elSel = st.sel }
      let r: Rect | null = null
      if (st.el) { const b = st.el.getBoundingClientRect(); if (b.width > 0 && b.height > 0) r = { top: b.top, left: b.left, width: b.width, height: b.height } }
      const L = st.lastR
      st.stable = r && L && Math.abs(r.top - L.top) < 0.8 && Math.abs(r.left - L.left) < 0.8 && Math.abs(r.width - L.width) < 0.8 && Math.abs(r.height - L.height) < 0.8 ? st.stable + 1 : 0
      st.lastR = r

      // 2 · the spotlight glides to the target; it fades rather than blinking
      if (r) {
        const want = { x: r.left - PAD, y: r.top - PAD, w: r.width + PAD * 2, h: r.height + PAD * 2 }
        if (!st.hole || st.dim < 0.02) st.hole = want
        else {
          const e = k(0.2)
          st.hole = { x: lerp(st.hole.x, want.x, e), y: lerp(st.hole.y, want.y, e), w: lerp(st.hole.w, want.w, e), h: lerp(st.hole.h, want.h, e) }
        }
      }
      const dimTarget = st.wantDim && st.hole ? 1 : 0
      st.dim = lerp(st.dim, dimTarget, k(0.14))
      if (st.dim < 0.01 && !st.wantDim) st.hole = null
      const dim = dimRef.current
      if (dim) {
        dim.style.opacity = st.dim.toFixed(3)
        const h = st.hole
        if (h) {
          const vw = window.innerWidth, vh = window.innerHeight
          const [top, left, right, bottom] = panelRefs.current
          if (top) Object.assign(top.style, { top: "0px", left: "0px", width: `${vw}px`, height: `${Math.max(0, h.y)}px` })
          if (left) Object.assign(left.style, { top: `${h.y}px`, left: "0px", width: `${Math.max(0, h.x)}px`, height: `${h.h}px` })
          if (right) Object.assign(right.style, { top: `${h.y}px`, left: `${h.x + h.w}px`, width: `${Math.max(0, vw - h.x - h.w)}px`, height: `${h.h}px` })
          if (bottom) Object.assign(bottom.style, { top: `${h.y + h.h}px`, left: "0px", width: `${vw}px`, height: `${Math.max(0, vh - h.y - h.h)}px` })
          const ring = ringRef.current
          if (ring) Object.assign(ring.style, { transform: `translate3d(${h.x}px, ${h.y}px, 0)`, width: `${h.w}px`, height: `${h.h}px` })
        }
      }

      // 3 · the card: pick a side ONCE the page has settled, then follow it
      const { w: cw, h: ch } = st.size
      if (!st.mode && t >= st.showAt) {
        if (!st.wantDim) st.mode = "center"
        else if (r && st.stable >= 4 && st.scrollDone) st.mode = chooseMode(r, cw, ch, st.prefer)
        if (st.mode) {
          // The card is invisible right now: put it straight in its new place, then fade it in.
          const c = st.mode === "dock" ? null : coordsFor(st.mode, r, cw, ch)
          st.card = c ? { ...c } : null
          if (c && cardRef.current) cardRef.current.style.transform = `translate3d(${c.x}px, ${c.y}px, 0)`
          st.docked = st.mode === "dock"
          setDocked(st.docked)
          setReadyStep(st.stepIdx)
        }
      } else if (st.mode && st.mode !== "center" && st.mode !== "dock" && r && !coordsFor(st.mode, r, cw, ch)) {
        if (++st.invalid > 15) {
          st.mode = chooseMode(r, cw, ch, st.prefer); st.invalid = 0
          st.docked = st.mode === "dock"; setDocked(st.docked)
          if (st.docked) st.card = null
        }
      } else st.invalid = 0

      // The loop alone owns the card's transform (React never sets it).
      const card = cardRef.current
      if (card) {
        if (st.docked) {
          if (card.style.transform !== "none") card.style.transform = "none" // the strip is laid out by CSS
        } else {
          const desired = st.mode ? coordsFor(st.mode, r, cw, ch) : null
          if (desired) {
            if (!st.card) st.card = { ...desired }
            else { const e = k(0.16); st.card = { x: lerp(st.card.x, desired.x, e), y: lerp(st.card.y, desired.y, e) } }
            card.style.transform = `translate3d(${st.card.x}px, ${st.card.y}px, 0)`
          } else if (!st.card) {
            st.card = coordsFor("center", null, cw, ch)!
            card.style.transform = `translate3d(${st.card.x}px, ${st.card.y}px, 0)`
          }
        }
      }

      // 4 · the little pointer on the card edge, aimed at the target's middle
      const arrow = arrowRef.current
      if (arrow) {
        const side = st.mode
        if (r && st.card && side && side !== "center" && side !== "dock") {
          const midY = Math.min(Math.max(r.top + r.height / 2 - st.card.y, 22), ch - 22)
          const midX = Math.min(Math.max(r.left + r.width / 2 - st.card.x, 22), cw - 22)
          const s = arrow.style
          s.display = "block"
          s.left = side === "right" ? "-7.5px" : side === "left" ? "" : `${midX - 7}px`
          s.right = side === "left" ? "-7.5px" : ""
          s.top = side === "bottom" ? "-7.5px" : side === "top" ? "" : `${midY - 7}px`
          s.bottom = side === "top" ? "-7.5px" : ""
          s.borderWidth = side === "right" ? "0 0 1px 1px" : side === "left" ? "1px 1px 0 0" : side === "bottom" ? "1px 0 0 1px" : "0 1px 1px 0"
        } else arrow.style.display = "none"
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
      setCursor((p) => ({ ...p, x: c ? c.left + c.width - 40 : vw / 2, y: c ? c.top + 30 : vh / 2, on: true, instant: true }))
      await sleep(80)
    }
    setCursor((p) => ({ ...p, x, y, instant: false }))
    await sleep(CURSOR_MS)
  }

  // ── The step runner: identity → route → X-ray → find target → scroll → read → act.
  useEffect(() => {
    if (!running) return
    const s = STEPS[i]
    const id = ++runId.current
    const alive = () => runId.current === id && live$.current.running
    const st = stage.current
    // New step: hold the spotlight where it is (it will glide on), forget the side.
    st.sel = null; st.wantDim = !!s.target; st.mode = null; st.prefer = s.prefer ?? []; st.stable = 0; st.scrollDone = false
    st.stepIdx = i; st.showAt = performance.now() + 240 // the card fades out first
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

      if (s.target) {
        const el = await waitFor(sel(s.target), 8000, alive)
        if (!alive()) return
        if (!el) { st.wantDim = false; st.scrollDone = true } // not on this screen → plain centred card
        else {
          if (s.xray) await sleep(420) // let the drawer finish sliding in
          st.sel = sel(s.target)
          scrollForCard(el, st.size.w)
          await scrollSettled(alive)
          st.scrollDone = true
        }
      } else st.scrollDone = true
      // Wait for the card to arrive, then give the visitor time to read it.
      const t0 = performance.now()
      while (alive() && !stage.current.mode && performance.now() - t0 < 2500) await sleep(50)
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
          if (a.spot) { st.sel = sel(a.spot); st.stable = 0 }
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
          await sleep((a.wait ?? 1100) * ACTION_HOLD + 300)
        }
        if (!alive()) return
        if (s.target) {
          st.sel = sel(s.target)
          const el = document.querySelector<HTMLElement>(sel(s.target))
          if (el) {
            const r = el.getBoundingClientRect()
            if (r.bottom < HEADER + 40 || r.top > window.innerHeight - 80) { scrollForCard(el, st.size.w); await scrollSettled(alive) }
          }
        }
        await sleep(450)
        setCaption(null)
      }
      setPhase("idle")
    })()
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

  // Auto-play: after a step has finished acting, give it real reading time.
  const autoMs = (() => {
    const words = `${step.body} ${step.money ?? ""} ${step.tech ?? ""}`.split(/\s+/).length
    return Math.min(26000, Math.max(9000, words * 330))
  })()
  const autoWaiting = running && auto && phase === "idle" && ready && !hovering && !code && !step.ask && !step.render
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
    stage.current = freshStage()
    setI(0); setReplay((r) => r + 1); setRunning(true)
  }
  function chooseSelf() { remember(); setChoice("made") }
  function end() {
    runId.current++
    setRunning(false); setOpen(false); setReadyStep(-1); setDocked(false)
    setCursor((p) => ({ ...p, on: false })); setAuto(false)
    stage.current = freshStage()
  }

  // The card shows the step it is standing next to: while it fades out it keeps
  // the previous step's text, and switches only once it re-appears at the new place.
  const cs = STEPS[readyStep >= 0 ? readyStep : i]
  const chapterSteps = STEPS.filter((s) => s.chapter === cs.chapter)
  const inChapter = chapterSteps.findIndex((s) => s.id === cs.id) + 1
  const target = cs.code ? CODE_MAP[cs.code] : null
  const dockW = typeof window === "undefined" ? 0 : Math.min(window.innerWidth - MARGIN * 2, 1120)
  const cardStyle: React.CSSProperties = docked
    ? { left: (window.innerWidth - dockW) / 2, top: window.innerHeight - DOCK_H - MARGIN, width: dockW, height: DOCK_H }
    : { left: 0, top: 0 } // positioned by the frame loop's transform (invisible until placed)

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

      {/* Spotlight: four dim panels around a hole + a ring. Positions are written
          by the frame loop (eased), so it glides between elements and fades
          instead of blinking. */}
      {running && (
        <div ref={dimRef} aria-hidden className="pointer-events-none fixed inset-0 z-[55]" style={{ opacity: 0 }}>
          {[0, 1, 2, 3].map((n) => (
            <div key={n} ref={(el) => { panelRefs.current[n] = el }} className="fixed bg-black/60" />
          ))}
          <div ref={ringRef} className="fixed left-0 top-0 rounded-xl ring-2 ring-accent will-change-transform"
            style={{ boxShadow: "0 0 0 2px rgba(163,230,53,0.35), 0 0 40px -4px rgba(163,230,53,0.55)" }} />
        </div>
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

      {/* The step card — anchored next to the element it explains; its position
          is eased by the frame loop (transform), never set by React. */}
      {running && (
        <div ref={cardRef} role="dialog" aria-label={`Tour: ${cs.title}`} data-step={step.id} data-phase={phase} data-ready={ready ? "1" : "0"}
          onMouseEnter={() => setHovering(true)} onMouseLeave={() => setHovering(false)}
          className={cn("fixed z-[60] flex flex-col rounded-2xl border border-border bg-card shadow-[0_24px_70px_-20px_rgba(0,0,0,0.9)] ring-1 ring-accent/25 will-change-transform",
            docked ? "" : "max-h-[calc(100vh-96px)] w-[min(92vw,384px)]", !ready && "pointer-events-none")}
          style={{ ...cardStyle, opacity: ready ? 1 : 0, transition: `opacity ${ready ? 340 : 180}ms ease` }}>
          <span ref={arrowRef} aria-hidden className="absolute hidden size-3.5 rotate-45 border-solid border-border bg-card" />

          {/* Header: chapter, chapter list, auto, close */}
          <div className="relative flex items-center gap-2 px-4 pt-3.5">
            <span className="font-mono text-[10px] uppercase tracking-widest text-accent">{cs.chapter}</span>
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
            {menu && <ChapterMenu current={cs.chapter} onPick={(c) => { setMenu(false); go(STEPS.findIndex((s) => s.chapter === c)) }} />}
          </div>
          <div className="mx-4 mt-2.5 h-1 overflow-hidden rounded-full bg-border">
            <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${((i + 1) / STEPS.length) * 100}%` }} />
          </div>

          <div className={cn("min-h-0 flex-1 overflow-y-auto px-4 pb-3 pt-3", docked && "grid gap-x-8 md:grid-cols-2 md:content-start")}>
            <div>
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

            </div>
            <div>
            {cs.money && (
              <div className={cn("border-l-2 border-accent/60 pl-3", docked ? "mt-1" : "mt-3")}>
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
          </div>

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
