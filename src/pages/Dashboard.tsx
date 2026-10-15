import { useMemo } from "react"
import { motion } from "motion/react"
import { cn } from "@/lib/utils"
import { useReport } from "@/lib/data/useReport"
import { useRentRollData } from "@/lib/data/useRentRoll"
import { monthlySeries, kpiOf, lastN, opexByAccount, noiByEntity } from "@/lib/data/aggregate"
import { buildRentRoll, rollKpis, occupancySeries } from "@/lib/data/rentroll"
import { addMonths, lastClosed, mLabel, mLong, monthEnd, monthRange } from "@/lib/data/period"
import { ChartCard, NoiTrend, ExpenseTreemap, RankBars, COLORS, eurShort } from "@/components/charts/FinancialCharts"
import { PageIntro, KpiTile, EntitySelect, useEntityScope, eur, pct } from "@/components/report/Kit"
import { LoadingNote, ErrorNote, EmptyNote } from "@/components/StateNote"

/**
 * Portfolio overview — the four numbers an asset manager opens first (income,
 * NOI, occupancy, cash), the health ratios a lender checks (NOI margin, WALT,
 * DSCR, LTV), and where the money comes from and goes.
 */
export function Dashboard() {
  const { data: rows, isLoading, error } = useReport()
  const { data: roll } = useRentRollData()
  const { entityId, setEntityId, names, include } = useEntityScope()

  const scoped = useMemo(() => (rows ?? []).filter((r) => include(r.entity_id)), [rows, include])
  const last = useMemo(() => lastClosed(rows ?? []), [rows])
  const series = useMemo(() => monthlySeries(scoped), [scoped])
  const ltm = useMemo(() => new Set(last ? monthRange(addMonths(last, -11), last) : []), [last])

  const revenue = kpiOf(series, (p) => p.revenue)
  const noi = kpiOf(series, (p) => p.noi)
  const bank = kpiOf(series, (p) => p.bank)
  const roll12 = useMemo(() => {
    if (!roll || !last) return null
    const data = { ...roll, units: roll.units.filter((u) => include(u.entity_id)), leases: roll.leases.filter((l) => include(l.entity_id)) }
    const k = rollKpis(buildRentRoll(data, [], monthEnd(last)))
    const spark = occupancySeries(roll, monthRange(addMonths(last, -11), last), include)
    const valuation = roll.properties.filter((p) => include(p.entity_id)).reduce((s, p) => s + p.valuation, 0)
    return { k, spark, valuation }
  }, [roll, last, include])

  const noiLtm = lastN(series, (p) => p.noi)
  const revLtm = lastN(series, (p) => p.revenue)
  const debtService = lastN(series, (p) => p.interest + p.principal)
  const loan = series.at(-1)?.loan ?? 0
  const dscr = debtService > 0 ? noiLtm / debtService : 0
  const ltv = roll12?.valuation ? (loan / roll12.valuation) * 100 : 0

  const trend = useMemo(() => series.map((p) => ({ month: mLabel(p.month), revenue: p.revenue, opex: p.opex, noi: p.noi })), [series])
  const byBuilding = useMemo(() => noiByEntity(scoped, new Map([...names].map(([k, v]) => [k, v.replace(/ s\.r\.o\.$/, "")])), ltm), [scoped, names, ltm])
  const costs = useMemo(() => opexByAccount(scoped, ltm), [scoped, ltm])

  return (
    <div className="relative">
      <PageIntro eyebrow="Portfolio overview" title="Dashboard">
        Four buildings, one view: what they earn, how full they are, how much cash is in the bank
        — and whether the lender would be comfortable. {last && <>Books closed to <span className="text-foreground">{mLong(last)}</span>.</>}
      </PageIntro>

      {isLoading ? <LoadingNote label="loading portfolio…" />
        : error ? <ErrorNote message={error.message} />
        : !last ? <EmptyNote title="No report data for your entities" hint="Once a batch is approved and loaded, figures appear here." />
        : (
        <div className="space-y-8">
          <div data-tour="dash-top" className="space-y-6">
            <div data-tour="dash-filter" className="flex w-fit items-center gap-3">
              <EntitySelect value={entityId} onChange={setEntityId} names={names} />
            </div>
            <div data-tour="dash-kpis" className="grid grid-cols-2 gap-4 lg:grid-cols-4 lg:gap-5">
              <KpiTile i={0} label="Revenue · last month" value={revenue.value} format={eur.format} delta={revenue.delta}
                spark={revenue.spark} color={COLORS.income} hint="rent + service charge + parking" />
              <KpiTile i={1} label="NOI · last month" value={noi.value} format={eur.format} delta={noi.delta}
                spark={noi.spark} color={COLORS.noi} hint={`${pct(revenue.value ? (noi.value / revenue.value) * 100 : 0)} of revenue kept`} />
              <KpiTile i={2} label="Occupancy" value={roll12?.k.occupancyPct ?? 0} format={(n) => pct(n)}
                spark={roll12?.spark} color={COLORS.cash} hint={roll12 ? `${Math.round(roll12.k.vacantArea).toLocaleString("en-IE")} m² vacant` : "by area"} />
              <KpiTile i={3} label="Cash in bank" value={bank.value} format={eur.format} delta={bank.delta}
                spark={bank.spark} color={COLORS.cash} hint="closing balance, account 1000" />
            </div>
          </div>

          <div data-tour="dash-ratios" className="grid grid-cols-2 gap-4 lg:grid-cols-4 lg:gap-5">
            <RatioTile label="NOI margin · 12 mo" value={pct(revLtm ? (noiLtm / revLtm) * 100 : 0)} hint="NOI ÷ revenue" good={noiLtm / (revLtm || 1) >= 0.65} />
            <RatioTile label="WALT" value={`${(roll12?.k.walt ?? 0).toFixed(1)} yrs`} hint="rent-weighted lease term left" good={(roll12?.k.walt ?? 0) >= 3} />
            <RatioTile label="DSCR · 12 mo" value={`${dscr.toFixed(2)}×`} hint="NOI ÷ (interest + principal) · covenant 1.20×" good={dscr >= 1.2} />
            <RatioTile label="LTV" value={pct(ltv)} hint={`loan ${eurShort(loan)} ÷ value ${eurShort(roll12?.valuation ?? 0)}`} good={ltv > 0 && ltv <= 60} />
          </div>

          <motion.div initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ duration: 0.45 }}>
            <ChartCard tour="dash-noi" title="Revenue, operating costs & NOI" hint={`${series.length} months`}>
              <NoiTrend data={trend} />
            </ChartCard>
          </motion.div>

          <div className="grid gap-5 lg:grid-cols-2">
            <motion.div initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ duration: 0.45 }}>
              <ChartCard tour="dash-buildings" title="NOI by building" hint="last 12 months">
                <RankBars data={byBuilding} color={COLORS.noi} labelWidth={170} height={260} />
              </ChartCard>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ duration: 0.45, delay: 0.08 }}>
              <ChartCard tour="dash-costs" title="Operating cost structure" hint="last 12 months">
                <ExpenseTreemap data={costs} height={260} />
              </ChartCard>
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
