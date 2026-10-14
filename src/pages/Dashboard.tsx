import { useMemo, useState } from "react"
import { motion } from "motion/react"
import { cn } from "@/lib/utils"
import { useReport } from "@/lib/data/useReport"
import { useEntities } from "@/lib/data/useEntities"
import { monthlyPnl, expenseByAccount, executiveSeries, executiveKpis, momGrowth, financialRatios, type Kpi } from "@/lib/data/aggregate"
import { ChartCard, PnlTrend, ExpenseTreemap, RevenueMarginCombo, GrowthBars, Sparkline, COLORS } from "@/components/charts/FinancialCharts"
import { CountUp } from "@/components/CountUp"
import { LoadingNote, ErrorNote, EmptyNote } from "@/components/StateNote"
import { SimpleSelect } from "@/components/ui/select"
import { useTourControl } from "@/lib/tourBus"

const eur = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })

export function Dashboard() {
  const { data: rows, isLoading, error } = useReport()
  const { data: entities } = useEntities()
  const [entityId, setEntityId] = useState("all")

  const names = useMemo(() => new Map((entities ?? []).map((e) => [e.id, e.name])), [entities])
  const filtered = useMemo(() => (rows ?? []).filter((r) => entityId === "all" || r.entity_id === entityId), [rows, entityId])
  // The guided tour can flip the entity filter to show the numbers re-computing.
  useTourControl("entity", (v) => setEntityId(v === "@first" ? ([...names.keys()][0] ?? "all") : v))

  const exec = useMemo(() => executiveSeries(filtered), [filtered])
  const k = useMemo(() => executiveKpis(exec), [exec])
  const combo = useMemo(() => exec.map((p) => ({ month: p.month, revenue: p.revenue, marginPct: p.marginPct })), [exec])
  const pnl = useMemo(() => monthlyPnl(filtered), [filtered])
  const expenses = useMemo(() => expenseByAccount(filtered), [filtered])
  const growth = useMemo(() => momGrowth(exec), [exec])
  const ratios = useMemo(() => financialRatios(filtered), [filtered])

  const cards: { label: string; kpi: Kpi; fmt: (n: number) => string; goodUp: boolean; color: string }[] = [
    { label: "Revenue · last mo.", kpi: k.revenue, fmt: (n) => eur.format(n), goodUp: true, color: COLORS.emerald },
    { label: "EBITDA · last mo.", kpi: k.ebitda, fmt: (n) => eur.format(n), goodUp: true, color: COLORS.emerald },
    { label: "Cash position", kpi: k.cash, fmt: (n) => eur.format(n), goodUp: true, color: COLORS.teal },
    { label: "DSO (days)", kpi: k.dso, fmt: (n) => `${Math.round(n)}d`, goodUp: false, color: COLORS.amber },
  ]

  return (
    <div className="relative">
      <motion.header
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: "easeOut" }}
        className="pb-10">
        <span className="font-mono text-xs font-semibold uppercase tracking-widest text-accent">Executive overview</span>
        <h1 className="mt-3 text-5xl font-semibold tracking-tight md:text-6xl lg:text-7xl">Dashboard</h1>
        <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
          The CFO snapshot — live, RLS-filtered figures for the entities your role can see.
          Inspect the query and policy in the X-ray panel.
        </p>
      </motion.header>

      {isLoading ? (
        <LoadingNote label="loading report…" />
      ) : error ? (
        <ErrorNote message={error.message} />
      ) : (rows?.length ?? 0) === 0 ? (
        <EmptyNote title="No report data for your entities"
          hint="Once a batch is approved and loaded, figures appear here." />
      ) : (
        <div className="space-y-8">
          {/* Filter + KPI tiles grouped, so the tour can show the tiles re-computing. */}
          <div data-tour="dash-top" className="space-y-8">
          {names.size > 1 && (
            <div data-tour="dash-filter" className="flex w-fit items-center gap-3">
              <label className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Entity
                <SimpleSelect
                  aria-label="Entity filter"
                  value={entityId}
                  onValueChange={setEntityId}
                  options={[
                    { value: "all", label: `All (${names.size})` },
                    ...[...names.entries()].map(([id, name]) => ({ value: id, label: name })),
                  ]}
                />
              </label>
            </div>
          )}

          {/* KPI cards with sparkline + MoM delta */}
          <div data-tour="dash-kpis" className="grid grid-cols-2 gap-4 lg:grid-cols-4 lg:gap-5">
            {cards.map((c, i) => (
              <motion.div key={c.label}
                initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: i * 0.06, ease: "easeOut" }}
                data-live={`${c.label.replace(" · last mo.", "")} ${c.fmt(c.kpi.value)}${c.kpi.delta == null ? "" : ` (${c.kpi.delta >= 0 ? "▲" : "▼"}${Math.abs(c.kpi.delta).toFixed(1)}% m/m)`}`}
                className="rounded-2xl bg-card p-5 shadow-soft ring-1 ring-border">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{c.label}</span>
                  <DeltaChip delta={c.kpi.delta} goodUp={c.goodUp} />
                </div>
                <div className="mt-2 text-2xl font-semibold tabular-nums lg:text-3xl">
                  <CountUp value={c.kpi.value} format={c.fmt} delay={i * 0.06} />
                </div>
                <div className="mt-1.5 h-9"><Sparkline data={c.kpi.spark} color={c.color} /></div>
              </motion.div>
            ))}
          </div>

          </div>

          {/* Key financial ratios — the health read execs scan first. */}
          <div data-tour="dash-ratios" className="grid grid-cols-2 gap-4 lg:grid-cols-4 lg:gap-5">
            <RatioTile label="Gross margin" value={`${ratios.grossMarginPct.toFixed(1)}%`}
              hint="revenue kept after COGS" good={ratios.grossMarginPct >= 40} />
            <RatioTile label="Current ratio" value={`${ratios.currentRatio.toFixed(2)}×`}
              hint="current assets ÷ liabilities" good={ratios.currentRatio >= 1.5} />
            <RatioTile label="DPO (days)" value={`${Math.round(ratios.dpo)}d`}
              hint="days to pay suppliers" good={ratios.dpo >= 30} />
            <RatioTile label="Cash runway"
              value={ratios.runwayMonths == null ? "∞" : `${Math.round(ratios.runwayMonths)} mo`}
              hint={ratios.runwayMonths == null ? "cash-flow positive" : "months at current burn"}
              good={ratios.runwayMonths == null || ratios.runwayMonths >= 12} />
          </div>

          {/* Combo: revenue bars + operating margin % line */}
          <motion.div initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ duration: 0.45 }}>
            <ChartCard tour="dash-combo" title="Revenue & operating margin" hint="18 months">
              <RevenueMarginCombo data={combo} />
            </ChartCard>
          </motion.div>

          {/* Momentum — month-over-month growth of revenue vs expenses. */}
          <motion.div initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ duration: 0.45 }}>
            <ChartCard tour="dash-growth" title="Momentum · month-over-month growth" hint="revenue vs expenses">
              <GrowthBars data={growth} />
            </ChartCard>
          </motion.div>

          {/* Revenue vs expenses + expense mix */}
          <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
            <motion.div initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ duration: 0.45 }}>
              <ChartCard tour="dash-pnl" title="Revenue vs expenses" hint="€"><PnlTrend data={pnl} /></ChartCard>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ duration: 0.45, delay: 0.08 }}>
              <ChartCard tour="dash-treemap" title="Cost structure" hint="COGS + opex"><ExpenseTreemap data={expenses} /></ChartCard>
            </motion.div>
          </div>
        </div>
      )}
    </div>
  )
}

/** A compact ratio tile — value + one-line meaning, accent when healthy. */
function RatioTile({ label, value, hint, good }: { label: string; value: string; hint: string; good: boolean }) {
  return (
    <div data-live={`${label} ${value}`} className="rounded-2xl bg-card p-5 shadow-soft ring-1 ring-border">
      <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
      <div className={cn("mt-2 text-2xl font-semibold tabular-nums lg:text-3xl", good ? "text-accent" : "text-foreground")}>{value}</div>
      <div className="mt-1 font-mono text-[10px] leading-snug text-muted-foreground/80">{hint}</div>
    </div>
  )
}

function DeltaChip({ delta, goodUp }: { delta: number | null; goodUp: boolean }) {
  if (delta == null) return null
  // No change is neutral — not a red "▲ 0.0%".
  if (Math.abs(delta) < 0.05) return <span className="font-mono text-[10px] tabular-nums text-muted-foreground">— 0.0%</span>
  const up = delta >= 0
  const good = goodUp ? up : !up
  return (
    <span className={cn("font-mono text-[10px] tabular-nums", good ? "text-accent" : "text-destructive")}>
      {up ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}%
    </span>
  )
}
