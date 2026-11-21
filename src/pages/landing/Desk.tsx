import { useEffect, useRef, type CSSProperties } from "react"
import "./desk.css"

/**
 * The desk — a top-down month-end scene for "How it works": three companies'
 * spreadsheets land, an X-ray beam checks them (one row is held for a person),
 * a stamp marks each one private to its own people, and the portfolio report
 * builds itself beside them. Then an X-ray sweep turns the desk to film and
 * shows the skeleton underneath: the real tables, functions, jobs and policies
 * that did each of those things. Plain HTML + SVG, animated by CSS on the act
 * classes HowItWorks sets (a1…a5, out, skip); see desk.css.
 *
 * Everything is placed on a 1200 × 560 grid of desk units, so the whole scene
 * scales as one picture. Decorative: the steps below carry the meaning.
 */

/** x, y, width, height in desk units; rotation; parallax depth. */
const at = (x: number, y: number, w: number, h: number, r = 0, z = 1, extra?: Record<string, string | number>): CSSProperties =>
  ({ "--x": x, "--y": y, "--w": w, "--h": h, "--r": `${r}deg`, "--z": z, ...extra }) as CSSProperties

function rng(seed: number) {
  let s = seed
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
}

/* ───────────── a spreadsheet: header, column letters, ten rows of figures ───────────── */

const COLS = [{ x: 30, w: 66 }, { x: 102, w: 44 }, { x: 150, w: 42 }, { x: 196, w: 38 }]
const ROW0 = 58
const ROW_H = 23
const ROWS = 10

/** A figure the check flags (red), then clears (green) as the beam passes it. */
type Flag = { row: number; col: number; at: number }

function Sheet({ name, seed, flags = [], held, clip }: { name: string; seed: number; flags?: Flag[]; held?: number; clip?: boolean }) {
  const r = rng(seed)
  const cells = []
  for (let i = 0; i < ROWS; i++) {
    for (let c = 0; c < COLS.length; c++) {
      const y = ROW0 + i * ROW_H
      const col = COLS[c]
      const f = flags.find((g) => g.row === i && g.col === c)
      if (f) {
        const cx = col.x + col.w - 8
        cells.push(
          <g key={`${i}.${c}`} className="flag" style={{ "--dl": `${f.at}s` } as CSSProperties}>
            <rect className="fbg" x={col.x - 3} y={y} width={col.w + 3} height={ROW_H} />
            <rect className="fbar" x={col.x + 2} y={y + 9} width={col.w - 20} height={5} rx={2} />
            <g className="x"><circle cx={cx} cy={y + 11.5} r={5.2} /><path d={`M${cx} ${y + 8.4}v3.4m0 2.2v.3`} /></g>
            <g className="v"><circle cx={cx} cy={y + 11.5} r={5.2} /><path d={`M${cx - 2.4} ${y + 11.6}l1.7 1.8l3.3-3.7`} /></g>
          </g>,
        )
      } else {
        // Names sit left, figures sit right — like a real sheet.
        const w = col.w * (c === 0 ? 0.5 + r() * 0.45 : 0.35 + r() * 0.5)
        cells.push(<rect key={`${i}.${c}`} className="cell" x={c === 0 ? col.x + 2 : col.x + col.w - 4 - w} y={y + 9} width={w} height={5} rx={2} />)
      }
    }
  }
  return (
    <svg viewBox="0 0 240 310">
      <rect className="hd" width="240" height="30" />
      <rect className="ico" x="10" y="8" width="14" height="14" rx="3" />
      <path className="ico-x" d="M13.6 11.6l6.8 6.8m0-6.8l-6.8 6.8" />
      <text className="fn" x="31" y="19.6">{name}</text>
      <rect className="ch" y="36" width="240" height="18" />
      {["A", "B", "C", "D"].map((l, i) => <text key={l} className="cl" x={COLS[i].x + COLS[i].w / 2} y="48.6">{l}</text>)}
      {held != null && <rect className="held" y={ROW0 + held * ROW_H} width="240" height={ROW_H} />}
      {Array.from({ length: ROWS + 1 }, (_, i) => <line key={i} className="gl" x1="0" x2="240" y1={ROW0 + i * ROW_H} y2={ROW0 + i * ROW_H} />)}
      {COLS.map((c) => <line key={c.x} className="gl" x1={c.x - 3} x2={c.x - 3} y1="36" y2={ROW0 + ROWS * ROW_H} />)}
      {Array.from({ length: ROWS }, (_, i) => <text key={i} className="rn" x="14" y={ROW0 + i * ROW_H + 15}>{i + 2}</text>)}
      {cells}
      {clip && <path className="clip" d="M168 -8v36a7 7 0 0 0 14 0v-31a4 4 0 0 0-8 0v27" />}
    </svg>
  )
}

/* ───────────── the report: KPIs that count up, bars, the NOI line, a donut, a table ───────────── */

const REV = [96, 101, 98, 106, 112, 118]
const COST = [31, 33, 30, 32, 31, 34]
const MONTHS = ["Apr", "May", "Jun", "Jul", "Aug", "Sep"]
const BASE = 168
const gx = (g: number) => 30 + g * 30
const NOI_PTS = REV.map((v, g) => `${gx(g) + 11.5},${BASE - (v - COST[g]) * 0.95}`)
// Company shares of revenue (supabase/seed.sql's four buildings), in % of the ring.
const SHARE = [
  { name: "Danube Office Park", pct: 38, val: "€188k", cls: "c1" },
  { name: "Riverside Retail Park", pct: 27, val: "€139k", cls: "c2" },
  { name: "Lindenhof Residences", pct: 21, val: "€104k", cls: "c3" },
  { name: "Westgate Logistics Hub", pct: 14, val: "€70k", cls: "c4" },
]

function Report() {
  let cum = 0
  return (
    <>
      <div className="rp-head"><b>Portfolio report</b><span>Sep 2026</span><i /></div>
      <div className="rp-kpis">
        <div><span>Revenue</span><b className="cnt" data-pre="€" data-suf="k" style={{ "--to": 501 } as CSSProperties} /></div>
        <div>
          <span>NOI</span><b className="cnt" data-pre="€" data-suf="k" style={{ "--to": 373 } as CSSProperties} />
          <svg className="ul" viewBox="0 0 100 10" preserveAspectRatio="none"><path d="M2 6C20 2.5 38 8.5 58 5S88 3.5 98 6" pathLength={1} /></svg>
        </div>
        <div><span>Occupancy</span><b className="cnt" data-pre="" data-suf="%" style={{ "--to": 88 } as CSSProperties} /></div>
      </div>
      <svg className="rp-chart" viewBox="0 0 330 300">
        {[48, 88, 128, BASE].map((y) => <line key={y} className="gr" x1="20" x2="208" y1={y} y2={y} />)}
        {REV.map((v, g) => (
          <g key={g}>
            <rect className="bar rev" x={gx(g)} y={BASE - v} width="11" height={v} rx="1.5" style={{ "--dl": `${0.75 + g * 0.06}s` } as CSSProperties} />
            <rect className="bar cost" x={gx(g) + 12} y={BASE - COST[g]} width="11" height={COST[g]} rx="1.5" style={{ "--dl": `${0.85 + g * 0.06}s` } as CSSProperties} />
            <text className="mo" x={gx(g) + 11.5} y={BASE + 13}>{MONTHS[g]}</text>
          </g>
        ))}
        <polyline className="noi" points={NOI_PTS.join(" ")} pathLength={1} />
        <circle className="dot" cx={gx(5) + 11.5} cy={BASE - (REV[5] - COST[5]) * 0.95} r="3.6" />
        <g transform="rotate(-90 270 82)">
          {SHARE.map((s, i) => {
            const style = { "--len": s.pct - 1.2, "--off": -cum, "--dl": `${0.95 + i * 0.16}s` } as CSSProperties
            cum += s.pct
            return <circle key={s.name} className={`seg ${s.cls}`} cx="270" cy="82" r="36" pathLength={100} style={style} />
          })}
        </g>
        <text className="dc" x="270" y="85">€501k</text>
        <text className="ds" x="270" y="96">revenue</text>
        {SHARE.map((s, i) => (
          <g key={s.name} className="tr" style={{ "--dl": `${1.2 + i * 0.12}s` } as CSSProperties}>
            <line className="gr" x1="20" x2="310" y1={206 + i * 22} y2={206 + i * 22} />
            <circle className={`sw ${s.cls}`} cx="26" cy={218 + i * 22} r="3.4" />
            <text x="35" y={221 + i * 22}>{s.name}</text>
            <text className="val" x="310" y={221 + i * 22}>{s.val}</text>
          </g>
        ))}
      </svg>
    </>
  )
}

/* ───────────── props: tablet, calculator, coffee, plant, pencil, pen, stamp ───────────── */

function Tablet() {
  const line = "M0 60 C14 54 22 40 38 44 S62 58 77 46 S102 22 118 30 S140 46 154 36"
  return (
    <svg viewBox="0 0 190 270">
      <rect className="body" x="1" y="1" width="188" height="268" rx="18" />
      <rect className="scr" x="11" y="16" width="168" height="240" rx="8" />
      <circle className="cam" cx="95" cy="9" r="2" />
      <rect className="mk" x="21" y="27" width="9" height="9" rx="2" />
      <text className="t1" x="35" y="35">Overview</text>
      <circle className="live" cx="148" cy="31.5" r="2.6" />
      <text className="t2" x="154" y="34.5">LIVE</text>
      <text className="t2 dim" x="21" y="56">Cash in bank</text>
      <text className="big" x="21" y="74">€3,657,920</text>
      <defs>
        <clipPath id="dk-tab-clip"><rect x="21" y="84" width="148" height="70" /></clipPath>
        <linearGradient id="dk-tab-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#A3E635" stopOpacity=".35" />
          <stop offset="1" stopColor="#A3E635" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[96, 116, 136].map((y) => <line key={y} className="grid" x1="21" x2="169" y1={y} y2={y} />)}
      <g clipPath="url(#dk-tab-clip)">
        <g className="scroll" transform="translate(21 88)">
          {[0, 154].map((dx) => (
            <g key={dx} transform={`translate(${dx} 0)`}>
              <path className="area" d={`${line} V66 H0 Z`} />
              <path className="ln" d={line} />
            </g>
          ))}
        </g>
      </g>
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <rect key={i} className={`mb${i % 3 === 2 ? " t" : ""}`} x={23 + i * 18} y={172 + (i % 4) * 6} width="11" height={44 - (i % 4) * 6} rx="2"
          style={{ "--dl": `${-i * 0.37}s` } as CSSProperties} />
      ))}
      <g className="toast">
        <rect x="19" y="226" width="152" height="22" rx="6" />
        <text x="95" y="240.5">Report refreshed · 41 s</text>
      </g>
    </svg>
  )
}

function Calculator() {
  const shown = ["501,377.00", "372,911.00", "88.1", "1.81", "3,657,920"]
  return (
    <svg viewBox="0 0 150 190">
      <rect className="body" x="1" y="1" width="148" height="188" rx="14" />
      <rect className="solar" x="88" y="7" width="44" height="6" rx="1.5" />
      <rect className="lcd" x="14" y="18" width="122" height="34" rx="4" />
      <defs><clipPath id="dk-calc-clip"><rect x="14" y="18" width="122" height="34" rx="4" /></clipPath></defs>
      <g clipPath="url(#dk-calc-clip)">
        <g className="roll">
          {shown.map((s, i) => <text key={s} x="130" y={42 + i * 34}>{s}</text>)}
        </g>
      </g>
      {Array.from({ length: 20 }, (_, k) => {
        const c = k % 4
        const r = Math.floor(k / 4)
        const eq = c === 3 && r === 4
        const press = [5, 10, 19, 13, 6].indexOf(k)
        return (
          <rect key={k} className={`key${c === 3 ? " op" : ""}${eq ? " eq" : ""}${press >= 0 ? " kp" : ""}`}
            x={14 + c * 31.5} y={62 + r * 25} width="27" height="19" rx="4"
            style={press >= 0 ? ({ "--dl": `${press * 0.45}s` } as CSSProperties) : undefined} />
        )
      })}
    </svg>
  )
}

function Coffee() {
  return (
    <svg viewBox="0 0 130 120">
      <circle className="saucer" cx="60" cy="62" r="54" />
      <circle className="ring" cx="60" cy="62" r="42" />
      <rect className="handle" x="88" y="54" width="34" height="16" rx="8" />
      <circle className="cup" cx="60" cy="62" r="36" />
      <circle className="coffee" cx="60" cy="62" r="29" />
      <circle className="crema" cx="60" cy="62" r="22" />
      <ellipse className="shine" cx="47" cy="44" rx="10" ry="4" transform="rotate(-30 47 44)" />
    </svg>
  )
}

/** Three wisps, each its own element, so they rise on the compositor (no repaint). */
function Steam() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <span key={i} className="wisp" style={{ "--i": i, "--dl": `${i * 1.1}s` } as CSSProperties}>
          <svg viewBox="0 0 20 90"><path d="M10 86c-8-12 8-20 0-32s8-20 0-32" /></svg>
        </span>
      ))}
    </>
  )
}

const LEAVES = [
  { a: 8, s: 1.05, c: "l1", dur: 6.5, dl: -1 },
  { a: 26, s: 1.2, c: "l2", dur: 7.2, dl: -3 },
  { a: 44, s: 0.95, c: "l3", dur: 5.8, dl: -2 },
  { a: 61, s: 1.15, c: "l1", dur: 6.9, dl: -4 },
  { a: 79, s: 1, c: "l2", dur: 6.1, dl: -0.5 },
  { a: 35, s: 0.7, c: "l4", dur: 5.4, dl: -2.5 },
  { a: 70, s: 0.68, c: "l4", dur: 6.4, dl: -1.5 },
]

function Plant() {
  return (
    <svg viewBox="0 0 280 280">
      {/* the same leaves twice: a flat offset shade below (no blur filter to repaint), then the plant */}
      {[{ k: "shade", t: "translate(34 40)" }, { k: "", t: "translate(22 22)" }].map(({ k, t }) => (
        <g key={t} className={k} transform={t}>
          {LEAVES.map((l, i) => (
            <g key={i} className={`leaf ${l.c}`} style={{ "--a": `${l.a}deg`, "--s": l.s, "--dur": `${l.dur}s`, "--dl": `${l.dl}s` } as CSSProperties}>
              <path d="M0 0C40-27 132-25 176 0C132 25 40 27 0 0Z" />
              {!k && <path className="rib" d="M6 0H166" />}
            </g>
          ))}
        </g>
      ))}
      <circle className="pot" cx="22" cy="22" r="46" />
    </svg>
  )
}

function Pencil() {
  return (
    <svg viewBox="0 0 220 16">
      <path className="wood" d="M0 8L22 2H26V14H22Z" />
      <path className="lead" d="M0 8L7 6.1V9.9Z" />
      <rect className="hex" x="26" y="2" width="160" height="12" />
      <rect className="hex2" x="26" y="6" width="160" height="4" />
      <rect className="fer" x="186" y="1.5" width="14" height="13" />
      <rect className="era" x="200" y="1.5" width="20" height="13" rx="4" />
    </svg>
  )
}

function Pen() {
  return (
    <svg viewBox="0 0 200 14">
      <path className="nib" d="M0 7L18 3.4V10.6Z" />
      <rect className="grip" x="18" y="2.6" width="42" height="8.8" rx="2" />
      <rect className="barrel" x="60" y="1.6" width="132" height="10.8" rx="3" />
      <rect className="band" x="150" y="1.6" width="8" height="10.8" />
      <rect className="cap" x="186" y="2.2" width="14" height="9.6" rx="4.8" />
      <rect className="hi" x="62" y="3.2" width="120" height="1.6" rx=".8" />
    </svg>
  )
}

function StampTool() {
  return (
    <svg viewBox="0 0 100 100">
      <defs>
        <radialGradient id="dk-knob" cx=".38" cy=".34" r=".7">
          <stop offset="0" stopColor="#D9A46B" />
          <stop offset=".6" stopColor="#9A6334" />
          <stop offset="1" stopColor="#6B3F1C" />
        </radialGradient>
        <radialGradient id="dk-tool-sh" cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#000" stopOpacity=".55" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="60" cy="62" rx="46" ry="36" fill="url(#dk-tool-sh)" />
      <rect x="12" y="24" width="76" height="52" rx="7" fill="#2B2724" />
      <rect x="15" y="27" width="70" height="46" rx="5" fill="#3A3430" />
      <circle cx="50" cy="50" r="22" fill="url(#dk-knob)" />
      <circle cx="50" cy="50" r="22" fill="none" stroke="rgba(0,0,0,.25)" strokeWidth="1.5" />
    </svg>
  )
}

/* ───────────── act 5 · the X-ray: the skeleton under the desk ─────────────
   The real moving parts, named as they are in this repo. Laid out on the same
   1200 × 560 grid, left to right in the order a month travels. */

type Node = { x: number; y: number; w: number; h: number; t: string; s: string[]; k: "src" | "db" | "rev" | "app" | "ten" }

const NODES: Node[] = [
  { x: 34, y: 92, w: 228, h: 66, k: "src", t: "Upload", s: ["CSV · Excel → Storage", "edge fn ingest-submit"] },
  { x: 34, y: 170, w: 228, h: 66, k: "src", t: "Google Sheet link", s: ["pg_cron + pg_net", "pulled every 10 min"] },
  { x: 34, y: 248, w: 228, h: 66, k: "src", t: "Signed webhook", s: ["edge fn connector-webhook", "HMAC-verified"] },
  { x: 34, y: 326, w: 228, h: 66, k: "src", t: "Excel parser", s: ["Node worker (Docker)", "claims jobs · SKIP LOCKED"] },
  { x: 316, y: 100, w: 266, h: 66, k: "db", t: "Staging", s: ["ingest_batches", "journal_staging"] },
  { x: 316, y: 196, w: 266, h: 66, k: "db", t: "Check", s: ["transform_batch · rulesets", "detect_anomalies · z-score"] },
  { x: 316, y: 292, w: 266, h: 66, k: "rev", t: "Review — a person", s: ["needs_review → notify-review", "approve · reject · recheck"] },
  { x: 316, y: 392, w: 266, h: 50, k: "ten", t: "Tenancy", s: ["entity_members · my_entity_ids()"] },
  { x: 614, y: 100, w: 266, h: 66, k: "db", t: "Ledger", s: ["load_batch · advisory lock", "journal_entries"] },
  { x: 614, y: 196, w: 266, h: 66, k: "db", t: "Refresh", s: ["trigger → report_refresh_queue", "pg_cron · every minute"] },
  { x: 614, y: 292, w: 266, h: 66, k: "db", t: "Reports", s: ["mv_account_monthly", "view report_account_monthly"] },
  { x: 614, y: 392, w: 266, h: 50, k: "db", t: "pipeline_events", s: ["every stage logged"] },
  { x: 962, y: 110, w: 214, h: 66, k: "app", t: "React app", s: ["TanStack Query · supabase-js", "JWT → PostgREST"] },
  { x: 962, y: 206, w: 214, h: 66, k: "app", t: "X-ray panel", s: ["instrumentedFetch", "every call timed"] },
  { x: 962, y: 302, w: 214, h: 66, k: "app", t: "Realtime", s: ["pipeline_events", "→ live timeline"] },
]

/** Edges in travel order; `k` colours the flagged path (gold) and the policy link (red). */
const EDGES: { d: string; x: number; k?: "rev" | "pol" }[] = [
  { d: "M262 125H282", x: 262 }, { d: "M262 203H282", x: 262 }, { d: "M262 281H282", x: 262 }, { d: "M262 359H282", x: 262 },
  { d: "M282 359V133H316", x: 282 },
  { d: "M449 166V196", x: 449 },
  { d: "M449 262V292", x: 449, k: "rev" },
  { d: "M582 229C598 229 598 126 614 126", x: 590 },
  { d: "M582 325C604 325 602 152 614 152", x: 596, k: "rev" },
  { d: "M747 166V196", x: 747 },
  { d: "M747 262V292", x: 747 },
  { d: "M747 358V392", x: 747 },
  { d: "M880 325C928 325 918 143 962 143", x: 900 },
  { d: "M880 417C930 417 928 335 962 335", x: 900 },
  { d: "M1069 176V206", x: 1069 },
  { d: "M449 442V462H928V458", x: 700, k: "pol" },
]

const at5 = (x: number) => `${(0.15 + 1.25 * (x / 1200)).toFixed(2)}s`

function Skeleton() {
  return (
    <svg className="dk-skel" viewBox="0 0 1200 560">
      <text className="lane" x="34" y="80">Ways in</text>
      <rect className="pg" x="296" y="64" width="604" height="410" rx="14" style={{ "--dl": at5(296) } as CSSProperties} />
      <text className="pg-t" x="316" y="88">Postgres · Supabase<tspan className="pg-s" dx="10">the business logic runs inside the database</tspan></text>
      <g className="rls" style={{ "--dl": at5(908) } as CSSProperties}>
        <rect x="908" y="80" width="40" height="378" rx="8" />
        <text transform="rotate(-90 928 269)" x="928" y="273">Row-level security · entities_select</text>
      </g>
      <text className="lane" x="962" y="98">In the browser</text>
      {EDGES.map((e) => (
        <g key={e.d} className={`ed${e.k ? ` ${e.k}` : ""}`} style={{ "--dl": at5(e.x + 30) } as CSSProperties}>
          <path className="e" d={e.d} pathLength={1} />
          <path className="ef" d={e.d} />
        </g>
      ))}
      {NODES.map((n) => (
        <g key={n.t} className={`nd ${n.k}`} style={{ "--dl": at5(n.x) } as CSSProperties}>
          <rect className="bx" x={n.x} y={n.y} width={n.w} height={n.h} rx="8" />
          <rect className="ac" x={n.x} y={n.y + 10} width="3" height={n.h - 20} rx="1.5" />
          <text className="tt" x={n.x + 14} y={n.y + 23}>{n.t}</text>
          {n.s.map((line, i) => <text key={line} className="sb" x={n.x + 14} y={n.y + 41 + i * 15}>{line}</text>)}
        </g>
      ))}
      <g className="tests" style={{ "--dl": at5(600) } as CSSProperties}>
        <rect x="296" y="488" width="604" height="34" rx="8" />
        <text x="598" y="510">Tested on every change · 98 pgTAP assertions · 81 unit tests · Playwright under CSP</text>
      </g>
    </svg>
  )
}

/** The same skeleton as a readable list — for phones, where the desk is too
 *  small to read; HowItWorks shows it while the X-ray is pinned. */
export function SkeletonList() {
  const by = (titles: string[]) => titles.map((t) => NODES.find((n) => n.t === t)!)
  const item = (n: Node) => <li key={n.t} className={n.k}><b>{n.t}</b><span>{n.s.join(" · ")}</span></li>
  return (
    <div className="dk-list">
      <h4>Ways in</h4>
      <ul>{by(["Upload", "Google Sheet link", "Signed webhook", "Excel parser"]).map(item)}</ul>
      <h4 className="db">Postgres · Supabase <em>the business logic runs inside the database</em></h4>
      <ol>{by(["Staging", "Check", "Review — a person", "Ledger", "Refresh", "Reports", "pipeline_events", "Tenancy"]).map(item)}</ol>
      <h4 className="pol">Row-level security <em>entities_select — every read filtered by company</em></h4>
      <h4>In the browser</h4>
      <ul>{by(["React app", "X-ray panel", "Realtime"]).map(item)}</ul>
      <p className="tests">Tested on every change · 98 pgTAP assertions · 81 unit tests · Playwright under CSP</p>
    </div>
  )
}

/* ───────────── the scene ───────────── */

const IMPRESSIONS = [
  { x: 115, y: 278, r: -14, z: 0.6, who: "Danube only", dl: 0.54 },
  { x: 236, y: 182, r: 9, z: 0.75, who: "Riverside only", dl: 1.19 },
  { x: 418, y: 372, r: -8, z: 0.9, who: "Lindenhof only", dl: 1.87 },
]

export function Desk() {
  const ref = useRef<HTMLDivElement>(null)

  // Depth: the desk leans a little toward the pointer (desktop only).
  useEffect(() => {
    const el = ref.current
    if (!el || !matchMedia("(hover: hover) and (pointer: fine)").matches || matchMedia("(prefers-reduced-motion: reduce)").matches) return
    let raf = 0
    let px = 0
    let py = 0
    const apply = () => {
      raf = 0
      el.style.setProperty("--px", px.toFixed(3))
      el.style.setProperty("--py", py.toFixed(3))
    }
    const queue = () => { if (!raf) raf = requestAnimationFrame(apply) }
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      px = ((e.clientX - r.left) / r.width) * 2 - 1
      py = ((e.clientY - r.top) / r.height) * 2 - 1
      queue()
    }
    const leave = () => { px = 0; py = 0; queue() }
    el.addEventListener("pointermove", move)
    el.addEventListener("pointerleave", leave)
    return () => {
      el.removeEventListener("pointermove", move)
      el.removeEventListener("pointerleave", leave)
      cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <div ref={ref} className="desk" aria-hidden="true">
      <div className="dk-mat" />

      {/* props under the story */}
      <div className="dk-o dk-calc" style={at(-26, 420, 150, 190, 14, 1.3)}><Calculator /></div>
      <div className="dk-o dk-pencil" style={at(560, 508, 220, 16, -5, 0.9)}><Pencil /></div>
      <div className="dk-o dk-tab" style={at(1000, 196, 190, 270, 4, 1.2)}><Tablet /></div>
      <div className="dk-o dk-cup" style={at(1046, 30, 130, 120, -8, 1.6)}><Coffee /></div>
      <div className="dk-o dk-steam" style={at(1062, -40, 80, 90, 0, 1.9)}><Steam /></div>

      {/* the month, act by act */}
      <div className="dk-story">
        <div className="dk-o dk-pg dk-sheet" style={at(110, 110, 240, 310, -8, 0.6, { "--dl": ".15s" })}><Sheet name="danube_sep.xlsx" seed={11} /></div>
        <div className="dk-o dk-pg dk-sheet" style={at(230, 80, 240, 310, 5, 0.75, { "--dl": ".55s" })}><Sheet name="riverside_sep.csv" seed={23} /></div>
        <div className="dk-o dk-pg dk-sheet" style={at(330, 140, 240, 310, -2, 0.9, { "--dl": ".95s" })}>
          <Sheet name="lindenhof_sep.xlsx" seed={37} held={5} clip
            flags={[{ row: 1, col: 2, at: 0.78 }, { row: 3, col: 1, at: 0.96 }, { row: 6, col: 3, at: 1.22 }, { row: 8, col: 2, at: 1.4 }]} />
        </div>
        <div className="dk-beam"><b>X-ray check</b></div>
        <div className="dk-o dk-note" style={at(546, 288, 118, 118, 7, 1.1)}>
          <b>← Row 7 held</b>
          <span>costs 9× the usual — a person decides</span>
        </div>
        {IMPRESSIONS.map((m) => (
          <div key={m.who} className="dk-o dk-imp" style={at(m.x, m.y, 100, 46, m.r, m.z, { "--dl": `${m.dl}s` })}>
            <b>Private</b><span>{m.who}</span>
          </div>
        ))}
        <div className="dk-tool"><StampTool /></div>
        <div className="dk-o dk-pg dk-report" style={at(668, 48, 330, 440, 1.5, 1)}><Report /></div>
        <div className="dk-o dk-pen" style={at(884, 161, 200, 14, 0, 1)}>
          <div className="mv"><div className="rot"><Pen /></div></div>
        </div>
      </div>

      {/* the plant leans over everything */}
      <div className="dk-o dk-plant" style={at(-44, -64, 280, 280, 0, 2.2)}><div className="sway"><Plant /></div></div>

      {/* act 5: the same desk on X-ray film, its skeleton showing */}
      {/* the film wipes in left to right: the frame slides one way, its content the
          other, so the skeleton stays put — two transforms, no clip-path repaint */}
      <div className="dk-xr"><div className="dk-xr-in"><Skeleton /></div></div>
      <div className="dk-sweep"><b>X-ray</b></div>
    </div>
  )
}

