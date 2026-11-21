/**
 * The hero's living code: a rain of characters taken from this repo's own
 * source falls through the hero; on the right, a report screen assembles out
 * of it, cell by cell; an X-ray sweep turns the screen into the code behind
 * it (the request, the SQL view, the RLS policy — the real statements); then
 * it dissolves back into the rain, and again.
 *
 * Cost, on purpose: one 2D canvas for the rain at 1× pixel ratio, ~30 frames
 * a second, each frame a translucent fill plus one glyph per falling column;
 * the screen is its own small canvas, redrawn only in the cells that change.
 * Nothing runs while the hero is off screen or the tab is hidden. Reduced
 * motion: one still frame, the screen assembled.
 */
import { KEYWORDS, SRC } from "./repoSource"

export type Phase = "build" | "screen" | "xray" | "code" | "release" | "rain"

export interface CodeRainOpts {
  host: HTMLElement // the hero: the rain covers it
  zone: HTMLElement // where the screen assembles
  fg: HTMLCanvasElement // the screen's own canvas, inside zone
  avoid?: HTMLElement // the hero copy: the rain dims behind it
  lens?: HTMLElement // a ring that follows the pointer over the screen
  onPhase?: (p: Phase) => void
}

const GC = 50 // screen columns
const GR = 23 // screen rows
const DUR: Record<Phase, number> = { build: 3200, screen: 3000, xray: 1500, code: 4200, release: 1500, rain: 1300 }
const NEXT: Record<Phase, Phase> = { build: "screen", screen: "xray", xray: "code", code: "release", release: "rain", rain: "build" }

const C = {
  bg: "#04110F",
  fade: "rgba(4,17,15,0.13)",
  head: "#F1FFD6",
  trail: "#86D83E",
  far: "#2E6B3C",
  cell: "#061816",
  border: "#2F6A4C",
  label: "#8DB3A6",
  num: "#F2FFE4",
  up: "#7FE3B6",
  bar: "#A3E635",
  barHi: "#D4F78A",
  teal: "#5DCFDA",
  dim: "#5E9384",
  plain: "#E4F2EC",
  red: "#F59186",
  scan: "#D4F78A",
}

/* ───────────── the two faces of the screen, as character grids ───────────── */

type Paint = { ch: string; c: string }
type Seg = [string, string]
const len = (segs: Seg[]) => segs.reduce((n, [t]) => n + [...t].length, 0)

function line(segs: Seg[]): Paint[] {
  const out: Paint[] = []
  for (const [t, c] of segs) for (const ch of t) out.push({ ch, c })
  while (out.length < GC) out.push({ ch: " ", c: C.label })
  return out.slice(0, GC)
}
const B = C.border
const H = "─"
const row = (inner: Seg[]) => line([["│", B], ...inner, [" ".repeat(Math.max(0, GC - 2 - len(inner))), B], ["│", B]])
const lr = (left: Seg[], right: Seg[]) => row([...left, [" ".repeat(Math.max(1, GC - 2 - len(left) - len(right))), B], ...right])
const edge = (l: string, r: string) => line([[l + H.repeat(GC - 2) + r, B]])
const pad = (s: string, n: number) => (s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length))
const labelSep = (label: string, c: string) => line([["├─ ", B], [label, c], [" " + H.repeat(GC - 5 - label.length - 1), B], ["┤", B]])

const NOI = [62, 66, 64, 70, 68, 74, 72, 79, 77, 83, 81, 86]
const BLOCKS = " ▁▂▃▄▅▆▇█"

function screenFace(): Paint[][] {
  const tri = (a: string, b: string, c: string, col: string) =>
    line([["│", B], [pad(a, 15), col], ["│", B], [pad(b, 16), col], ["│", B], [pad(c, 15), col], ["│", B]])
  const rows: Paint[][] = [
    edge("┌", "┐"),
    lr([[" ", B], ["●", "#F06A5D"], [" ", B], ["●", "#E8C55A"], [" ", B], ["●", C.up], ["   X-RAY · OVERVIEW", C.label]], [["viewer", C.bar], [" ", B]]),
    line([["├" + H.repeat(15) + "┬" + H.repeat(16) + "┬" + H.repeat(15) + "┤", B]]),
    tri(" REVENUE", " NOI", " OCCUPANCY", C.label),
    tri(" €501,377", " €372,911", " 88.1%", C.num),
    tri(" +0.1%", " +2.4%", " 6,702 m² free", C.up),
    line([["├" + H.repeat(15) + "┴" + H.repeat(16) + "┴" + H.repeat(15) + "┤", B]]),
    lr([[" NOI · 12 MONTHS", C.label]], [["▲ +2.4%", C.up], [" ", B]]),
  ]
  // five rows of bars, partial blocks on top
  const max = Math.max(...NOI)
  const min = Math.min(...NOI) - 6
  const h = NOI.map((v) => Math.round(((v - min) / (max - min)) * 38) + 2) // in eighths of a row
  for (let r = 0; r < 5; r++) {
    const level = 4 - r
    const inner: Seg[] = []
    for (let x = 0; x < GC - 2; x++) {
      const i = Math.floor((x - 2) / 4)
      const inBar = x >= 2 && (x - 2) % 4 < 2 && i < NOI.length
      if (!inBar) { inner.push([" ", B]); continue }
      const fill = h[i] - level * 8
      inner.push([fill >= 8 ? "█" : fill <= 0 ? " " : BLOCKS[fill], i === NOI.length - 1 ? C.barHi : C.bar])
    }
    rows.push(row(inner))
  }
  const months = "ONDJFMAMJJAS"
  const monthAt = (x: number) => (x >= 2 && (x - 2) % 4 === 0 && (x - 2) / 4 < 12 ? months[(x - 2) / 4] : " ")
  rows.push(row(Array.from({ length: GC - 2 }, (_, x): Seg => [monthAt(x), C.dim])))
  rows.push(edge("├", "┤"))
  rows.push(row([[" COMPANIES YOU CAN SEE", C.label]]))
  rows.push(lr([[" ", B], ["●", C.teal], [" Danube Office Park", C.num]], [["€188k", C.num], [" ", B]]))
  rows.push(row([["   showing 1 company", C.dim]]))
  rows.push(edge("├", "┤"))
  rows.push(lr([[" CASH IN BANK", C.label]], [["€3,657,920", C.num], [" ", B]]))
  const cash = "▂▃▃▄▃▄▅▅▆▅▆▇▆▇█▇"
  rows.push(lr([[" ", B], [cash, C.teal]], [["+0.9%", C.up], [" ", B]]))
  rows.push(lr([[" ", B], ["●", C.bar], [" live · refreshed 38 s ago", C.dim]], []))
  rows.push(edge("└", "┘"))
  return rows
}

/** One line of code → coloured segments: keywords lime, strings teal, comments dim. */
function highlight(src: string): Seg[] {
  const out: Seg[] = []
  for (const m of src.matchAll(/(--.*$)|('[^']*'|"[^"]*")|([A-Za-z_][A-Za-z0-9_]*)|(\s+)|(.)/g)) {
    if (m[1]) out.push([m[1], C.dim])
    else if (m[2]) out.push([m[2], C.teal])
    else if (m[3]) out.push([m[3], KEYWORDS.has(m[3].toLowerCase()) ? C.bar : C.plain])
    else out.push([m[0], m[4] ? B : C.label])
  }
  return out
}

function wrap(l: string, w: number): string[] {
  const out: string[] = []
  const ind = l.match(/^\s*/)?.[0] ?? ""
  let rest = l.trimEnd()
  while (rest.length > w) {
    let cut = rest.lastIndexOf(" ", w)
    if (cut <= ind.length) cut = w
    out.push(rest.slice(0, cut))
    rest = ind + "  " + rest.slice(cut).trimStart()
  }
  out.push(rest)
  return out
}

function codeBlock(lines: string[], n: number): Paint[][] {
  const wrapped = lines.flatMap((l) => wrap(l, GC - 4)).slice(0, n)
  while (wrapped.length < n) wrapped.push("")
  return wrapped.map((l) => row([[" ", B], ...highlight(l)]))
}

function codeFace(): Paint[][] {
  const view = SRC.report.split("\n").filter((l) => /^(create view|select |from |where |\s+or )/.test(l))
  const policy = SRC.rls.split("\n").filter((l) => l.trim() && !l.trim().startsWith("--"))
  return [
    edge("┌", "┐"),
    lr([[" X-RAY", C.bar], [" · the code behind this screen", C.dim]], [["press X", C.label], [" ", B]]),
    labelSep("1 · THE REQUEST", C.bar),
    row([[" GET  ", C.teal], ["report_account_monthly", C.plain], ["   200", C.dim], ["   38 ms", C.bar]]),
    row([[" GET  ", C.teal], ["entities              ", C.plain], ["   200", C.dim], ["   21 ms", C.bar]]),
    row([[" AUTH ", C.teal], ["session · viewer      ", C.plain], ["   JWT", C.dim], ["    6 ms", C.bar]]),
    labelSep("2 · THE SQL VIEW", C.bar),
    ...codeBlock(view, 7),
    labelSep("3 · THE RLS POLICY", C.red),
    ...codeBlock(policy, 7),
    edge("└", "┘"),
  ]
}

/** Characters for the rain: this repo's own source, whitespace removed. */
const GLYPHS = [...(SRC.rls + SRC.report + SRC.worker + SRC.fetch).replace(/\s+/g, "")]
const glyph = () => GLYPHS[(Math.random() * GLYPHS.length) | 0]

/* ───────────── the engine ───────────── */

export function mountCodeRain(o: CodeRainOpts): () => void {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches
  const fine = matchMedia("(hover: hover) and (pointer: fine)").matches
  const SCREEN = screenFace()
  const CODE = codeFace()

  const rain = document.createElement("canvas")
  rain.className = "cr-rain"
  rain.setAttribute("aria-hidden", "true")
  o.host.prepend(rain)
  const rc0 = rain.getContext("2d", { alpha: false })
  const fc0 = o.fg.getContext("2d")
  if (!rc0 || !fc0) { rain.remove(); return () => {} }
  const rc = rc0
  const fc = fc0

  // geometry (CSS px for the rain, device px for the screen)
  let W = 0, Hh = 0, f = 16, cw = 9.6, ch = 21, ox = 0, oy = 0, cols = 0, rows = 0, zc = 0, zr = 0
  let dpr = 1, font = "", farFont = "", farF = 10, farCw = 6, farCh = 13
  type Drop = { y: number; v: number; acc: number; prev: string }
  let near: Drop[] = []
  let far: (Drop & { x: number })[] = []
  let alphaAt: (x: number, y: number) => number = () => 1

  // the screen's cells
  const N = GC * GR
  const state = new Uint8Array(N) // 0 free · 1 screen · 2 code
  const hot = new Uint8Array(N) // ticks left of a bright flash
  let hotList: number[] = []
  let lens = new Set<number>()
  let order: number[] = [] // shuffled cell order for the current phase
  let cursor = 0
  let scanCol = -1

  let phase: Phase = "build"
  let clock = 0 // ms of running time
  let phaseAt = 0

  const shuffle = () => {
    order = Array.from({ length: N }, (_, i) => i)
    for (let i = N - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [order[i], order[j]] = [order[j], order[i]] }
    cursor = 0
  }
  const newDrop = (start = true): Drop => ({ y: start ? -Math.floor(Math.random() * rows) : Math.floor(Math.random() * rows), v: 0.35 + Math.random() * 0.6, acc: 0, prev: glyph() })

  function layout() {
    const hr = o.host.getBoundingClientRect()
    W = Math.max(1, Math.round(hr.width))
    Hh = Math.max(1, Math.round(hr.height))
    rain.width = W
    rain.height = Hh
    rain.style.width = `${W}px`
    rain.style.height = `${Hh}px`

    const zrc = o.zone.getBoundingClientRect()
    f = Math.max(7, Math.min(17, zrc.width / (GC * 0.6)))
    cw = f * 0.6
    ch = Math.round(f * 1.3)
    const sw = GC * cw
    const sh = GR * ch
    const lx = (zrc.width - sw) / 2
    const ly = Math.max(0, (zrc.height - sh) / 2)
    dpr = Math.min(2, window.devicePixelRatio || 1)
    o.fg.width = Math.round(sw * dpr)
    o.fg.height = Math.round(sh * dpr)
    o.fg.style.cssText = `position:absolute;left:${lx}px;top:${ly}px;width:${sw}px;height:${sh}px`

    // align the rain's grid to the screen's cells
    const zx = zrc.left - hr.left + lx
    const zy = zrc.top - hr.top + ly
    zc = Math.floor(zx / cw)
    zr = Math.floor(zy / ch)
    ox = zx - zc * cw
    oy = zy - zr * ch
    cols = Math.ceil((W - ox) / cw) + 1
    rows = Math.ceil((Hh - oy) / ch) + 1

    font = `600 ${f}px "JetBrains Mono", ui-monospace, monospace`
    farF = f * 0.62
    farCw = farF * 0.6
    farCh = Math.round(farF * 1.3)
    farFont = `500 ${farF}px "JetBrains Mono", ui-monospace, monospace`

    const ar = o.avoid?.getBoundingClientRect()
    const a0 = ar ? ar.left - hr.left - 24 : -1
    const a1 = ar ? ar.right - hr.left + 24 : -1
    const a2 = ar ? ar.top - hr.top - 24 : -1
    const a3 = ar ? ar.bottom - hr.top + 24 : -1
    // behind the copy the rain thins out, so the name and the lede stay easy to read
    alphaAt = (x: number, y: number) => {
      if (!ar) return 1
      const d = Math.max(a0 - x, x - a1, a2 - y, y - a3, 0)
      return d > 90 ? 1 : 0.2 + (d / 90) * 0.8
    }

    near = Array.from({ length: cols }, () => newDrop(false))
    far = Array.from({ length: Math.ceil(W / (farCw * 1.7)) }, (_, j) => ({ ...newDrop(false), x: j * farCw * 1.7 + farCw * 0.4, v: 0.25 + Math.random() * 0.35 }))

    rc.fillStyle = C.bg
    rc.fillRect(0, 0, W, Hh)
    rc.textBaseline = "middle"
    fc.textBaseline = "middle"
    if (reduce) paintStill()
    redrawScreen()
  }

  /** Reduced motion: a still field of characters, the screen assembled. */
  function paintStill() {
    rc.font = font
    rc.fillStyle = C.trail
    for (let i = 0; i < cols; i++) for (let r = 0; r < rows; r++) {
      if (Math.random() > 0.35) continue
      rc.globalAlpha = (0.15 + Math.random() * 0.5) * alphaAt(ox + i * cw, oy + r * ch)
      rc.fillText(glyph(), ox + i * cw, oy + r * ch + ch / 2)
    }
    rc.globalAlpha = 1
    state.fill(1)
  }

  /* screen drawing (device px, snapped so cells never show seams) */
  const cx = (c: number) => Math.round(c * cw * dpr)
  const cy = (r: number) => Math.round(r * ch * dpr)
  function drawCell(i: number) {
    const c = i % GC
    const r = (i / GC) | 0
    const x0 = cx(c), x1 = cx(c + 1), y0 = cy(r), y1 = cy(r + 1)
    if (state[i] === 0) { fc.clearRect(x0, y0, x1 - x0, y1 - y0); return }
    fc.fillStyle = C.cell
    fc.fillRect(x0, y0, x1 - x0, y1 - y0)
    const face = state[i] === 2 || lens.has(i) ? CODE : SCREEN
    const p = face[r][c]
    if (p.ch === " ") return
    fc.fillStyle = hot[i] ? C.head : p.c
    fc.fillText(p.ch, x0, (y0 + y1) / 2)
  }
  function redrawScreen() {
    fc.setTransform(1, 0, 0, 1, 0, 0)
    fc.font = `600 ${f * dpr}px "JetBrains Mono", ui-monospace, monospace`
    fc.clearRect(0, 0, o.fg.width, o.fg.height)
    for (let i = 0; i < N; i++) if (state[i]) drawCell(i)
  }
  const flash = (i: number, t = 3) => { if (!hot[i]) hotList.push(i); hot[i] = t; drawCell(i) }
  function lock(i: number) {
    if (state[i]) return
    state[i] = 1
    flash(i)
  }

  function setPhase(p: Phase) {
    phase = p
    phaseAt = clock
    o.onPhase?.(p)
    if (p === "build") { state.fill(0); hot.fill(0); hotList = []; redrawScreen(); shuffle() }
    if (p === "screen") for (let i = 0; i < N; i++) lock(i)
    if (p === "xray") { scanCol = -1; clearLens() }
    if (p === "release") shuffle()
    o.lens?.classList.toggle("on", false)
  }

  /* one frame of the rain + whatever the screen needs this frame */
  function frame(dt: number) {
    clock += dt
    const t = clock - phaseAt
    const k = Math.min(1, t / DUR[phase])

    rc.globalAlpha = 1
    rc.fillStyle = C.fade
    rc.fillRect(0, 0, W, Hh)

    // the far layer: small, dim, slower
    rc.font = farFont
    rc.fillStyle = C.far
    for (const d of far) {
      d.acc += d.v
      while (d.acc >= 1) {
        d.acc -= 1
        d.y += 1
        if (d.y > Hh / farCh + 4) { d.y = -Math.floor(Math.random() * 30); d.v = 0.25 + Math.random() * 0.35 }
        rc.globalAlpha = 0.6 * alphaAt(d.x, d.y * farCh)
        rc.fillText(glyph(), d.x, d.y * farCh)
      }
    }

    // the near layer: one column per screen column, bright heads
    rc.font = font
    for (let i = 0; i < cols; i++) {
      const d = near[i]
      d.acc += d.v
      if (d.acc < 1) continue
      const x = ox + i * cw
      while (d.acc >= 1) {
        d.acc -= 1
        const y = oy + d.y * ch
        const a = alphaAt(x + cw / 2, y)
        if (d.y >= 0) {
          rc.globalAlpha = 1
          rc.fillStyle = C.bg
          rc.fillRect(x, y, cw, ch)
          rc.globalAlpha = a
          rc.fillStyle = C.trail
          rc.fillText(d.prev, x, y + ch / 2)
        }
        d.y += 1
        if (d.y > rows + 3) { Object.assign(d, newDrop(true)); break }
        d.prev = glyph()
        rc.globalAlpha = alphaAt(x + cw / 2, y + ch)
        rc.fillStyle = C.head
        rc.fillText(d.prev, x, oy + d.y * ch + ch / 2)
        if (phase === "build") {
          const c = i - zc
          const r = d.y - zr
          if (c >= 0 && c < GC && r >= 0 && r < GR) lock(r * GC + c)
        }
      }
    }

    // the screen
    if (hotList.length) {
      const still: number[] = []
      for (const i of hotList) { hot[i]--; if (hot[i]) still.push(i); else drawCell(i) }
      hotList = still
    }
    if (phase === "build") {
      // the rain does most of the work; this makes sure the screen is whole on time
      const want = Math.floor(N * k * k)
      let locked = 0
      for (let i = 0; i < N; i++) if (state[i]) locked++
      while (locked < want && cursor < N) { const i = order[cursor++]; if (!state[i]) { lock(i); locked++ } }
    } else if (phase === "screen") {
      if (Math.random() < 0.5) flash(order[(Math.random() * N) | 0], 2)
    } else if (phase === "xray") {
      // everything left of the sweep turns to code; the strip around the old
      // sweep is repainted so its glow never smears
      const col = Math.min(GC, Math.floor(k * (GC + 1)))
      for (let c = Math.max(0, scanCol - 1); c <= Math.min(GC - 1, col + 1); c++) {
        for (let r = 0; r < GR; r++) { const i = r * GC + c; if (c < col) state[i] = 2; drawCell(i) }
      }
      scanCol = col
      if (col < GC) {
        const x0 = cx(col)
        fc.fillStyle = "rgba(163,230,53,.22)"
        fc.fillRect(x0 - 6 * dpr, 0, 14 * dpr, o.fg.height)
        fc.fillStyle = C.scan
        fc.fillRect(x0, 0, Math.max(2, 2.5 * dpr), o.fg.height)
      }
    } else if (phase === "release") {
      const want = Math.floor(N * k)
      while (cursor < want) {
        const i = order[cursor++]
        if (!state[i]) continue
        const face = state[i] === 2 ? CODE : SCREEN
        state[i] = 0
        drawCell(i)
        // the cell's character falls away with the rain
        const c = i % GC
        const r = (i / GC) | 0
        const d = near[zc + c]
        if (d && (d.y < zr + r - 6 || d.y > zr + r + 2) && Math.random() < 0.35) {
          d.y = zr + r
          d.prev = face[r][c].ch.trim() || glyph()
          d.v = 0.7 + Math.random() * 0.4
        }
      }
    }
    if (t >= DUR[phase]) setPhase(NEXT[phase])
  }

  /* the lens: look under the screen (desktop, while the screen is up) */
  function clearLens() {
    const old = lens
    lens = new Set()
    for (const i of old) drawCell(i)
  }
  const onMove = (e: PointerEvent) => {
    if (phase !== "screen" && !reduce) return
    const r = o.fg.getBoundingClientRect()
    const px = e.clientX - r.left
    const py = e.clientY - r.top
    const pc = px / cw
    const pr = py / ch
    const ry = 3.4
    const rx = (ry * ch) / cw
    const next = new Set<number>()
    for (let rr = Math.floor(pr - ry); rr <= Math.ceil(pr + ry); rr++) {
      if (rr < 0 || rr >= GR) continue
      for (let c = Math.floor(pc - rx); c <= Math.ceil(pc + rx); c++) {
        if (c < 0 || c >= GC) continue
        const dx = (c + 0.5 - pc) / rx
        const dy = (rr + 0.5 - pr) / ry
        if (dx * dx + dy * dy <= 1) next.add(rr * GC + c)
      }
    }
    const old = lens
    lens = next
    for (const i of old) if (!next.has(i)) drawCell(i)
    for (const i of next) if (!old.has(i)) drawCell(i)
    if (o.lens) {
      o.lens.classList.add("on")
      o.lens.style.width = o.lens.style.height = `${ry * 2 * ch}px`
      o.lens.style.transform = `translate(${px + r.left - o.zone.getBoundingClientRect().left}px, ${py + r.top - o.zone.getBoundingClientRect().top}px) translate(-50%, -50%)`
    }
  }
  const onLeave = () => { clearLens(); o.lens?.classList.remove("on") }

  /* running only while visible */
  let raf = 0
  let last = 0
  let acc = 0
  let visible = false
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop)
    const dt = Math.min(100, now - (last || now))
    last = now
    acc += dt
    if (acc < 33) return // ~30 frames a second is plenty for falling characters
    frame(acc)
    acc = 0
  }
  const run = () => {
    const go = visible && !document.hidden && !reduce
    if (go && !raf) { last = 0; raf = requestAnimationFrame(loop) }
    if (!go && raf) { cancelAnimationFrame(raf); raf = 0 }
  }
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; run() }, { threshold: 0.05 })
  const onVis = () => run()

  let resizeT = 0
  let firstResize = true // observing fires once at once; the layout is already fresh
  const ro = new ResizeObserver(() => {
    if (firstResize) { firstResize = false; return }
    clearTimeout(resizeT)
    resizeT = window.setTimeout(layout, 150)
  })

  let disposed = false
  const start = () => {
    if (disposed) return
    layout()
    if (reduce) o.onPhase?.("screen")
    else setPhase("build")
    io.observe(o.host)
    ro.observe(o.host)
    document.addEventListener("visibilitychange", onVis)
    if (fine) {
      o.fg.addEventListener("pointermove", onMove)
      o.fg.addEventListener("pointerleave", onLeave)
    }
  }
  // Draw with the code face once it's loaded (the screen is mostly box lines and digits).
  const fontsReady = document.fonts?.load(`600 16px "JetBrains Mono"`).catch(() => undefined) ?? Promise.resolve()
  void Promise.race([fontsReady, new Promise((r) => setTimeout(r, 1200))]).then(start)

  return () => {
    disposed = true
    cancelAnimationFrame(raf)
    io.disconnect()
    ro.disconnect()
    clearTimeout(resizeT)
    document.removeEventListener("visibilitychange", onVis)
    o.fg.removeEventListener("pointermove", onMove)
    o.fg.removeEventListener("pointerleave", onLeave)
    rain.remove()
  }
}
