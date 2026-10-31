import { useMemo, useState } from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { useReport } from "@/lib/data/useReport"
import { useBudget } from "@/lib/data/useBudget"
import { buildPl, profitBridge, lineVariances, scopeMonths, scopeOptions, scopeLabel } from "@/lib/data/pl"
import { addMonths, lastClosed, monthRange } from "@/lib/data/period"
import { Sparkline, COLORS, ChartCard, Waterfall, VarianceBars } from "@/components/charts/FinancialCharts"
import { PageIntro, EntitySelect, FilterLabel, useEntityScope, money } from "@/components/report/Kit"
import { LoadingNote, ErrorNote, EmptyNote } from "@/components/StateNote"
import { SimpleSelect } from "@/components/ui/select"
import { useTourControl } from "@/lib/tourBus"

const ROW = "grid grid-cols-[minmax(170px,1fr)_84px_repeat(3,minmax(84px,112px))_60px] items-center gap-x-3 px-5"

/**
 * The property P&L — Actual vs Budget for the chosen period, down to NOI and
 * profit before tax, with a 12-month trend per line.
 */
export function Pl() {
  const { data: rows, isLoading, error } = useReport()
  const { data: budgets } = useBudget()
  const { entityId, setEntityId, names, include } = useEntityScope()
  const [scope, setScope] = useState("ytd")
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const last = useMemo(() => lastClosed(rows ?? []), [rows])
  const first = useMemo(() => (rows ?? []).reduce((m, r) => (r.period.slice(0, 7) < m ? r.period.slice(0, 7) : m), "9999-12"), [rows])
  const months = useMemo(() => (last ? scopeMonths(scope, last) : new Set<string>()), [scope, last])
  const trend = useMemo(() => (last ? monthRange(addMonths(last, -11), last) : []), [last])

  const scoped = useMemo(() => (rows ?? []).filter((r) => include(r.entity_id)), [rows, include])
  const scopedBud = useMemo(() => (budgets ?? []).filter((b) => include(b.entity_id)), [budgets, include])
  const model = useMemo(() => buildPl(scoped, scopedBud, months, trend), [scoped, scopedBud, months, trend])
  const bridge = useMemo(() => profitBridge(model), [model])
  const variances = useMemo(() => lineVariances(model), [model])
  const hasBudget = scopedBud.length > 0

  // The guided tour narrows the statement to the last closed month (and back).
  useTourControl("period", (v) => setScope(v === "@latest" ? `m:${last}` : v))

  function toggle(id: string) {
    setCollapsed((cur) => { const n = new Set(cur); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  return (
    <div className="relative">
      <PageIntro eyebrow="Income statement" title="P&L">
        Revenue, the costs of running the buildings, and what is left: <span className="text-foreground">net operating
        income</span> — then depreciation and interest down to profit before tax. Every line against its budget.
      </PageIntro>

      {isLoading ? <LoadingNote label="loading statement…" />
        : error ? <ErrorNote message={error.message} />
        : !last ? <EmptyNote title="No report data for your entities" hint="Approve and load a batch on the Ingest page." />
        : (
        <div className="space-y-5">
          <div data-tour="pl-filters" className="flex flex-wrap items-center gap-3">
            <EntitySelect value={entityId} onChange={setEntityId} names={names} />
            <FilterLabel label="Period">
              <SimpleSelect aria-label="Period filter" value={scope} onValueChange={setScope} options={scopeOptions(last, first)} />
            </FilterLabel>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <ChartCard tour="pl-bridge" title="From revenue to profit" hint={scopeLabel(scope, last)}>
              <Waterfall steps={bridge} />
            </ChartCard>
            <ChartCard tour="pl-variance" title="Biggest variances vs budget" hint={scopeLabel(scope, last)}>
              {hasBudget && variances.length ? <VarianceBars data={variances} />
                : <p className="py-16 text-center font-mono text-xs text-muted-foreground">No budget for this scope.</p>}
            </ChartCard>
          </div>

          <div data-tour="pl-table" className="overflow-x-auto rounded-[1.5rem] bg-card shadow-soft ring-1 ring-border">
            <div className="min-w-[720px]">
              <div className={cn(ROW, "border-b border-border py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground")}>
                <span>Line · {scopeLabel(scope, last)}</span>
                <span className="text-center">12-mo trend</span>
                <span className="text-right">Actual</span>
                <span className="text-right">Budget</span>
                <span className="text-right">Variance</span>
                <span className="text-right">Var %</span>
              </div>

              {model.map((r) => {
                if (r.kind === "section") {
                  const open = !collapsed.has(r.id)
                  return (
                    <button key={r.id} data-tour="pl-section" onClick={() => toggle(r.id)}
                      className={cn(ROW, "w-full border-t border-border/60 py-2.5 text-left transition-colors hover:bg-secondary first:border-t-0")}>
                      <span className="flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-foreground/80">
                        <ChevronDown className={cn("size-3.5 transition-transform", !open && "-rotate-90")} /> {r.label}
                      </span>
                    </button>
                  )
                }
                if (r.kind === "line") {
                  if (collapsed.has(r.sectionId)) return null
                  const v = r.actual - r.budget
                  return (
                    <div key={r.code} className={cn(ROW, "py-2 text-sm hover:bg-secondary/50")}>
                      <span className="truncate pl-5 text-foreground/90"><span className="mr-2 font-mono text-xs text-muted-foreground">{r.code}</span>{r.label}</span>
                      <span className="h-7"><Sparkline data={r.monthly} color={r.favorableUp ? COLORS.income : COLORS.cost} /></span>
                      <span className="text-right font-mono tabular-nums">{money(r.actual)}</span>
                      <Budget hasBudget={hasBudget} value={r.budget} />
                      <Var hasBudget={hasBudget} v={v} favorableUp={r.favorableUp} />
                      <VarPct hasBudget={hasBudget} v={v} budget={r.budget} />
                    </div>
                  )
                }
                const v = r.actual - r.budget
                return (
                  <div key={r.id} data-tour={r.id === "noi" ? "pl-noi" : undefined}
                    className={cn(ROW, "border-t border-border py-2.5 font-medium", r.strong ? "bg-secondary/40 text-base" : "text-sm")}>
                    <span className={cn("font-semibold", r.strong && "text-foreground")}>{r.label}</span>
                    <span />
                    <span className="text-right font-mono font-semibold tabular-nums">{money(r.actual)}</span>
                    <Budget hasBudget={hasBudget} value={r.budget} bold />
                    <Var hasBudget={hasBudget} v={v} favorableUp={r.favorableUp} bold />
                    <VarPct hasBudget={hasBudget} v={v} budget={r.budget} bold />
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Budget({ hasBudget, value, bold }: { hasBudget: boolean; value: number; bold?: boolean }) {
  return <span className={cn("text-right font-mono tabular-nums text-muted-foreground", bold && "font-semibold")}>{hasBudget ? money(value) : "—"}</span>
}
function Var({ hasBudget, v, favorableUp, bold }: { hasBudget: boolean; v: number; favorableUp: boolean; bold?: boolean }) {
  if (!hasBudget) return <span className="text-right font-mono tabular-nums text-muted-foreground">—</span>
  const good = favorableUp ? v >= 0 : v <= 0
  return <span className={cn("text-right font-mono tabular-nums", bold && "font-semibold", Math.round(v) === 0 ? "text-muted-foreground" : good ? "text-accent" : "text-destructive")}>{money(v)}</span>
}
function VarPct({ hasBudget, v, budget, bold }: { hasBudget: boolean; v: number; budget: number; bold?: boolean }) {
  if (!hasBudget || budget === 0) return <span className="text-right font-mono tabular-nums text-muted-foreground">—</span>
  const p = Math.round((v / Math.abs(budget)) * 100) || 0 // no "-0%"
  return <span className={cn("text-right font-mono tabular-nums text-muted-foreground", bold && "font-semibold")}>{p}%</span>
}
