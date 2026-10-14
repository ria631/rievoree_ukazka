import { useMemo, useState } from "react"
import { cn } from "@/lib/utils"
import { useReport } from "@/lib/data/useReport"
import { useOpenItems, useInvoiceMonthly } from "@/lib/data/useInvoices"
import { agingBy, arApKpis, byCounterparty, bucketOf, ledgerBalance, settlementSeries, BUCKETS } from "@/lib/data/receivables"
import { daysBetween, dLong, lastClosed, mLabel, monthEnd } from "@/lib/data/period"
import { ChartCard, AgingStacked, SettlementBars, BUCKET_COLORS } from "@/components/charts/FinancialCharts"
import { PageIntro, KpiTile, EntitySelect, Segmented, TieOut, TableCard, Chip, useEntityScope, eur, pct } from "@/components/report/Kit"
import { LoadingNote, ErrorNote, EmptyNote } from "@/components/StateNote"
import { useTourControl } from "@/lib/tourBus"

type Kind = "ar" | "ap"
const short = (n: string) => n.replace(/ s\.r\.o\.$| a\.s\.$/, "")

/**
 * Receivables & payables — who owes us (tenants) and whom we owe (suppliers),
 * how late, and whether the sub-ledger agrees with the general ledger.
 */
export function Receivables() {
  const { data: items, isLoading, error } = useOpenItems()
  const { data: monthly } = useInvoiceMonthly()
  const { data: rows } = useReport()
  const { entityId, setEntityId, names, include } = useEntityScope()
  const [kind, setKind] = useState<Kind>("ar")
  useTourControl("kind", (v) => setKind(v as Kind))

  const last = useMemo(() => lastClosed(rows ?? []), [rows])
  const asOf = last ? monthEnd(last) : null
  const open = useMemo(() => (items ?? []).filter((i) => i.kind === kind && include(i.entity_id)), [items, kind, include])
  const hist = useMemo(() => (monthly ?? []).filter((m) => m.kind === kind && include(m.entity_id)), [monthly, kind, include])
  const scopedRows = useMemo(() => (rows ?? []).filter((r) => include(r.entity_id)), [rows, include])

  const k = useMemo(() => (asOf && last ? arApKpis(open, hist, asOf, last) : null), [open, hist, asOf, last])
  const aging = useMemo(() => (asOf ? agingBy(open, (i) => short(names.get(i.entity_id) ?? "—"), asOf) : []), [open, names, asOf])
  const agingData = useMemo(() => aging.map((r) => ({ name: r.name, ...Object.fromEntries(BUCKETS.map((b, i) => [b, r.buckets[i]])) })), [aging])
  const settle = useMemo(() => (last ? settlementSeries(hist, last).map((s) => ({ ...s, month: mLabel(s.month) })) : []), [hist, last])
  const parties = useMemo(() => (asOf ? byCounterparty(open, asOf).slice(0, 8) : []), [open, asOf])
  const gl = useMemo(() => ledgerBalance(scopedRows, kind), [scopedRows, kind])
  const ar = kind === "ar"

  return (
    <div className="relative">
      <PageIntro eyebrow="Credit control" title="Receivables & payables">
        What tenants still owe us, what we owe our suppliers, and how late — bucketed by days past due.
        {asOf && <> Open items as at <span className="text-foreground">{dLong(asOf)}</span>.</>}
      </PageIntro>

      {isLoading ? <LoadingNote label="loading open items…" />
        : error ? <ErrorNote message={error.message} />
        : !k || !asOf ? <EmptyNote title="No invoices yet" hint="Apply migration 38 and run the demo generator — receivables and payables appear here." />
        : (
        <div className="space-y-6">
          <div data-tour="rp-filters" className="flex flex-wrap items-center gap-3">
            <Segmented tour="rp-kind" value={kind} onChange={setKind}
              options={[{ value: "ar", label: "Receivables · tenants" }, { value: "ap", label: "Payables · suppliers" }]} />
            <EntitySelect value={entityId} onChange={setEntityId} names={names} />
          </div>

          <div data-tour="rp-kpis" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KpiTile i={0} label={ar ? "Owed to us" : "We owe"} value={k.open} format={eur.format} hint={`${open.length} open invoices`} />
            <KpiTile i={1} label="Overdue" value={k.overdue} format={eur.format} tone={k.overdue > 0 ? "bad" : "good"}
              hint={`${pct(k.overduePct, 0)} of the open balance`} />
            {ar
              ? <KpiTile i={2} label="DSO" value={k.days} format={(n) => `${Math.round(n)} days`} hint="days of billing still unpaid" />
              : <KpiTile i={2} label="Due next 14 days" value={k.dueNext14} format={eur.format} hint="cash to set aside" />}
            <KpiTile i={3} label={ar ? "Collected on time" : "Paid on time"} value={k.onTimePct} format={(n) => pct(n, 0)}
              tone={k.onTimePct >= 90 ? "good" : undefined} hint={`last quarter · avg ${Math.round(k.avgDaysToPay ?? 0)} days to ${ar ? "collect" : "pay"}`} />
          </div>

          <TieOut tour="rp-tieout" label={ar ? "Sub-ledger ties to account 1100" : "Sub-ledger ties to account 2000"}
            left={k.open} right={gl} leftLabel="open invoices" rightLabel={ar ? "GL trade receivables" : "GL trade payables"} />

          <div className="grid gap-5 lg:grid-cols-2">
            <ChartCard tour="rp-aging" title={`${ar ? "Receivables" : "Payables"} aging by property`} hint="days past due">
              {agingData.length ? <AgingStacked data={agingData} buckets={BUCKETS} />
                : <p className="py-16 text-center font-mono text-xs text-muted-foreground">Nothing open.</p>}
            </ChartCard>
            <ChartCard tour="rp-settlement" title={ar ? "Rent billed — what happened to it" : "Supplier bills — how we paid"} hint="by invoice month">
              <SettlementBars data={settle} paidLabel={ar ? "Collected" : "Paid"} />
            </ChartCard>
          </div>

          <div className="grid gap-5 xl:grid-cols-[1fr_1.3fr]">
            <TableCard tour="rp-parties" title={ar ? "Tenants with open balances" : "Suppliers we owe"} hint="worst first">
              <div className="divide-y divide-border/50">
                {parties.map((c) => (
                  <div key={c.entityId + c.name} className="grid grid-cols-[1fr_auto] items-center gap-3 px-5 py-2.5">
                    <div className="min-w-0">
                      <div className="truncate text-sm">{c.name}</div>
                      <div className="truncate font-mono text-[10px] text-muted-foreground">{short(names.get(c.entityId) ?? "")} · {c.count} invoice{c.count > 1 ? "s" : ""}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-sm tabular-nums">{eur.format(c.open)}</div>
                      {c.overdue > 0
                        ? <Chip tone={c.oldest > 60 ? "bad" : "warn"}>{c.oldest} days late</Chip>
                        : <Chip tone="good">not due</Chip>}
                    </div>
                  </div>
                ))}
                {!parties.length && <p className="px-5 py-10 text-center font-mono text-xs text-muted-foreground">Nothing open.</p>}
              </div>
            </TableCard>

            <TableCard tour="rp-items" title="Open items" hint={`${open.length} invoices`}>
              <div className="max-h-[420px] overflow-auto">
                <table className="w-full min-w-[560px] text-[13px]">
                  <thead className="sticky top-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground [&_th]:bg-card">
                    <tr className="border-b border-border">
                      <th className="px-5 py-2.5 text-left font-normal">Document</th>
                      <th className="px-2 py-2.5 text-left font-normal">{ar ? "Tenant" : "Supplier"}</th>
                      <th className="px-2 py-2.5 text-left font-normal">Due</th>
                      <th className="px-2 py-2.5 text-right font-normal">Days late</th>
                      <th className="px-5 py-2.5 text-right font-normal">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...open].sort((a, b) => a.due_date.localeCompare(b.due_date)).map((i) => {
                      const d = daysBetween(i.due_date, asOf)
                      return (
                        <tr key={i.id} className="border-b border-border/40 hover:bg-secondary/40">
                          <td className="px-5 py-2 font-mono text-xs text-muted-foreground">{i.doc_no ?? "—"}</td>
                          <td className="max-w-[220px] truncate px-2 py-2">{i.counterparty}</td>
                          <td className="px-2 py-2 font-mono text-xs text-muted-foreground">{i.due_date}</td>
                          <td className="px-2 py-2 text-right font-mono text-xs tabular-nums">
                            <span className="inline-flex items-center gap-1.5">
                              <span className="size-2 rounded-full" style={{ background: BUCKET_COLORS[bucketOf(d)] }} />
                              <span className={cn(d > 0 ? "text-foreground" : "text-muted-foreground")}>{d > 0 ? d : "not due"}</span>
                            </span>
                          </td>
                          <td className="px-5 py-2 text-right font-mono tabular-nums">{eur.format(i.amount)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </TableCard>
          </div>
        </div>
      )}
    </div>
  )
}
