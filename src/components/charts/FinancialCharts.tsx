import { useId, type ReactNode } from "react"
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, LabelList, Line,
  ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts"
import { ResponsiveTreeMap } from "@nivo/treemap"
import type { Slice, WfStep } from "@/lib/data/aggregate"

// ── Palette ────────────────────────────────────────────────────────────────
// One meaning per colour, everywhere (concrete hex — SVG fills don't resolve CSS
// vars). Income / Costs / NOI / Cash are a validated categorical set for the
// dark card surface (OKLCH L 0.48–0.67, chroma ≥ 0.1, adjacent CVD ΔE ≥ 9).
// Totals in a bridge are neutral slate; only a DECREASE uses red.
const INCOME = "#23ac74"
const COST = "#847ce2"
const NOI = "#c28700"
const CASH = "#00a6c2"
const TOTAL = "#78889b"
const DOWN = "#da534f"
const UP = INCOME
const RAMP = ["#68d7a1", "#53c48e", "#3db07c", "#239d6a", "#008b59", "#007948"] // magnitude, big → small
const GRID = "rgba(255,255,255,0.06)"
const AXIS = "rgba(255,255,255,0.45)"
const INK = "rgba(255,255,255,0.86)"
const SURFACE = "#16171b"

export const COLORS = { income: INCOME, cost: COST, noi: NOI, cash: CASH, total: TOTAL, down: DOWN }
/** Aging risk scale — not due → 90+ days past due. */
export const BUCKET_COLORS = ["#4fc99a", "#d6b53f", "#e0843e", "#e5584d", "#b03a62"]
/** Journal document types. */
export const DOC_COLORS: Record<string, string> = { SI: INCOME, PI: COST, BS: CASH, GJ: NOI, OB: TOTAL, UP: "#a3adb9" }

// Chart-internal animations are OFF: recharts/nivo animate in JavaScript, every
// frame, for every chart — on a page with several charts a filter change meant
// ~1 s of stutter. Data updates are instant; the cards themselves fade in (GPU).
const ANIM = false

const eur = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })

/** Compact money a person can read at a glance: €7.45M, €461k, €38.9k, €680. */
export function eurShort(n: number): string {
  const a = Math.abs(n)
  const s = n < 0 ? "−" : ""
  if (a >= 1e6) return `${s}€${(a / 1e6).toFixed(a >= 1e7 ? 1 : 2).replace(/\.?0+$/, "")}M`
  if (a >= 1e3) return `${s}€${(a / 1e3).toFixed(a >= 1e5 ? 0 : 1).replace(/\.0$/, "")}k`
  return `${s}€${Math.round(a)}`
}
const signed = (n: number) => (n > 0 ? `+${eurShort(n)}` : eurShort(n))

const TICK = { fill: AXIS, fontSize: 11, fontFamily: "JetBrains Mono" }
const LABEL = { fill: INK, fontSize: 11, fontFamily: "JetBrains Mono" } as const
const Y_W = 62

/** Dark card wrapper for a chart with a mono title + optional hint. */
export function ChartCard({ title, hint, tour, children, className }: { title: string; hint?: string; tour?: string; children: ReactNode; className?: string }) {
  return (
    // `tour` = the anchor the guided tour + X-RAY CODE inspector point at.
    <div data-tour={tour} className={`rounded-[1.5rem] bg-card p-5 shadow-soft ring-1 ring-border md:p-6 ${className ?? ""}`}>
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h3 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{title}</h3>
        {hint && <span className="text-right font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

type LegendItem = { label: string; color: string; kind?: "bar" | "line" | "dash" | "dot" | "area" }

/** A legend in fixed series order (recharts' own sorts alphabetically). */
export function SeriesLegend({ items }: { items: LegendItem[] }) {
  return (
    <div className="mt-3 flex flex-wrap justify-center gap-x-5 gap-y-1.5 font-mono text-[11px] text-muted-foreground">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-2">
          {it.kind === "line" ? <span className="h-0.5 w-4 rounded-full" style={{ background: it.color }} />
            : it.kind === "dash" ? <span className="w-4 border-t-2 border-dashed" style={{ borderColor: it.color }} />
            : it.kind === "dot" ? <span className="w-4 border-t-2 border-dotted" style={{ borderColor: it.color }} />
            : <span className="size-2.5 rounded-[3px]" style={{ background: it.color, opacity: it.kind === "area" ? 0.75 : 1 }} />}
          {it.label}
        </span>
      ))}
    </div>
  )
}

type Fmt = (v: number) => string
function DarkTooltip({ active, payload, label, fmt = (v) => eur.format(v) }: {
  active?: boolean; payload?: { name: string; value: number; color: string; stroke?: string }[]; label?: string; fmt?: Fmt
}) {
  const rows = (payload ?? []).filter((p) => p.value != null)
  if (!active || !rows.length) return null
  return (
    <div className="rounded-xl bg-[#14151a] px-3 py-2 font-mono text-xs shadow-soft ring-1 ring-white/15">
      {label && <div className="mb-1 text-white/55">{label}</div>}
      {rows.map((p) => (
        <div key={p.name} className="flex items-center gap-2 tabular-nums">
          <span className="size-2 rounded-full" style={{ background: p.color ?? p.stroke }} />
          <span className="text-white/60">{p.name}</span>
          <span className="ml-auto pl-3 text-white/90">{fmt(Number(p.value))}</span>
        </div>
      ))}
    </div>
  )
}

/** Marks only the latest point of a series — "where we are now". */
function lastDot(len: number, color: string) {
  return (p: { cx?: number; cy?: number; index?: number }) =>
    p.index === len - 1 && p.cx != null && p.cy != null
      ? <circle key="last" cx={p.cx} cy={p.cy} r={3} fill={color} stroke={SURFACE} strokeWidth={1.5} />
      : <g key={p.index} />
}

/** Tiny inline sparkline for KPI cards and statement lines (no axes/grid). A
 *  flat series draws as a quiet dashed line, not a solid block. */
export function Sparkline({ data, color = INCOME }: { data: number[]; color?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "")
  const d = data.map((v, i) => ({ i, v }))
  const min = Math.min(...data), max = Math.max(...data)
  const flat = data.length < 2 || max - min <= Math.max(Math.abs(max), 1) * 0.004
  const pad = flat ? Math.max(Math.abs(max) * 0.5, 1) : (max - min) * 0.2
  return (
    <ResponsiveContainer width="100%" height={36}>
      <AreaChart data={d} margin={{ top: 4, right: 4, bottom: 2, left: 0 }}>
        <defs>
          <linearGradient id={`sp${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={flat ? 0 : 0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <YAxis hide domain={[min - pad, max + pad]} />
        <Area dataKey="v" type="monotone" stroke={color} strokeWidth={1.6} strokeOpacity={flat ? 0.6 : 1}
          strokeDasharray={flat ? "3 3" : undefined} fill={`url(#sp${id})`} dot={lastDot(d.length, color)}
          activeDot={false} isAnimationActive={ANIM} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

function WfTooltip({ active, payload }: { active?: boolean; payload?: { payload: { name: string; val: number; total: boolean } }[] }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  const v = Math.round(d.val) === 0 ? 0 : d.val // never "-€0"
  return (
    <div className="rounded-xl bg-[#14151a] px-3 py-2 font-mono text-xs shadow-soft ring-1 ring-white/15">
      <span className="text-white/60">{d.name}: </span>
      <span className="tabular-nums text-white/90">{d.total ? eur.format(v) : `${v > 0 ? "+" : ""}${eur.format(v)}`}</span>
    </div>
  )
}

/** Category tick that wraps onto two lines instead of being dropped. */
function WrapTick({ x, y, payload }: { x?: number; y?: number; payload?: { value: string } }) {
  const words = String(payload?.value ?? "").split(" ")
  const lines: string[] = []
  let cur = ""
  for (const w of words) {
    if (cur && `${cur} ${w}`.length > 10) { lines.push(cur); cur = w } else cur = cur ? `${cur} ${w}` : w
  }
  if (cur) lines.push(cur)
  return (
    <g transform={`translate(${x},${y})`}>
      {lines.slice(0, 2).map((l, i) => (
        <text key={i} x={0} y={0} dy={13 + i * 12} textAnchor="middle" fill={AXIS} fontSize={10.5} fontFamily="JetBrains Mono">{l}</text>
      ))}
    </g>
  )
}

/** WATERFALL (bridges) — a stacked bar on a transparent base. Increases green,
 *  decreases red, levels/totals neutral; every step is labelled with its signed
 *  amount, and a zero step still shows as a hairline so it reads as "nothing". */
export function Waterfall({ steps, height = 300 }: { steps: WfStep[]; height?: number }) {
  let run = 0
  const data = steps.map((s, i) => {
    if (s.isTotal) {
      run = s.value // a total rebases the running line
      return { name: s.name, base: 0, bar: Math.abs(s.value), color: TOTAL, val: s.value, total: true, lab: eurShort(s.value) }
    }
    const start = run
    run += s.value
    return {
      name: s.name, base: Math.min(start, run), bar: Math.abs(s.value),
      color: s.value > 0 ? UP : s.value < 0 ? DOWN : TOTAL, val: s.value, total: false,
      lab: start === 0 && i === 0 ? eurShort(s.value) : signed(s.value),
    }
  })
  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 20, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="name" interval={0} tick={<WrapTick />} height={38} tickLine={false} axisLine={{ stroke: GRID }} />
          <YAxis tick={TICK} tickLine={false} axisLine={false} tickFormatter={eurShort} width={Y_W} />
          <Tooltip content={<WfTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
          <Bar dataKey="base" stackId="w" fill="transparent" isAnimationActive={false} />
          <Bar dataKey="bar" stackId="w" radius={[4, 4, 0, 0]} minPointSize={2} isAnimationActive={ANIM}>
            {data.map((d, i) => <Cell key={i} fill={d.color} />)}
            <LabelList dataKey="lab" position="top" style={{ ...LABEL, fontSize: 10.5 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <SeriesLegend items={[{ label: "Increase", color: UP }, { label: "Decrease", color: DOWN }, { label: "Total / level", color: TOTAL }]} />
    </div>
  )
}

/** Revenue and operating costs as lines, NOI (the gap the building earns) as a
 *  soft area. Months come pre-labelled ("Sep 26"). */
export function NoiTrend({ data }: { data: { month: string; revenue: number; opex: number; noi: number }[] }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "")
  return (
    <div>
      <ResponsiveContainer width="100%" height={290}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`nf${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={NOI} stopOpacity={0.32} />
              <stop offset="100%" stopColor={NOI} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="month" tick={TICK} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={24} />
          <YAxis tick={TICK} tickLine={false} axisLine={false} tickFormatter={eurShort} width={Y_W} />
          <Tooltip content={<DarkTooltip />} />
          <Area isAnimationActive={ANIM} type="monotone" dataKey="noi" name="NOI" stroke={NOI} strokeWidth={1.8} fill={`url(#nf${id})`} />
          <Line isAnimationActive={ANIM} type="monotone" dataKey="revenue" name="Revenue" stroke={INCOME} strokeWidth={2.2} dot={false} activeDot={{ r: 4 }} />
          <Line isAnimationActive={ANIM} type="monotone" dataKey="opex" name="Operating costs" stroke={COST} strokeWidth={2.2} dot={false} activeDot={{ r: 4 }} />
        </ComposedChart>
      </ResponsiveContainer>
      <SeriesLegend items={[
        { label: "Revenue", color: INCOME, kind: "line" },
        { label: "Operating costs", color: COST, kind: "line" },
        { label: "NOI (the gap)", color: NOI, kind: "area" },
      ]} />
    </div>
  )
}

/** Cost mix as a TREEMAP (not a pie). One hue, lighter = bigger, each tile
 *  labelled with its share — magnitude, not a rainbow of alarm colours. */
export function ExpenseTreemap({ data, height = 300 }: { data: Slice[]; height?: number }) {
  const sorted = [...data].sort((a, b) => b.value - a.value)
  const total = sorted.reduce((s, d) => s + d.value, 0) || 1
  const shade = new Map(sorted.map((d, i) => [d.name, RAMP[Math.min(i, RAMP.length - 1)]]))
  const root = { name: "Costs", children: sorted.map((d) => ({ name: d.name, value: d.value })) }
  return (
    <div style={{ height }}>
      <ResponsiveTreeMap
        data={root}
        identity="name"
        value="value"
        valueFormat={(v) => eur.format(Number(v))}
        leavesOnly
        innerPadding={3}
        outerPadding={0}
        enableParentLabel={false}
        colors={(node) => shade.get(String(node.id)) ?? RAMP[RAMP.length - 1]}
        nodeOpacity={1}
        borderWidth={0}
        labelSkipSize={28}
        label={(node) => {
          const pct = `${Math.round((node.value / total) * 100)}%`
          const room = Math.max(node.width, node.height) - 12 // orientLabel turns text along the long side
          if (Math.min(node.width, node.height) < 16) return ""
          return [`${node.id} · ${pct}`, String(node.id), pct].find((t) => t.length * 6.9 <= room) ?? ""
        }}
        orientLabel
        labelTextColor="#0b1410"
        animate={ANIM}
        theme={{
          labels: { text: { fontFamily: "JetBrains Mono", fontSize: 11, fontWeight: 600 } },
          tooltip: { container: { background: "#14151a", color: "#fff", fontFamily: "JetBrains Mono", fontSize: 12, borderRadius: 10 } },
        }}
      />
    </div>
  )
}

/** Ranked horizontal bars in one hue (NOI per building, tenant share…), each
 *  labelled at the bar end so it reads without a hover. */
export function RankBars({ data, fmt = eurShort, color = RAMP[2], labelWidth = 150, height }: {
  data: { name: string; value: number }[]; fmt?: Fmt; color?: string; labelWidth?: number; height?: number
}) {
  height ??= Math.max(160, data.length * 38)
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 64, bottom: 0, left: 4 }}>
        <CartesianGrid stroke={GRID} horizontal={false} />
        <XAxis type="number" tick={TICK} tickLine={false} axisLine={false} tickFormatter={fmt} />
        <YAxis type="category" dataKey="name" width={labelWidth} tick={TICK} tickLine={false} axisLine={false} interval={0} />
        <Tooltip content={<DarkTooltip fmt={fmt} />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
        <Bar dataKey="value" name="Value" radius={[0, 4, 4, 0]} barSize={18} fill={color} isAnimationActive={ANIM}>
          <LabelList dataKey="value" position="right" formatter={(v) => fmt(Number(v))} style={LABEL} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

/** 1, 2, 2.5 or 5 × 10ⁿ — the smallest round step ≥ x. */
function niceStep(x: number): number {
  if (x <= 0) return 1
  const p = Math.pow(10, Math.floor(Math.log10(x)))
  return ([1, 2, 2.5, 5, 10].find((m) => m * p >= x) ?? 10) * p
}

/** A bar-end label that sits OUTSIDE the bar on whichever side it grows. */
function EndLabel(p: { x?: unknown; y?: unknown; width?: unknown; height?: unknown; value?: unknown }) {
  const x = Number(p.x ?? 0), w = Number(p.width ?? 0), y = Number(p.y ?? 0), h = Number(p.height ?? 0)
  const v = Number(p.value ?? 0)
  const left = Math.min(x, x + w), right = Math.max(x, x + w)
  return (
    <text x={v >= 0 ? right + 6 : left - 6} y={y + h / 2} dy={3.5} textAnchor={v >= 0 ? "start" : "end"}
      fill={INK} fontSize={10.5} fontFamily="JetBrains Mono">{signed(v)}</text>
  )
}

/** Budget variance per line, diverging around zero: right/green = better than
 *  plan, left/red = worse. Sorted by impact. */
export function VarianceBars({ data }: { data: { name: string; value: number }[] }) {
  const height = Math.max(180, data.length * 36)
  // A symmetric, round scale around zero (±2 nice steps) with room for labels.
  const lo = Math.min(0, ...data.map((d) => d.value)), hi = Math.max(0, ...data.map((d) => d.value))
  const step = niceStep(Math.max(-lo, hi) * 1.3 / 2)
  const ticks = [...(lo < 0 ? [-2 * step, -step] : []), 0, ...(hi > 0 ? [step, 2 * step] : [])]
  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 52, bottom: 0, left: 4 }}>
          <CartesianGrid stroke={GRID} horizontal={false} />
          <XAxis type="number" tick={TICK} tickLine={false} axisLine={false} tickFormatter={eurShort}
            domain={[ticks[0], ticks[ticks.length - 1]]} ticks={ticks} />
          <YAxis type="category" dataKey="name" width={150} tick={TICK} tickLine={false} axisLine={false} interval={0} />
          <ReferenceLine x={0} stroke="rgba(255,255,255,0.3)" />
          <Tooltip content={<DarkTooltip fmt={signed} />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
          <Bar dataKey="value" name="vs budget" radius={4} barSize={16} isAnimationActive={ANIM}>
            {data.map((d, i) => <Cell key={i} fill={d.value >= 0 ? UP : DOWN} />)}
            <LabelList dataKey="value" content={EndLabel} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <SeriesLegend items={[{ label: "Better than budget", color: UP }, { label: "Worse than budget", color: DOWN }]} />
    </div>
  )
}

/** Lease expiry profile — annual rent falling due by time to expiry, labelled
 *  with its share of today's income. One hue: it's a magnitude; the nearest
 *  bucket (the real risk) is amber. */
export function ExpiryBars({ data }: { data: { name: string; value: number; share: number }[] }) {
  const rows = data.map((d) => ({ ...d, lab: d.value > 0 ? `${eurShort(d.value)} · ${Math.round(d.share)}%` : "" }))
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={rows} margin={{ top: 22, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="name" tick={TICK} tickLine={false} axisLine={{ stroke: GRID }} />
        <YAxis tick={TICK} tickLine={false} axisLine={false} tickFormatter={eurShort} width={Y_W} />
        <Tooltip content={<DarkTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
        <Bar dataKey="value" name="Rent p.a. expiring" radius={[4, 4, 0, 0]} isAnimationActive={ANIM}>
          {rows.map((_, i) => <Cell key={i} fill={i === 0 ? NOI : RAMP[3]} />)}
          <LabelList dataKey="lab" position="top" style={{ ...LABEL, fontSize: 10.5 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Stacked aging bars — one bar per property, stacked by days-past-due bucket. */
export function AgingStacked({ data, buckets }: { data: Record<string, string | number>[]; buckets: readonly string[] }) {
  return (
    <div>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="name" interval={0} tick={<WrapTick />} height={38} tickLine={false} axisLine={{ stroke: GRID }} />
          <YAxis tick={TICK} tickLine={false} axisLine={false} tickFormatter={eurShort} width={Y_W} />
          <Tooltip content={<DarkTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
          {buckets.map((b, i) => (
            <Bar key={b} dataKey={b} name={b} stackId="age" fill={BUCKET_COLORS[i]} stroke={SURFACE} strokeWidth={1}
              radius={i === buckets.length - 1 ? [4, 4, 0, 0] : undefined} isAnimationActive={ANIM} />
          ))}
        </BarChart>
      </ResponsiveContainer>
      <SeriesLegend items={buckets.map((b, i) => ({ label: i === 0 ? b : `${b} days`, color: BUCKET_COLORS[i] }))} />
    </div>
  )
}

/** What happened to each month's invoices: paid on time / paid late / still open. */
export function SettlementBars({ data, paidLabel }: { data: { month: string; onTime: number; late: number; open: number }[]; paidLabel: string }) {
  return (
    <div>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="month" tick={TICK} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={16} />
          <YAxis tick={TICK} tickLine={false} axisLine={false} tickFormatter={eurShort} width={Y_W} />
          <Tooltip content={<DarkTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
          <Bar dataKey="onTime" name={`${paidLabel} on time`} stackId="s" fill={INCOME} stroke={SURFACE} strokeWidth={1} isAnimationActive={ANIM} />
          <Bar dataKey="late" name={`${paidLabel} late`} stackId="s" fill={NOI} stroke={SURFACE} strokeWidth={1} isAnimationActive={ANIM} />
          <Bar dataKey="open" name="Still open" stackId="s" fill={DOWN} stroke={SURFACE} strokeWidth={1} radius={[4, 4, 0, 0]} isAnimationActive={ANIM} />
        </BarChart>
      </ResponsiveContainer>
      <SeriesLegend items={[
        { label: `${paidLabel} on time`, color: INCOME }, { label: `${paidLabel} late`, color: NOI }, { label: "Still open", color: DOWN },
      ]} />
    </div>
  )
}

/** NOI: 12 months actual → 12 months forecast, against budget. One axis (€);
 *  actual solid, forecast dashed, budget a quiet slate dash; "today" marked. */
export function ForecastChart({ data, today }: { data: { month: string; actual: number | null; forecast: number | null; budget: number | null }[]; today: string }) {
  return (
    <div>
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={data} margin={{ top: 18, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="month" tick={TICK} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={18} />
          <YAxis tick={TICK} tickLine={false} axisLine={false} tickFormatter={eurShort} width={Y_W} />
          <Tooltip content={<DarkTooltip />} />
          <ReferenceLine x={today} stroke="rgba(255,255,255,0.35)" strokeDasharray="2 3"
            label={{ value: "last close", position: "insideTopLeft", fill: AXIS, fontSize: 10, fontFamily: "JetBrains Mono" }} />
          <Line isAnimationActive={ANIM} type="monotone" dataKey="budget" name="Budget" stroke={TOTAL} strokeWidth={1.6} strokeDasharray="5 4" dot={false} connectNulls />
          <Line isAnimationActive={ANIM} type="monotone" dataKey="actual" name="Actual" stroke={NOI} strokeWidth={2.4} dot={false} activeDot={{ r: 4 }} />
          <Line isAnimationActive={ANIM} type="monotone" dataKey="forecast" name="Forecast" stroke={NOI} strokeWidth={2.4} strokeDasharray="6 4" dot={false} activeDot={{ r: 4 }} />
        </ComposedChart>
      </ResponsiveContainer>
      <SeriesLegend items={[
        { label: "Actual NOI", color: NOI, kind: "line" },
        { label: "Forecast NOI", color: NOI, kind: "dash" },
        { label: "Budget NOI", color: TOTAL, kind: "dash" },
      ]} />
    </div>
  )
}

/** Cash balance through the year: actual (closed months), the plan, and the
 *  outlook (actual so far + plan for the rest), above a minimum-cash buffer. */
export function CashPlanChart({ data, buffer }: { data: { month: string; actual: number | null; plan: number; outlook: number | null }[]; buffer: number }) {
  return (
    <div>
      <ResponsiveContainer width="100%" height={290}>
        <ComposedChart data={data} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="month" tick={TICK} tickLine={false} axisLine={{ stroke: GRID }} />
          <YAxis tick={TICK} tickLine={false} axisLine={false} tickFormatter={eurShort} width={Y_W} domain={[0, "auto"]} />
          <Tooltip content={<DarkTooltip />} />
          {buffer > 0 && (
            <ReferenceLine y={buffer} stroke={DOWN} strokeOpacity={0.6} strokeDasharray="3 4"
              label={{ value: "min. buffer", position: "insideBottomRight", fill: DOWN, fontSize: 10, fontFamily: "JetBrains Mono" }} />
          )}
          <Line isAnimationActive={ANIM} type="monotone" dataKey="plan" name="Plan" stroke={TOTAL} strokeWidth={1.6} strokeDasharray="5 4" dot={false} />
          <Line isAnimationActive={ANIM} type="monotone" dataKey="outlook" name="Outlook" stroke={CASH} strokeWidth={2} strokeDasharray="1 4" strokeLinecap="round" dot={false} connectNulls />
          <Line isAnimationActive={ANIM} type="monotone" dataKey="actual" name="Actual" stroke={CASH} strokeWidth={2.6} dot={{ r: 2.5, fill: CASH, strokeWidth: 0 }} activeDot={{ r: 4 }} />
        </ComposedChart>
      </ResponsiveContainer>
      <SeriesLegend items={[
        { label: "Actual", color: CASH, kind: "line" },
        { label: "Outlook", color: CASH, kind: "dot" },
        { label: "Plan", color: TOTAL, kind: "dash" },
        { label: "Minimum buffer", color: DOWN, kind: "dash" },
      ]} />
    </div>
  )
}

/** Documents posted per month, stacked by document type. */
export function VolumeStacked({ data, types }: { data: Record<string, number | string>[]; types: readonly { key: string; label: string }[] }) {
  const present = types.filter((t) => data.some((d) => Number(d[t.key] ?? 0) > 0))
  return (
    <div>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="month" tick={TICK} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={16} />
          <YAxis tick={TICK} tickLine={false} axisLine={false} width={44} allowDecimals={false} />
          <Tooltip content={<DarkTooltip fmt={(v) => `${Math.round(v)} docs`} />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
          {present.map((t, i) => (
            <Bar key={t.key} dataKey={t.key} name={t.label} stackId="v" fill={DOC_COLORS[t.key] ?? TOTAL} stroke={SURFACE} strokeWidth={1}
              radius={i === present.length - 1 ? [3, 3, 0, 0] : undefined} isAnimationActive={ANIM} />
          ))}
        </BarChart>
      </ResponsiveContainer>
      <SeriesLegend items={present.map((t) => ({ label: t.label, color: DOC_COLORS[t.key] ?? TOTAL }))} />
    </div>
  )
}
