import { useMemo, useState } from "react"
import { cn } from "@/lib/utils"
import { useReport } from "@/lib/data/useReport"
import { useBudget } from "@/lib/data/useBudget"
import { useRentRollData } from "@/lib/data/useRentRoll"
import { runForecast, SCENARIOS, type Drivers } from "@/lib/data/forecast"
import { lastClosed, mLabel, mLong } from "@/lib/data/period"
import { ChartCard, ForecastChart, eurShort } from "@/components/charts/FinancialCharts"
import { PageIntro, KpiTile, EntitySelect, Segmented, TableCard, Chip, useEntityScope, eur, pct } from "@/components/report/Kit"
import { LoadingNote, ErrorNote, EmptyNote } from "@/components/StateNote"
import { useTourControl } from "@/lib/tourBus"

type Scenario = keyof typeof SCENARIOS | "custom"
const k = (n: number) => (Math.round(n / 1000) === 0 ? "–" : `${n < 0 ? "(" : ""}${Math.abs(Math.round(n / 1000)).toLocaleString("en-IE")}${n < 0 ? ")" : ""}`)

const DRIVERS: { key: keyof Drivers; label: string; min: number; max: number; step: number; unit: string; hint: string }[] = [
  { key: "renewal", label: "Lease renewals", min: 0, max: 100, step: 5, unit: "%", hint: "of expiring leases stay" },
  { key: "voidMonths", label: "Void before re-letting", min: 0, max: 18, step: 1, unit: " mo", hint: "empty months (flats ⅓)" },
  { key: "cpi", label: "Indexation / market growth", min: 0, max: 6, step: 0.5, unit: "%", hint: "p.a. — rents and ERV" },
  { key: "opexInfl", label: "Cost inflation", min: 0, max: 10, step: 0.5, unit: "%", hint: "p.a. on last year's costs" },
  { key: "badDebt", label: "Bad debt", min: 0, max: 6, step: 0.5, unit: "%", hint: "of revenue never collected" },
]

/**
 * Financial forecast — the next 12 months, built lease by lease from the rent
 * roll and moved by five drivers. Recomputed in the browser on every change.
 */
export function Forecast() {
  const { data: rows, isLoading, error } = useReport()
  const { data: budgets } = useBudget()
  const { data: roll } = useRentRollData()
  const { entityId, setEntityId, names, include } = useEntityScope()
  const [scenario, setScenario] = useState<Scenario>("base")
  const [drivers, setDrivers] = useState<Drivers>(SCENARIOS.base)
  const pick = (s: Scenario) => { setScenario(s); if (s !== "custom") setDrivers(SCENARIOS[s]) }
  useTourControl("scenario", (v) => pick(v as Scenario))

  const last = useMemo(() => lastClosed(rows ?? []), [rows])
  const fc = useMemo(() => {
    if (!rows || !budgets || !roll || !last) return null
    return runForecast({ data: roll, rows, budgets, last, include }, drivers)
  }, [rows, budgets, roll, last, include, drivers])

  const chart = useMemo(() => fc ? [
    ...fc.history.map((h, i) => ({ month: mLabel(h.month), actual: h.noi, forecast: i === fc.history.length - 1 ? h.noi : null, budget: h.budgetNoi })),
    ...fc.months.map((m) => ({ month: mLabel(m.month), actual: null, forecast: m.noi, budget: m.budgetNoi })),
  ] : [], [fc])

  const sum = (f: (m: NonNullable<typeof fc>["months"][number]) => number) => fc?.months.reduce((s, m) => s + f(m), 0) ?? 0
  const rev12 = sum((m) => m.revenue), noi12 = sum((m) => m.noi), ds12 = sum((m) => m.interest + m.principal)
  const bud12 = sum((m) => m.budgetNoi ?? 0)
  const dscr = ds12 ? noi12 / ds12 : 0
  const noiRow = fc?.outlook.find((r) => r.strong)

  return (
    <div className="relative">
      <PageIntro eyebrow="Rolling 12 months" title="Financial forecast">
        Next year's income built lease by lease from the rent roll: contracts run to expiry with their indexation,
        expiries renew or re-let after a void, costs follow last year plus inflation. Move a driver — it re-forecasts instantly.
      </PageIntro>

      {isLoading ? <LoadingNote label="loading forecast inputs…" />
        : error ? <ErrorNote message={error.message} />
        : !fc || !last ? <EmptyNote title="Nothing to forecast yet" hint="The forecast needs the rent roll and budgets from migration 38." />
        : (
        <div className="space-y-6">
          <div data-tour="fc-controls" className="space-y-4 rounded-[1.5rem] bg-card p-5 shadow-soft ring-1 ring-border md:p-6">
            <div className="flex flex-wrap items-center gap-3">
              <Segmented tour="fc-scenario" value={scenario} onChange={pick}
                options={[{ value: "downside", label: "Downside" }, { value: "base", label: "Base" }, { value: "upside", label: "Upside" }, { value: "custom", label: "Custom" }]} />
              <EntitySelect value={entityId} onChange={setEntityId} names={names} />
              <span className="ml-auto font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {mLong(fc.months[0].month)} – {mLong(fc.months[fc.months.length - 1].month)}
              </span>
            </div>
            <div data-tour="fc-drivers" className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-5">
              {DRIVERS.map((d) => (
                <label key={d.key} className="block">
                  <span className="flex items-baseline justify-between font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    {d.label}<span className="text-sm normal-case tracking-normal text-foreground tabular-nums">{drivers[d.key]}{d.unit}</span>
                  </span>
                  <input type="range" min={d.min} max={d.max} step={d.step} value={drivers[d.key]}
                    onChange={(e) => { setScenario("custom"); setDrivers((cur) => ({ ...cur, [d.key]: Number(e.target.value) })) }}
                    className="mt-2 w-full accent-accent" aria-label={d.label} />
                  <span className="font-mono text-[10px] text-muted-foreground/70">{d.hint}</span>
                </label>
              ))}
            </div>
          </div>

          <div data-tour="fc-kpis" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KpiTile i={0} label="Revenue · next 12 mo" value={rev12} format={eur.format} hint="after bad debt" />
            <KpiTile i={1} label="NOI · next 12 mo" value={noi12} format={eur.format} tone={noi12 >= bud12 ? "good" : "bad"}
              hint={`budget ${eurShort(bud12)} · ${noi12 >= bud12 ? "+" : "−"}${eurShort(Math.abs(noi12 - bud12))}`} />
            <KpiTile i={2} label="DSCR · next 12 mo" value={dscr} format={(n) => `${n.toFixed(2)}×`} tone={dscr >= 1.2 ? "good" : "bad"}
              hint="NOI ÷ debt service · covenant 1.20×" />
            <KpiTile i={3} label="Rent at risk" value={fc.rentAtRisk} format={eur.format} tone={fc.rentAtRisk > 0 ? "bad" : "good"}
              hint="p.a. expiring and not expected to renew" />
          </div>

          <ChartCard tour="fc-chart" title="Net operating income — actual → forecast" hint="vs budget">
            <ForecastChart data={chart} today={mLabel(last)} />
          </ChartCard>

          <div className="grid gap-5 xl:grid-cols-[1.25fr_1fr]">
            <TableCard tour="fc-outlook" title={`Full-year outlook · FY ${fc.outlookYear}`} hint="€ thousands">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-[13px]">
                  <thead className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    <tr className="border-b border-border">
                      <th className="px-5 py-2.5 text-left font-normal">Line</th>
                      <th className="px-2 py-2.5 text-right font-normal">Actual YTD</th>
                      <th className="px-2 py-2.5 text-right font-normal">+ Forecast</th>
                      <th className="px-2 py-2.5 text-right font-normal">= Outlook</th>
                      <th className="px-2 py-2.5 text-right font-normal">Budget</th>
                      <th className="px-5 py-2.5 text-right font-normal">Var.</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono tabular-nums">
                    {fc.outlook.map((r) => {
                      const v = r.favorableUp ? r.outlook - r.budget : r.budget - r.outlook
                      return (
                        <tr key={r.label} className={cn("border-b border-border/40", r.strong && "bg-secondary/40 font-semibold")}>
                          <td className="whitespace-nowrap px-5 py-2 font-sans">{r.label}</td>
                          <td className="px-2 py-2 text-right">{k(r.ytd)}</td>
                          <td className="px-2 py-2 text-right text-muted-foreground">{k(r.rest)}</td>
                          <td className="px-2 py-2 text-right">{k(r.outlook)}</td>
                          <td className="px-2 py-2 text-right text-muted-foreground">{k(r.budget)}</td>
                          <td className={cn("px-5 py-2 text-right", Math.abs(v) < 500 ? "text-muted-foreground" : v > 0 ? "text-accent" : "text-destructive")}>
                            {v > 0 ? "+" : ""}{k(v)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {noiRow && (
                <p className="border-t border-border px-5 py-3 font-mono text-[11px] text-muted-foreground">
                  NOI outlook <span className="text-foreground">{eurShort(noiRow.outlook)}</span> vs budget {eurShort(noiRow.budget)} —{" "}
                  {pct(noiRow.budget ? ((noiRow.outlook - noiRow.budget) / Math.abs(noiRow.budget)) * 100 : 0)} {noiRow.outlook >= noiRow.budget ? "ahead" : "short"}.
                </p>
              )}
            </TableCard>

            <TableCard tour="fc-events" title="What drives it" hint="biggest first" className="flex flex-col">
              {/* On wide screens the list takes the outlook table's height and scrolls. */}
              <div className="relative max-h-[360px] min-h-0 flex-1 xl:max-h-none">
              <div className="divide-y divide-border/50 overflow-auto xl:absolute xl:inset-0">
                {fc.events.map((e, i) => (
                  <div key={i} className="grid grid-cols-[1fr_auto] items-center gap-3 px-5 py-2.5">
                    <div className="min-w-0">
                      <div className="truncate text-sm">{e.tenant ?? `Unit ${e.unit} — vacant`}</div>
                      <div className="truncate font-mono text-[10px] text-muted-foreground">
                        {e.property.replace(/ s\.r\.o\.$/, "")} · {e.unit} · ERV {eurShort(e.ervPa)} p.a.
                      </div>
                    </div>
                    <div className="text-right">
                      {e.kind === "expiry"
                        ? <><div className="font-mono text-xs tabular-nums">{eurShort(e.rentPa)} p.a.</div><Chip tone="warn">{e.month <= last ? "ends" : "expires"} {mLabel(e.month)}</Chip></>
                        : <Chip tone="muted">let after {drivers.voidMonths} mo</Chip>}
                    </div>
                  </div>
                ))}
                {!fc.events.length && <p className="px-5 py-10 text-center font-mono text-xs text-muted-foreground">No expiries or vacancies in the next 12 months.</p>}
              </div>
              </div>
            </TableCard>
          </div>
        </div>
      )}
    </div>
  )
}
