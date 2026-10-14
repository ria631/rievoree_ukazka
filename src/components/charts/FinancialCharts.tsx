import { useId, type ReactNode } from "react"
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, LabelList, Legend, Line,
  ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts"
import { ResponsiveTreeMap } from "@nivo/treemap"
import type { PnlPoint, Slice } from "@/lib/data/aggregate"
import type { WfStep } from "@/lib/data/balance"

// ── Palette ────────────────────────────────────────────────────────────────
// One meaning per colour, everywhere (concrete hex — SVG fills don't resolve CSS
// vars). Revenue / Expenses / Profit are a validated categorical trio for the
// dark card surface (OKLCH L 0.64–0.67, colour-blind ΔE ≥ 18). Totals in a
// waterfall are neutral slate; only a DECREASE uses red.
const REVENUE = "#23ac74"
const EXPENSE = "#847ce2"
const PROFIT = "#c28700"
const CASH = "#31a4af"
const TOTAL = "#78889b"
const DOWN = "#da534f"
const UP = REVENUE
const RAMP = ["#68d7a1", "#53c48e", "#3db07c", "#239d6a", "#008b59", "#007948"] // magnitude, big → small
const GRID = "rgba(255,255,255,0.06)"
const AXIS = "rgba(255,255,255,0.45)"
const INK = "rgba(255,255,255,0.86)"
const SURFACE = "#16171b"

export const COLORS = { emerald: REVENUE, teal: CASH, amber: PROFIT, violet: EXPENSE }
const BUCKET_COLORS = ["#4fc99a", "#e0b341", "#e0843e", "#e5584d"] // 0–30 … 90+ (a risk scale)

const REDUCE = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
const ANIM = !REDUCE

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
export function ChartCard({ title, hint, tour, children }: { title: string; hint?: string; tour?: string; children: ReactNode }) {
  return (
    // `tour` = the anchor the guided tour + X-RAY CODE inspector point at.
    <div data-tour={tour} className="rounded-[1.5rem] bg-card p-5 shadow-soft ring-1 ring-border md:p-6">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h3 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{title}</h3>
        {hint && <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

/** A legend in fixed series order (recharts' own sorts alphabetically). */
function SeriesLegend({ items }: { items: { label: string; color: string; kind?: "bar" | "line" | "area" }[] }) {
  return (
    <div className="mt-3 flex flex-wrap justify-center gap-x-5 gap-y-1.5 font-mono text-[11px] text-muted-foreground">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-2">
          {it.kind === "line"
            ? <span className="h-0.5 w-4 rounded-full" style={{ background: it.color }} />
            : <span className="size-2.5 rounded-[3px]" style={{ background: it.color, opacity: it.kind === "area" ? 0.75 : 1 }} />}
          {it.label}
        </span>
      ))}
    </div>
  )
}

function DarkTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl bg-[#14151a] px-3 py-2 font-mono text-xs shadow-soft ring-1 ring-white/15">
      {label && <div className="mb-1 text-white/55">{label}</div>}
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 tabular-nums">
          <span className="size-2 rounded-full" style={{ background: p.color }} />
          <span className="text-white/60">{p.name}</span>
          <span className="ml-auto pl-3 text-white/90">{/%/.test(p.name) ? `${Number(p.value).toFixed(1)}%` : eur.format(Number(p.value))}</span>
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
export function Sparkline({ data, color = REVENUE }: { data: number[]; color?: string }) {
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
    if (cur && `${cur} ${w}`.length > 12) { lines.push(cur); cur = w } else cur = cur ? `${cur} ${w}` : w
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
export function Waterfall({ steps }: { steps: WfStep[] }) {
  let run = 0
  const data = steps.map((s) => {
    if (s.isTotal) {
      run = s.value // a total rebases the running line (supports leading-total bridges)
      return { name: s.name, base: 0, bar: Math.abs(s.value), color: TOTAL, val: s.value, total: true, lab: eurShort(s.value) }
    }
    const start = run
    run += s.value
    return {
      name: s.name, base: Math.min(start, run), bar: Math.abs(s.value),
      color: s.value > 0 ? UP : s.value < 0 ? DOWN : TOTAL, val: s.value, total: false,
      lab: start === 0 && s === steps[0] ? eurShort(s.value) : signed(s.value),
    }
  })
  return (
    <div>
      <ResponsiveContainer width="100%" height={300}>
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

/** Stacked aging bars — one bar per entity, stacked by aging bucket. */
export function AgingStacked({ data, buckets }: { data: Record<string, string | number>[]; buckets: readonly string[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="name" interval={0} tick={<WrapTick />} height={38} tickLine={false} axisLine={{ stroke: GRID }} />
        <YAxis tick={TICK} tickLine={false} axisLine={false} tickFormatter={eurShort} width={Y_W} />
        <Tooltip content={<DarkTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
        <Legend wrapperStyle={{ fontFamily: "JetBrains Mono", fontSize: 11, color: AXIS }} />
        {buckets.map((b, i) => (
          <Bar key={b} dataKey={b} name={b} stackId="age" fill={BUCKET_COLORS[i % BUCKET_COLORS.length]}
            stroke={SURFACE} strokeWidth={1}
            radius={i === buckets.length - 1 ? [4, 4, 0, 0] : undefined} isAnimationActive={ANIM} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Revenue (bars) and operating margin (%) as two ALIGNED panels sharing one
 *  time axis and one hover — never two y-scales on one chart. The latest month
 *  is emphasised and labelled; history recedes. */
export function RevenueMarginCombo({ data }: { data: { month: string; revenue: number; marginPct: number }[] }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "")
  const last = data.length - 1
  const rows = data.map((d, i) => ({ ...d, lab: i === last ? eurShort(d.revenue) : "" }))
  return (
    <div>
      <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground/80">Revenue · per month</p>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={rows} syncId={`rm${id}`} margin={{ top: 18, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="month" hide />
          <YAxis tick={TICK} tickLine={false} axisLine={false} tickFormatter={eurShort} width={Y_W} tickCount={4} />
          <Tooltip content={<DarkTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
          <Bar dataKey="revenue" name="Revenue" radius={[4, 4, 0, 0]} isAnimationActive={ANIM}>
            {rows.map((_, i) => <Cell key={i} fill={REVENUE} fillOpacity={i === last ? 1 : 0.5} />)}
            <LabelList dataKey="lab" position="top" style={LABEL} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="mb-1 mt-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground/80">Operating margin · %</p>
      <ResponsiveContainer width="100%" height={110}>
        <AreaChart data={rows} syncId={`rm${id}`} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`mg${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={PROFIT} stopOpacity={0.3} />
              <stop offset="100%" stopColor={PROFIT} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="month" tick={TICK} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={24} />
          <YAxis tick={TICK} tickLine={false} axisLine={false} tickFormatter={(v) => `${Math.round(Number(v))}%`} width={Y_W} tickCount={3} domain={["auto", "auto"]} />
          <Tooltip content={<DarkTooltip />} />
          <Area dataKey="marginPct" name="Margin %" type="monotone" stroke={PROFIT} strokeWidth={2} fill={`url(#mg${id})`}
            dot={lastDot(rows.length, PROFIT)} isAnimationActive={ANIM} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Revenue and expenses as lines, profit (the gap) as a soft area. Clicking a
 *  month calls onSelectMonth (interactive drill into the table / period filter). */
export function PnlTrend({ data, onSelectMonth }: { data: PnlPoint[]; onSelectMonth?: (month: string) => void }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "")
  return (
    <div>
      <ResponsiveContainer width="100%" height={290}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          onClick={(s) => { const m = s?.activeLabel; if (onSelectMonth && m != null) onSelectMonth(String(m)) }}
          style={{ cursor: onSelectMonth ? "pointer" : "default" }}>
          <defs>
            <linearGradient id={`pf${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={PROFIT} stopOpacity={0.32} />
              <stop offset="100%" stopColor={PROFIT} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="month" tick={TICK} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={24} />
          <YAxis tick={TICK} tickLine={false} axisLine={false} tickFormatter={eurShort} width={Y_W} />
          <Tooltip content={<DarkTooltip />} />
          <Area isAnimationActive={ANIM} type="monotone" dataKey="profit" name="Profit" stroke={PROFIT} strokeWidth={1.8} fill={`url(#pf${id})`} />
          <Line isAnimationActive={ANIM} type="monotone" dataKey="revenue" name="Revenue" stroke={REVENUE} strokeWidth={2.2} dot={false} activeDot={{ r: 4 }} />
          <Line isAnimationActive={ANIM} type="monotone" dataKey="expenses" name="Expenses" stroke={EXPENSE} strokeWidth={2.2} dot={false} activeDot={{ r: 4 }} />
        </ComposedChart>
      </ResponsiveContainer>
      <SeriesLegend items={[
        { label: "Revenue", color: REVENUE, kind: "line" },
        { label: "Expenses", color: EXPENSE, kind: "line" },
        { label: "Profit (the gap)", color: PROFIT, kind: "area" },
      ]} />
    </div>
  )
}

/** Expense mix as a TREEMAP (not a pie). One hue, lighter = bigger, each tile
 *  labelled with its share — magnitude, not a rainbow of alarm colours. */
export function ExpenseTreemap({ data }: { data: Slice[] }) {
  const sorted = [...data].sort((a, b) => b.value - a.value)
  const total = sorted.reduce((s, d) => s + d.value, 0) || 1
  const shade = new Map(sorted.map((d, i) => [d.name, RAMP[Math.min(i, RAMP.length - 1)]]))
  const root = { name: "Expenses", children: sorted.map((d) => ({ name: d.name, value: d.value })) }
  return (
    <div style={{ height: 300 }}>
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

/** Month-over-month growth (%) — revenue vs expenses, grouped, around a clear
 *  zero line. Expenses outgrowing revenue = margin squeeze. */
export function GrowthBars({ data }: { data: { month: string; revGrowth: number; expGrowth: number }[] }) {
  return (
    <div>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="month" tick={TICK} tickLine={false} axisLine={false} minTickGap={24} />
          <YAxis tick={TICK} tickLine={false} axisLine={false} tickFormatter={(v) => `${Math.round(Number(v))}%`} width={Y_W} />
          <ReferenceLine y={0} stroke="rgba(255,255,255,0.28)" />
          <Tooltip content={<DarkTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
          <Bar dataKey="revGrowth" name="Revenue %" fill={REVENUE} radius={[3, 3, 3, 3]} isAnimationActive={ANIM} />
          <Bar dataKey="expGrowth" name="Expenses %" fill={EXPENSE} radius={[3, 3, 3, 3]} isAnimationActive={ANIM} />
        </BarChart>
      </ResponsiveContainer>
      <SeriesLegend items={[{ label: "Revenue growth", color: REVENUE }, { label: "Expense growth", color: EXPENSE }]} />
    </div>
  )
}

/** Horizontal "leaderboard" — top accounts by size, revenue vs expense, each
 *  labelled at the bar end so it reads without a hover. */
export function TopAccountsBars({ data }: { data: { name: string; value: number; kind: "revenue" | "expense" }[] }) {
  const height = Math.max(200, data.length * 42)
  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 60, bottom: 0, left: 4 }}>
          <CartesianGrid stroke={GRID} horizontal={false} />
          <XAxis type="number" tick={TICK} tickLine={false} axisLine={false} tickFormatter={eurShort} />
          <YAxis type="category" dataKey="name" width={132} tick={TICK} tickLine={false} axisLine={false} />
          <Tooltip content={<DarkTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
          <Bar dataKey="value" name="Amount" radius={[0, 4, 4, 0]} barSize={22} isAnimationActive={ANIM}>
            {data.map((d, i) => <Cell key={i} fill={d.kind === "revenue" ? REVENUE : EXPENSE} />)}
            <LabelList dataKey="value" position="right" formatter={(v) => eurShort(Number(v))} style={LABEL} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <SeriesLegend items={[{ label: "Revenue", color: REVENUE }, { label: "Expense", color: EXPENSE }]} />
    </div>
  )
}

/** Single-series area trend — e.g. cash position over 18 months; the latest
 *  value is marked and labelled. */
export function CashTrend({ data }: { data: { month: string; value: number }[] }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "")
  const last = data.length - 1
  const rows = data.map((d, i) => ({ ...d, lab: i === last ? eurShort(d.value) : "" }))
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={rows} margin={{ top: 22, right: 40, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={`ca${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CASH} stopOpacity={0.32} />
            <stop offset="100%" stopColor={CASH} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="month" tick={TICK} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={24} />
        <YAxis tick={TICK} tickLine={false} axisLine={false} tickFormatter={eurShort} width={Y_W} />
        <Tooltip content={<DarkTooltip />} />
        <Area isAnimationActive={ANIM} type="monotone" dataKey="value" name="Cash" stroke={CASH} strokeWidth={2.2}
          fill={`url(#ca${id})`} dot={lastDot(rows.length, CASH)}>
          <LabelList dataKey="lab" position="top" style={LABEL} />
        </Area>
      </AreaChart>
    </ResponsiveContainer>
  )
}

/** Horizontal magnitude bars (one hue) — e.g. pivot row totals, ranked. */
export function MagnitudeBars({ data }: { data: { name: string; value: number }[] }) {
  const height = Math.max(180, data.length * 40)
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 60, bottom: 0, left: 4 }}>
        <CartesianGrid stroke={GRID} horizontal={false} />
        <XAxis type="number" tick={TICK} tickLine={false} axisLine={false} tickFormatter={eurShort} />
        <YAxis type="category" dataKey="name" width={150} tick={TICK} tickLine={false} axisLine={false} />
        <Tooltip content={<DarkTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
        <Bar dataKey="value" name="Magnitude" radius={[0, 4, 4, 0]} barSize={20} isAnimationActive={ANIM}>
          {data.map((_, i) => <Cell key={i} fill={RAMP[2]} fillOpacity={i < 3 ? 1 : 0.6} />)}
          <LabelList dataKey="value" position="right" formatter={(v) => eurShort(Number(v))} style={LABEL} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

/** A 100%-stacked composition bar (pure CSS) with a legend — crisp for a
 *  "share of total" read (capital structure, aging buckets). */
export function CompositionBar({ parts }: { parts: { name: string; value: number; color: string }[] }) {
  const total = parts.reduce((s, p) => s + Math.max(0, p.value), 0) || 1
  return (
    <div>
      <div className="flex h-7 w-full gap-[2px] overflow-hidden rounded-lg">
        {parts.map((p) => {
          const pct = (Math.max(0, p.value) / total) * 100
          if (pct <= 0) return null
          return (
            <div key={p.name} className="flex items-center justify-center font-mono text-[10px] font-semibold text-black/75"
              style={{ width: `${pct}%`, background: p.color }} title={`${p.name}: ${eur.format(p.value)}`}>
              {pct >= 9 ? `${pct.toFixed(0)}%` : ""}
            </div>
          )
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
        {parts.map((p) => (
          <span key={p.name} className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
            <span className="size-2.5 rounded-sm" style={{ background: p.color }} />
            {p.name}
            <span className="tabular-nums text-foreground/80">{eur.format(p.value)} · {((Math.max(0, p.value) / total) * 100).toFixed(0)}%</span>
          </span>
        ))}
      </div>
    </div>
  )
}
