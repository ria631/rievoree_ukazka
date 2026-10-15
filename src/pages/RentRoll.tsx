import { Fragment, useMemo, useState } from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { useReport } from "@/lib/data/useReport"
import { useRentRollData } from "@/lib/data/useRentRoll"
import { useOpenItems } from "@/lib/data/useInvoices"
import { buildRentRoll, rollKpis, expiryProfile, tenantConcentration, type RollRow } from "@/lib/data/rentroll"
import { dLong, lastClosed, monthEnd } from "@/lib/data/period"
import { ChartCard, ExpiryBars, RankBars, COLORS } from "@/components/charts/FinancialCharts"
import { PageIntro, KpiTile, EntitySelect, Segmented, Chip, TableCard, useEntityScope, eur, num, pct } from "@/components/report/Kit"
import { LoadingNote, ErrorNote, EmptyNote } from "@/components/StateNote"
import { useTourControl } from "@/lib/tourBus"

type Status = "all" | "let" | "vacant" | "expiring"
const COLS = "grid grid-cols-[58px_minmax(150px,1.6fr)_62px_124px_52px_82px_54px_54px_64px_86px] items-center gap-x-2.5 px-5"

/**
 * Rent roll — every unit, who rents it, on what terms and until when. The
 * income of a property company IS this table; the KPIs above are its totals.
 */
export function RentRoll() {
  const { data: roll, isLoading, error } = useRentRollData()
  const { data: rows } = useReport()
  const { data: open } = useOpenItems()
  const { entityId, setEntityId, names, include } = useEntityScope()
  const [status, setStatus] = useState<Status>("all")
  useTourControl("status", (v) => setStatus(v as Status))

  const last = useMemo(() => lastClosed(rows ?? []), [rows])
  const asOf = last ? monthEnd(last) : null
  const all = useMemo(() => {
    if (!roll || !asOf) return []
    return buildRentRoll(roll, open ?? [], asOf).filter((r) => include(r.entityId))
  }, [roll, open, asOf, include])
  const k = useMemo(() => rollKpis(all), [all])
  const expiry = useMemo(() => expiryProfile(all), [all])
  const conc = useMemo(() => tenantConcentration(all, 7), [all])
  const tenants = conc.filter((t) => !t.name.startsWith("Other")).map((t) => ({ name: t.name.replace(/ s\.r\.o\.$| a\.s\.$/, ""), value: t.share }))
  const topShare = tenants.reduce((s, t) => s + t.value, 0)
  const [closed, setClosed] = useState<Set<string> | null>(null)

  const shown = all.filter((r) =>
    status === "all" || (status === "let" && r.lease) || (status === "vacant" && !r.lease) || (status === "expiring" && r.expiring12))
  const byProperty = useMemo(() => {
    const m = new Map<string, RollRow[]>()
    for (const r of shown) m.set(r.property, [...(m.get(r.property) ?? []), r])
    return [...m.entries()]
  }, [shown])

  return (
    <div className="relative">
      <PageIntro eyebrow="Leases & income" title="Rent roll">
        Every unit, its tenant, rent and lease dates — the contract base behind the rental income.
        {asOf && <> As at <span className="text-foreground">{dLong(asOf)}</span>.</>}
      </PageIntro>

      {isLoading ? <LoadingNote label="loading rent roll…" />
        : error ? <ErrorNote message={error.message} />
        : !roll?.units.length ? <EmptyNote title="No units yet" hint="Apply migration 38 and run the demo generator — the rent roll appears here." />
        : (
        <div className="space-y-6">
          <div data-tour="roll-filters" className="flex flex-wrap items-center gap-3">
            <EntitySelect value={entityId} onChange={setEntityId} names={names} />
            <Segmented tour="roll-status" value={status} onChange={setStatus}
              options={[{ value: "all", label: "All units" }, { value: "let", label: "Let" }, { value: "vacant", label: "Vacant" }, { value: "expiring", label: "Expiring ≤ 12 mo" }]} />
          </div>

          <div data-tour="roll-kpis" className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <KpiTile i={0} label="Occupancy" value={k.occupancyPct} format={(n) => pct(n)} tone={k.occupancyPct >= 90 ? "good" : undefined}
              hint={`${num.format(k.letArea)} of ${num.format(k.gla)} m² let`} />
            <KpiTile i={1} label="Passing rent p.a." value={k.passingPa} format={eur.format} hint={`${k.units} units · contracted today`} />
            <KpiTile i={2} label="WALT" value={k.walt} format={(n) => `${n.toFixed(1)} yrs`} hint="lease term left, weighted by rent" />
            <KpiTile i={3} label="Reversion" value={k.reversionPct} format={(n) => `${n >= 0 ? "+" : ""}${pct(n)}`}
              hint="market rent (ERV) vs passing" tone={k.reversionPct >= 0 ? "good" : "bad"} />
            <KpiTile i={4} label="Rent arrears" value={k.arrears} format={eur.format} tone={k.arrears > 0 ? "bad" : "good"}
              hint="overdue rent still unpaid" />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <ChartCard tour="roll-expiry" title="Lease expiry profile" hint="rent p.a. by time to expiry">
              <ExpiryBars data={expiry} />
            </ChartCard>
            <ChartCard tour="roll-tenants" title="Tenant concentration" hint={`top ${tenants.length} = ${pct(topShare, 0)} of rent`}>
              <RankBars data={tenants} fmt={(v) => pct(v)} color={COLORS.cash} labelWidth={180} height={260} />
            </ChartCard>
          </div>

          <TableCard tour="roll-table" title="Units"
            hint={<span data-live={`${shown.length} of ${all.length} units shown`}>{shown.length} of {all.length} units</span>}>
            <div className="overflow-x-auto">
              <div className="min-w-[900px]">
                <div className={cn(COLS, "border-b border-border py-2.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground")}>
                  <span>Unit</span><span>Tenant</span><span className="text-right">Area m²</span><span>Lease</span>
                  <span className="text-right">Yrs left</span><span className="text-right">Rent / mo</span>
                  <span className="text-right">€/m²</span><span className="text-right">ERV €/m²</span>
                  <span className="text-right">Reversion</span><span className="text-right">Arrears</span>
                </div>
                {byProperty.map(([prop, units]) => {
                  const let_ = units.filter((u) => u.lease)
                  const area = units.reduce((s, u) => s + u.area, 0)
                  // Long lists (the 42 flats) start folded; a click opens them.
                  const isClosed = closed ? closed.has(prop) : units.length > 20 && byProperty.length > 1
                  const toggle = () => setClosed(() => {
                    const n = new Set(closed ?? byProperty.filter(([, u]) => u.length > 20 && byProperty.length > 1).map(([p]) => p))
                    if (n.has(prop)) n.delete(prop); else n.add(prop)
                    return n
                  })
                  return (
                    <Fragment key={prop}>
                      <button onClick={toggle} className={cn(COLS, "w-full border-b border-border/60 bg-secondary/30 py-2 text-left font-mono text-[11px] transition-colors hover:bg-secondary/60")}>
                        <span className="col-span-2 flex items-center gap-1.5 font-semibold uppercase tracking-wider text-foreground/85">
                          <ChevronDown className={cn("size-3.5 shrink-0 transition-transform", isClosed && "-rotate-90")} />{prop}
                        </span>
                        <span className="text-right tabular-nums text-muted-foreground">{num.format(area)}</span>
                        <span className="text-muted-foreground">{let_.length}/{units.length} let{isClosed ? " · show" : ""}</span>
                        <span /><span className="text-right tabular-nums text-foreground/85">{eur.format(let_.reduce((s, u) => s + u.rentMonth, 0))}</span>
                        <span /><span /><span /><span />
                      </button>
                      {!isClosed && units.map((r) => <UnitRow key={r.unitId} r={r} />)}
                    </Fragment>
                  )
                })}
              </div>
            </div>
          </TableCard>
        </div>
      )}
    </div>
  )
}

function UnitRow({ r }: { r: RollRow }) {
  return (
    <div className={cn(COLS, "border-b border-border/40 py-2 text-[13px] last:border-b-0 hover:bg-secondary/40")}>
      <span className="font-mono text-xs text-muted-foreground">{r.code}<span className="block text-[10px] text-muted-foreground/60">{r.use}</span></span>
      <span className="truncate">{r.tenant ?? <Chip tone="muted">Vacant</Chip>}</span>
      <span className="text-right font-mono tabular-nums text-muted-foreground">{num.format(r.area)}</span>
      <span className="font-mono text-[11px] text-muted-foreground">
        {r.lease ? <>{r.start!.slice(0, 7)} → <span className={cn(r.expiring12 && "text-[#e3c35a]")}>{r.end!.slice(0, 7)}</span></> : "—"}
      </span>
      <span className="text-right font-mono tabular-nums">{r.lease ? r.yearsLeft.toFixed(1) : "—"}</span>
      <span className="text-right font-mono tabular-nums">{r.lease ? eur.format(r.rentMonth) : "—"}</span>
      <span className="text-right font-mono tabular-nums text-muted-foreground">{r.lease ? r.rentM2.toFixed(2) : "—"}</span>
      <span className="text-right font-mono tabular-nums text-muted-foreground">{r.ervM2.toFixed(2)}</span>
      <span className={cn("text-right font-mono tabular-nums", r.reversionPct == null ? "text-muted-foreground" : r.reversionPct >= 0 ? "text-accent" : "text-destructive")}>
        {r.reversionPct == null ? "—" : `${r.reversionPct >= 0 ? "+" : ""}${r.reversionPct.toFixed(0)}%`}
      </span>
      <span className="text-right font-mono tabular-nums">
        {r.arrears > 0 ? <span className="text-destructive">{eur.format(r.arrears)}<span className="block text-[10px] text-destructive/70">{r.arrearsDays} days</span></span> : <span className="text-muted-foreground/60">—</span>}
      </span>
    </div>
  )
}
