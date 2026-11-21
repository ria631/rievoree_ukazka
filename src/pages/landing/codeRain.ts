/**
 * The hero's living code: a rain of characters taken from this repo's own
 * source falls through the hero. On the right, money forms out of it — a
 * €500 note and coins, every part a character — and then turns into the code
 * that handles it, in the order the system does: the bank line it arrived as,
 * the check, the booking into the ledger, the policy that keeps it private,
 * the report it ends up in. Real statements from the migrations. Then it
 * falls back into the rain, and again.
 *
 * Cost, on purpose: one 2D canvas for the rain at 1× pixel ratio, ~30 frames
 * a second, each frame a translucent fill plus one glyph per falling column;
 * the money/code has its own small canvas, redrawn only in the cells that
 * change. Nothing runs while the hero is off screen or the tab is hidden.
 * Reduced motion: one still frame with the note.
 */
import { KEYWORDS, SRC, excerpt } from "./repoSource"
// Only this lazy chunk needs these two migrations (the check and the booking).
import etlSql from "../../../supabase/migrations/20260607000002_etl_transform.sql?raw"
import loadSql from "../../../supabase/migrations/20261031000001_sheet_link_months.sql?raw"

export type Phase = "build" | "money" | "morph" | "code" | "release" | "rain"

export interface CodeRainOpts {
  host: HTMLElement // the hero: the rain covers it
  zone: HTMLElement // where the money forms
  fg: HTMLCanvasElement // its own canvas, inside zone
  avoid?: HTMLElement // the hero copy: the rain thins out behind it
  lens?: HTMLElement // a ring that follows the pointer over the note
  onPhase?: (p: Phase) => void
}

const GC = 50 // columns
const GR = 23 // rows
const DUR: Record<Phase, number> = { build: 3000, money: 3000, morph: 2600, code: 4800, release: 1500, rain: 1200 }
const NEXT: Record<Phase, Phase> = { build: "money", money: "morph", morph: "code", code: "release", release: "rain", rain: "build" }

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
  teal: "#5DCFDA",
  dim: "#5E9384",
  plain: "#E4F2EC",
  red: "#F59186",
  // the money
  note: "#0B2A1A",
  noteEdge: "#5FB64A",
  noteBack: "#3C7A4C",
  guill: "#2F6E3F",
  star: "#E8C55A",
  digit: "#C9F46E",
  coinEdge: "#D9B44A",
  coinInk: "#2A2008",
}

/* ───────────── faces: what each cell shows, as character grids ───────────── */

type Paint = { ch: string; c: string; bg?: string }
type Seg = [string, string]
const blank = (): Paint => ({ ch: " ", c: C.label })
const len = (segs: Seg[]) => segs.reduce((n, [t]) => n + [...t].length, 0)

/** The money: a €500 note on top of another, four coins and the month's total. */
function moneyFace(): Paint[][] {
  const g: Paint[][] = Array.from({ length: GR }, () => Array.from({ length: GC }, blank))
  const put = (x: number, y: number, ch: string, c: string, bg?: string) => {
    if (x < 0 || y < 0 || x >= GC || y >= GR) return
    g[y][x] = { ch, c, bg: bg ?? g[y][x].bg }
  }
  const text = (x: number, y: number, s: string, c: string) => [...s].forEach((ch, i) => put(x + i, y, ch, c))
  const note = (x0: number, y0: number, x1: number, y1: number, edge: string, fill: string) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const top = y === y0, bot = y === y1, l = x === x0, r = x === x1
      const ch = top && l ? "╔" : top && r ? "╗" : bot && l ? "╚" : bot && r ? "╝" : top || bot ? "═" : l || r ? "║" : " "
      put(x, y, ch, edge, fill)
    }
  }
  // the note underneath, peeking out
  note(4, 0, 49, 12, C.noteBack, C.note)
  // the €500 note
  const X0 = 0, Y0 = 2, X1 = 45, Y1 = 14
  note(X0, Y0, X1, Y1, C.noteEdge, C.note)
  // guilloche: fine waves across the paper
  for (let y = Y0 + 1; y < Y1; y++) for (let x = X0 + 1; x < X1; x++) {
    const v = Math.sin(x * 0.42 + y * 1.1) + Math.sin(x * 0.13 - y * 0.7) * 0.6
    if (v > 1.25) put(x, y, "~", C.guill)
    else if (v > 1.0) put(x, y, "·", C.guill)
  }
  // a ring of twelve stars around the €
  const cx = 11, cy = Y0 + 6
  for (let y = cy - 2; y <= cy + 2; y++) for (let x = cx - 4; x <= cx + 4; x++) put(x, y, " ", C.star)
  for (let s = 0; s < 12; s++) {
    const a = (s / 12) * Math.PI * 2
    put(Math.round(cx + Math.cos(a) * 6.2), Math.round(cy + Math.sin(a) * 3.3), "★", C.star)
  }
  put(cx, cy, "€", C.digit)
  // a big 500 in blocks
  const DIG: Record<string, string[]> = {
    "5": ["█████", "█    ", "████ ", "    █", "████ "],
    "0": [" ███ ", "█   █", "█   █", "█   █", " ███ "],
  }
  ;["5", "0", "0"].forEach((d, i) => DIG[d].forEach((rowS, ry) => [...rowS].forEach((chr, rx) => { if (chr !== " ") put(23 + i * 6 + rx, Y0 + 3 + ry, "█", C.digit) })))
  text(X0 + 2, Y0 + 1, "€500", C.num)
  text(X1 - 5, Y0 + 1, "€500", C.num)
  text(24, Y0 + 9, "E U R O", C.noteEdge)
  text(X0 + 2, Y1 - 1, "X 0426 1958 7302", C.guill)
  text(X1 - 9, Y1 - 1, "2026 · €", C.guill)

  // four coins: solid gold, rounded by half blocks top and bottom
  const coin = (x: number, y: number, face: string) => {
    for (let rx = 1; rx < 6; rx++) { put(x + rx, y, "▄", C.coinEdge); put(x + rx, y + 3, "▀", C.coinEdge) }
    for (let ry = 1; ry < 3; ry++) for (let rx = 0; rx < 7; rx++) put(x + rx, y + ry, " ", C.coinInk, C.coinEdge)
    put(x + 3, y + 1, "€", C.coinInk)
    ;[...face].forEach((chr, k) => put(x + 3 - (face.length > 1 ? 1 : 0) + k, y + 2, chr, C.coinInk))
  }
  coin(1, 17, "2")
  coin(9, 18, "1")
  coin(17, 17, "50")
  coin(25, 18, "20")
  // the month's total beside them, on a dark backing so the rain never runs through it
  const label = (x: number, y: number, s2: string, c: string) => [...s2.padEnd(13)].forEach((chr, k) => put(x + k, y, chr, c, C.bg))
  label(35, 17, " RENT · SEP", C.label)
  label(35, 18, " €501,377", C.num)
  label(35, 19, " 4 companies", C.dim)
  label(35, 20, "", C.dim)
  label(35, 21, " ↓ into code", C.bar)
  return g
}

/* the code face: the same money, as the system handles it */
const B = C.border
const H = "─"
function line(segs: Seg[], bg = C.cell): Paint[] {
  const out: Paint[] = []
  for (const [t, c] of segs) for (const chr of t) out.push({ ch: chr, c, bg })
  while (out.length < GC) out.push({ ch: " ", c: C.label, bg })
  return out.slice(0, GC)
}
const row = (inner: Seg[]) => line([["│", B], ...inner, [" ".repeat(Math.max(0, GC - 2 - len(inner))), B], ["│", B]])
const lr = (left: Seg[], right: Seg[]) => row([...left, [" ".repeat(Math.max(1, GC - 2 - len(left) - len(right))), B], ...right])
const edge = (l: string, r: string) => line([[l + H.repeat(GC - 2) + r, B]])
const labelSep = (label: string, c: string) => line([["├─ ", B], [label, c], [" " + H.repeat(Math.max(0, GC - 5 - label.length - 1)), B], ["┤", B]])

/** One line of code → coloured segments: keywords lime, strings teal, comments dim, numbers bright. */
function highlight(src: string): Seg[] {
  const out: Seg[] = []
  for (const m of src.matchAll(/(--.*$)|('[^']*'|"[^"]*")|([A-Za-z_][A-Za-z0-9_]*)|(\d[\d.,]*)|(\s+)|(.)/g)) {
    if (m[1]) out.push([m[1], C.dim])
    else if (m[2]) out.push([m[2], C.teal])
    else if (m[3]) out.push([m[3], KEYWORDS.has(m[3].toLowerCase()) ? C.bar : C.plain])
    else if (m[4]) out.push([m[4], C.digit])
    else out.push([m[0], m[5] ? B : C.label])
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
/** Real lines, their common indent removed, wrapped to the face, exactly n rows. */
function codeRows(lines: string[], n: number): Paint[][] {
  const ind = Math.min(...lines.filter((l) => l.trim()).map((l) => l.length - l.trimStart().length))
  const wrapped = lines.map((l) => l.slice(Number.isFinite(ind) ? ind : 0)).flatMap((l) => wrap(l, GC - 4)).slice(0, n)
  while (wrapped.length < n) wrapped.push("")
  return wrapped.map((l) => row([[" ", B], ...highlight(l)]))
}

function codeFace(): Paint[][] {
  const zscore = excerpt(etlSql, "v_threshold := coalesce", "v_threshold := coalesce").split("\n")
  const load = excerpt(loadSql, "insert into public.journal_entries", "(entity_id, account_id").split("\n")
  const policy = SRC.rls.split("\n").filter((l) => /create policy|or id in/.test(l))
  const view = SRC.report.split("\n").filter((l) => /^(create view|from |\s+or )/.test(l))
  return [
    edge("┌", "┐"),
    lr([[" €500", C.digit], [" · rent · Danube Office Park", C.label]], [["as code", C.bar], [" ", B]]),
    labelSep("1 · THE BANK LINE IT CAME IN AS", C.bar),
    row([[" 2026-09-03", C.teal], [";", B], ["Danube Office Park", C.plain], [";", B], ["rent 09/26", C.plain], [";", B], ["500,00", C.digit]]),
    labelSep("2 · CHECKED AGAINST ITS HISTORY", C.bar),
    ...codeRows(zscore, 2),
    labelSep("3 · BOOKED INTO THE LEDGER", C.bar),
    ...codeRows(load, 3),
    labelSep("4 · VISIBLE ONLY TO ITS OWNERS", C.red),
    ...codeRows(policy, 3),
    labelSep("5 · AND INTO THE REPORT", C.bar),
    ...codeRows(view, 4),
    row([[" → ", C.bar], ["REVENUE ", C.label], ["€501,377", C.num], ["  ·  ", B], ["NOI ", C.label], ["€372,911", C.num]]),
    row([[" ✓ checked · booked · private · reported", C.up]]),
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
  const MONEY = moneyFace()
  const CODE = codeFace()
  const N = GC * GR
  // which cells the money occupies (the rest stays clear, so the rain shows around it)
  const solid = new Uint8Array(N)
  for (let i = 0; i < N; i++) { const p = MONEY[(i / GC) | 0][i % GC]; solid[i] = p.ch !== " " || p.bg ? 1 : 0 }
  const solidCount = solid.reduce((a, b) => a + b, 0)

  const rain = document.createElement("canvas")
  rain.className = "cr-rain"
  rain.setAttribute("aria-hidden", "true")
  o.host.prepend(rain)
  const rc0 = rain.getContext("2d", { alpha: false })
  const fc0 = o.fg.getContext("2d")
  if (!rc0 || !fc0) { rain.remove(); return () => {} }
  const rc = rc0
  const fc = fc0

  // geometry (CSS px for the rain, device px for the money/code)
  let W = 0, Hh = 0, f = 16, cw = 9.6, ch = 21, ox = 0, oy = 0, cols = 0, rows = 0, zc = 0, zr = 0
  let dpr = 1, font = "", farFont = "", farF = 10, farCw = 6, farCh = 13
  type Drop = { y: number; v: number; acc: number; prev: string }
  let near: Drop[] = []
  let far: (Drop & { x: number })[] = []
  let alphaAt: (x: number, y: number) => number = () => 1

  // cells
  const state = new Uint8Array(N) // 0 empty · 1 money · 2 code
  const hot = new Uint8Array(N) // frames left of a bright flash
  let hotList: number[] = []
  let lens = new Set<number>()
  let shine = new Set<number>()
  let order: number[] = []
  let cursor = 0
  const delay = new Float32Array(N) // morph: when each cell starts turning
  const MORPH_CELL = 260 // ms a cell spends scrambling before it settles

  let phase: Phase = "build"
  let clock = 0
  let phaseAt = 0

  const shuffle = (pick: (i: number) => boolean = () => true) => {
    order = Array.from({ length: N }, (_, i) => i).filter(pick)
    for (let i = order.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [order[i], order[j]] = [order[j], order[i]] }
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

    // the rain's grid lines up with the cells
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

    // behind the copy the rain thins out, so the name and the lede stay easy to read
    const ar = o.avoid?.getBoundingClientRect()
    const a0 = ar ? ar.left - hr.left - 24 : 0
    const a1 = ar ? ar.right - hr.left + 24 : 0
    const a2 = ar ? ar.top - hr.top - 24 : 0
    const a3 = ar ? ar.bottom - hr.top + 24 : 0
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
    redrawAll()
  }

  /** Reduced motion: a still field of characters and the note. */
  function paintStill() {
    rc.font = font
    rc.fillStyle = C.trail
    for (let i = 0; i < cols; i++) for (let r = 0; r < rows; r++) {
      if (Math.random() > 0.35) continue
      rc.globalAlpha = (0.15 + Math.random() * 0.5) * alphaAt(ox + i * cw, oy + r * ch)
      rc.fillText(glyph(), ox + i * cw, oy + r * ch + ch / 2)
    }
    rc.globalAlpha = 1
    for (let i = 0; i < N; i++) state[i] = solid[i]
  }

  /* drawing a cell (device px, snapped so neighbouring cells never show seams) */
  const cx = (c: number) => Math.round(c * cw * dpr)
  const cy = (r: number) => Math.round(r * ch * dpr)
  function paintCell(i: number, p: Paint | null, color?: string) {
    const c = i % GC
    const r = (i / GC) | 0
    const x0 = cx(c), x1 = cx(c + 1), y0 = cy(r), y1 = cy(r + 1)
    fc.clearRect(x0, y0, x1 - x0, y1 - y0)
    if (!p) return
    if (p.bg) { fc.fillStyle = p.bg; fc.fillRect(x0, y0, x1 - x0, y1 - y0) }
    if (p.ch === " ") return
    fc.fillStyle = color ?? p.c
    fc.fillText(p.ch, x0, (y0 + y1) / 2)
  }
  function drawCell(i: number) {
    const r = (i / GC) | 0
    const c = i % GC
    if (state[i] === 0) return paintCell(i, null)
    const showCode = state[i] === 2 || lens.has(i)
    const p = showCode ? CODE[r][c] : MONEY[r][c]
    paintCell(i, p, hot[i] ? C.head : !showCode && shine.has(i) && p.ch !== " " ? C.head : undefined)
  }
  function redrawAll() {
    fc.setTransform(1, 0, 0, 1, 0, 0)
    fc.font = `600 ${f * dpr}px "JetBrains Mono", ui-monospace, monospace`
    fc.clearRect(0, 0, o.fg.width, o.fg.height)
    for (let i = 0; i < N; i++) if (state[i]) drawCell(i)
  }
  const flash = (i: number, t = 3) => { if (!hot[i]) hotList.push(i); hot[i] = t; drawCell(i) }
  function lock(i: number) {
    if (state[i] || !solid[i]) return
    state[i] = 1
    flash(i)
  }

  function setPhase(p: Phase) {
    phase = p
    phaseAt = clock
    o.onPhase?.(p)
    if (p === "build") { state.fill(0); hot.fill(0); hotList = []; redrawAll(); shuffle((i) => !!solid[i]) }
    if (p === "money") for (let i = 0; i < N; i++) lock(i)
    if (p === "morph") {
      clearLens()
      clearShine()
      // a wave out from the € in the stars, with a little grain so it reads as dissolving
      const ec = 11, er = 8
      let maxD = 0
      for (let i = 0; i < N; i++) {
        const dx = (i % GC) - ec
        const dy = (((i / GC) | 0) - er) * 2.1
        delay[i] = Math.hypot(dx, dy) + Math.random() * 6
        maxD = Math.max(maxD, delay[i])
      }
      const span = DUR.morph - MORPH_CELL - 100
      for (let i = 0; i < N; i++) delay[i] = (delay[i] / maxD) * span
    }
    if (p === "release") shuffle((i) => !!state[i])
    o.lens?.classList.remove("on")
  }

  /* one frame: the rain, then whatever the cells need */
  function frame(dt: number) {
    clock += dt
    const t = clock - phaseAt
    const k = Math.min(1, t / DUR[phase])

    rc.globalAlpha = 1
    rc.fillStyle = C.fade
    rc.fillRect(0, 0, W, Hh)

    // far layer: small, dim, slower
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

    // near layer: one column per cell column, bright heads
    rc.font = font
    for (let i = 0; i < cols; i++) {
      const d = near[i]
      d.acc += d.v
      if (d.acc < 1) continue
      const x = ox + i * cw
      while (d.acc >= 1) {
        d.acc -= 1
        const y = oy + d.y * ch
        if (d.y >= 0) {
          rc.globalAlpha = 1
          rc.fillStyle = C.bg
          rc.fillRect(x, y, cw, ch)
          rc.globalAlpha = alphaAt(x + cw / 2, y)
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

    // the cells
    if (hotList.length) {
      const still: number[] = []
      for (const i of hotList) { hot[i]--; if (hot[i]) still.push(i); else drawCell(i) }
      hotList = still
    }
    if (phase === "build") {
      // the rain does most of it; this makes sure the money is whole on time
      const want = Math.floor(solidCount * k * k)
      let locked = 0
      for (let i = 0; i < N; i++) if (state[i]) locked++
      while (locked < want && cursor < order.length) { const i = order[cursor++]; if (!state[i]) { lock(i); locked++ } }
    } else if (phase === "money") {
      // a glint crosses the note now and then
      const p = ((t % 2200) / 2200) * (GC + GR * 2 + 20) - 10
      const next = new Set<number>()
      for (let r = 0; r < GR; r++) for (let c = 0; c < GC; c++) {
        const i = r * GC + c
        if (solid[i] && Math.abs(c + r * 2 - p) < 1.6) next.add(i)
      }
      const old = shine
      shine = next
      for (const i of old) if (!next.has(i)) drawCell(i)
      for (const i of next) if (!old.has(i)) drawCell(i)
    } else if (phase === "morph") {
      // each cell scrambles through code characters, then settles into its line
      for (let i = 0; i < N; i++) {
        if (state[i] === 2 || t < delay[i]) continue
        const r = (i / GC) | 0
        const c = i % GC
        if (t >= delay[i] + MORPH_CELL) { state[i] = 2; drawCell(i); continue }
        if (!state[i]) state[i] = 1 // the empty cells around the money join in too
        paintCell(i, { ch: glyph(), c: C.head, bg: CODE[r][c].bg }, (t - delay[i]) / MORPH_CELL > 0.5 ? C.bar : C.head)
      }
    } else if (phase === "release") {
      const want = Math.floor(order.length * k)
      while (cursor < want) {
        const i = order[cursor++]
        if (!state[i]) continue
        const face = state[i] === 2 ? CODE : MONEY
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

  function clearShine() {
    const old = shine
    shine = new Set()
    for (const i of old) drawCell(i)
  }

  /* the lens: look under the money (desktop, while the note is up) */
  const unlens = (i: number) => { if (state[i] === 1 && !solid[i]) state[i] = 0; drawCell(i) }
  function clearLens() {
    const old = lens
    lens = new Set()
    for (const i of old) unlens(i)
  }
  const onMove = (e: PointerEvent) => {
    if (phase !== "money" && !reduce) return
    const r = o.fg.getBoundingClientRect()
    const pc = (e.clientX - r.left) / cw
    const pr = (e.clientY - r.top) / ch
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
    // under the lens every cell shows its code, even where there's no money
    const old = lens
    lens = next
    for (const i of old) if (!next.has(i)) unlens(i)
    for (const i of next) if (!old.has(i)) { if (!state[i]) state[i] = 1; drawCell(i) }
    if (o.lens) {
      const z = o.zone.getBoundingClientRect()
      o.lens.classList.add("on")
      o.lens.style.width = o.lens.style.height = `${ry * 2 * ch}px`
      o.lens.style.transform = `translate(${e.clientX - z.left}px, ${e.clientY - z.top}px) translate(-50%, -50%)`
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
  let firstResize = true // observing fires once straight away; the layout is already fresh
  const ro = new ResizeObserver(() => {
    if (firstResize) { firstResize = false; return }
    clearTimeout(resizeT)
    resizeT = window.setTimeout(layout, 150)
  })

  let disposed = false
  const start = () => {
    if (disposed) return
    layout()
    if (reduce) o.onPhase?.("money")
    else setPhase("build")
    io.observe(o.host)
    ro.observe(o.host)
    document.addEventListener("visibilitychange", onVis)
    if (fine) {
      o.fg.addEventListener("pointermove", onMove)
      o.fg.addEventListener("pointerleave", onLeave)
    }
  }
  // Draw with the code face once it's loaded.
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
