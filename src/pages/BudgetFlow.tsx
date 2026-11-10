import { useMemo, useState } from "react"
import { cn } from "@/lib/utils"
import { useReport } from "@/lib/data/useReport"
import { useCashActual, useCashBudget } from "@/lib/data/useCash"
import { buildCashModel, cashBridge, type CashModel } from "@/lib/data/cashflow"
import { lastClosed, mLabel, mLong } from "@/lib/data/period"
import { ChartCard, CashPlanChart, Waterfall, eurShort } from "@/components/charts/FinancialCharts"
import { PageIntro, KpiTile, EntitySelect, FilterLabel, Segmented, TableCard, useEntityScope, eur } from "@/components/report/Kit"
import { SimpleSelect } from "@/components/ui/select"
import { LoadingNote, ErrorNote, EmptyNote } from "@/components/StateNote"
import { useTourControl } from "@/lib/tourBus"

type View = "values" | "variance"

/**
 * Budget flow — the cash budget. Where the year's money is planned to come
 * from and go to, month by month, against what the bank statements say.
 */
export function BudgetFlow() {
  const { data: actual, isLoading, error } = useCashActual()
  const { data: plan } = useCashBudget()
  const { data: rows } = useReport()
  const { entityId, setEntityId, names, include } = useEntityScope()
  const last = useMemo(() => lastClosed(rows ?? []), [rows])
  const [yearSel, setYear] = useState<string | null>(null)
  const [view, setView] = useState<View>("values")
  useTourControl("view", (v) => setView(v as View))
  const year = yearSel ?? last?.slice(0, 4) ?? ""

  const model = useMemo(() => {
    if (!last || !actual || !plan) return null
    return buildCashModel(actual.filter((r) => include(r.entity_id)), plan.filter((r) => include(r.entity_id)), year, last)
  }, [actual, plan, include, year, last])
  const bridge = useMemo(() => (model ? cashBridge(model) : []), [model])
  const chart = useMemo(() => model?.months.map((m, i) => ({
    month: mLabel(m), actual: model.closingActual[i], plan: model.closingPlan[i],
    // The outlook line starts at the last actual point so the two join up.
    outlook: !model.closed[i] || (model.closed[i] && !model.closed[i + 1]) ? model.closingOutlook[i] : null,
  })) ?? [], [model])

  const years = last ? [String(Number(last.slice(0, 4)) - 1), last.slice(0, 4)] : []
  const closedN = model?.closed.filter(Boolean).length ?? 0

  return (
    <div className="relative">
      <PageIntro eyebrow="Cash budget" title="Budget flow">
        The year's cash plan by category — tenant receipts in; running costs, tax, capex, debt service and
        dividends out — against what actually went through the bank.
        {last && <> Actuals to <span className="text-foreground">{mLong(last)}</span>, plan after.</>}
      </PageIntro>

      {isLoading ? <LoadingNote label="loading cash budget…" />
        : error ? <ErrorNote message={error.message} />
        : !model || !plan?.length ? <EmptyNote title="No cash budget yet" hint="Apply migration 38 and run the demo generator — the plan and the bank actuals appear here." />
        : (
        <div className="space-y-6">
          <div data-tour="cf-filters" className="flex flex-wrap items-center gap-3">
            <EntitySelect value={entityId} onChange={setEntityId} names={names} />
            <FilterLabel label="Year">
              <SimpleSelect aria-label="Year" value={year} onValueChange={setYear} options={years.map((y) => ({ value: y, label: `FY ${y}` }))} />
            </FilterLabel>
          </div>

          <div data-tour="cf-kpis" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KpiTile i={0} label={closedN === 12 ? "Cash 31 Dec" : "Cash today"} value={model.opening + model.ytdActual} format={eur.format}
              hint={`opened the year at ${eurShort(model.opening)}`} />
            <KpiTile i={1} label={`Net cash flow · ${closedN} mo`} value={model.ytdActual} format={(n) => (n >= 0 ? "+" : "−") + eur.format(Math.abs(n))}
              tone={model.ytdActual >= model.ytdPlan ? "good" : "bad"}
              hint={`plan ${model.ytdPlan >= 0 ? "+" : "−"}${eurShort(Math.abs(model.ytdPlan))} · ${model.ytdActual - model.ytdPlan >= 0 ? "ahead" : "behind"} by ${eurShort(Math.abs(model.ytdActual - model.ytdPlan))}`} />
            <KpiTile i={2} label="Year-end cash · outlook" value={model.opening + model.fyOutlook} format={eur.format}
              hint={`plan ${eurShort(model.opening + model.fyPlan)} · actuals + remaining plan`} />
            <KpiTile i={3} label="Lowest point" value={model.lowest.value} format={eur.format}
              tone={model.lowest.value >= model.buffer ? "good" : "bad"}
              hint={`${mLong(model.lowest.month)} · buffer ${eurShort(model.buffer)}`} />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <ChartCard tour="cf-balance" title="Cash balance through the year" hint={`FY ${year}`}>
              <CashPlanChart data={chart} buffer={model.buffer} />
            </ChartCard>
            <ChartCard tour="cf-bridge" title="Where the cash went" hint={`1 Jan → ${closedN === 12 ? "31 Dec" : "today"}`}>
              <Waterfall steps={bridge} height={290} />
            </ChartCard>
          </div>

          <TableCard tour="cf-table" title={`Cash budget · FY ${year}`}
            hint={<Segmented tour="cf-view" value={view} onChange={setView}
              options={[{ value: "values", label: "Actual / plan" }, { value: "variance", label: "Variance" }]} />}>
            <CashTable m={model} view={view} />
          </TableCard>
        </div>
      )}
    </div>
  )
}

const k0 = (n: number) => (Math.round(n / 1000) === 0 ? "–" : `${n < 0 ? "−" : ""}${Math.abs(Math.round(n / 1000)).toLocaleString("en-IE")}`)

/** The classic cash budget matrix (in € thousands). Closed months show actuals
 *  (or actual − plan), open months the plan in italics. */
function CashTable({ m, view }: { m: CashModel; view: View }) {
  const cell = (a: number | null, p: number, i: number, good: (v: number) => boolean) => {
    if (!m.closed[i]) return <span className="italic text-muted-foreground/70">{view === "values" ? k0(p) : ""}</span>
    if (view === "values") return <span>{k0(a ?? 0)}</span>
    const v = (a ?? 0) - p
    return <span className={cn(Math.abs(v) < 500 ? "text-muted-foreground" : good(v) ? "text-accent" : "text-destructive")}>{k0(v)}</span>
  }
  const cols = "grid grid-cols-[minmax(150px,1.5fr)_repeat(12,minmax(42px,1fr))_minmax(58px,1fr)_minmax(58px,1fr)] items-center gap-x-1.5 px-5"
  const row = (label: string, a: (number | null)[], p: number[], ytdA: number, fy: number, strong = false) => (
    <div key={label} className={cn(cols, "py-1.5 font-mono text-[11.5px] tabular-nums", strong ? "border-t border-border bg-secondary/40 font-semibold" : "hover:bg-secondary/40")}>
      <span className={cn("truncate font-sans text-[13px]", strong ? "text-foreground" : "text-foreground/85")}>{label}</span>
      {m.months.map((_, i) => <span key={i} className="text-right">{cell(a[i], p[i], i, (v) => v >= 0)}</span>)}
      <span className="text-right">{view === "values" ? k0(ytdA) : <span className={ytdA - p.reduce((s, v, i) => s + (m.closed[i] ? v : 0), 0) >= 0 ? "text-accent" : "text-destructive"}>{k0(ytdA - p.reduce((s, v, i) => s + (m.closed[i] ? v : 0), 0))}</span>}</span>
      <span className="text-right text-muted-foreground">{k0(fy)}</span>
    </div>
  )
  const inflows = m.lines.filter((l) => l.dir === "in"), outflows = m.lines.filter((l) => l.dir === "out")
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[940px] pb-2">
        <div className={cn(cols, "border-b border-border py-2.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground")}>
          <span>€ thousands</span>
          {m.months.map((mo, i) => <span key={mo} className={cn("text-right", m.closed[i] ? "text-foreground/80" : "text-muted-foreground/60")}>{mLabel(mo).slice(0, 3)}</span>)}
          <span className="text-right">{view === "values" ? "YTD" : "Var YTD"}</span>
          <span className="text-right">Plan FY</span>
        </div>
        <Group title="Cash in" />
        {inflows.map((l) => row(l.label, l.actual, l.plan, l.ytdActual, l.fyPlan))}
        <Group title="Cash out" />
        {outflows.map((l) => row(l.label, l.actual, l.plan, l.ytdActual, l.fyPlan))}
        {row("Net cash flow", m.netActual, m.netPlan, m.ytdActual, m.fyPlan, true)}
        {view === "values" && (
          <div className={cn(cols, "border-t border-border py-2 font-mono text-[11.5px] font-semibold tabular-nums")}>
            <span className="font-sans text-[13px] text-foreground">Closing cash</span>
            {m.months.map((_, i) => (
              <span key={i} className={cn("text-right", !m.closed[i] && "italic text-muted-foreground/70")}>{k0(m.closingOutlook[i])}</span>
            ))}
            <span className="text-right">{k0(m.opening + m.ytdActual)}</span>
            <span className="text-right text-muted-foreground">{k0(m.opening + m.fyPlan)}</span>
          </div>
        )}
      </div>
    </div>
  )
}

function Group({ title }: { title: string }) {
  return <div className="px-5 pb-1 pt-3 font-mono text-[10px] uppercase tracking-widest text-accent/80">{title}</div>
}
