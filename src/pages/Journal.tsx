import { Fragment, useEffect, useMemo, useState } from "react"
import { ChevronDown, ChevronLeft, ChevronRight, Search } from "lucide-react"
import { cn } from "@/lib/utils"
import { useReport } from "@/lib/data/useReport"
import { useJournalSummary, useJournalDocuments, useDocumentLines, PAGE_SIZE, type JournalDoc } from "@/lib/data/useJournal"
import { DOC_TYPES, docLabel, trialBalance, volumeByMonth } from "@/lib/data/journal"
import { lastClosed, mk, mLabel, mLong, monthRange } from "@/lib/data/period"
import { ChartCard, VolumeStacked, DOC_COLORS } from "@/components/charts/FinancialCharts"
import { PageIntro, KpiTile, EntitySelect, FilterLabel, TieOut, TableCard, Chip, useEntityScope, money, num } from "@/components/report/Kit"
import { SimpleSelect } from "@/components/ui/select"
import { LoadingNote, ErrorNote, EmptyNote } from "@/components/StateNote"
import { useTourControl } from "@/lib/tourBus"

/** "Danube Office Park s.r.o." → "Danube Office" (a compact column label). */
const short = (n?: string) => (n ?? "—").replace(/ s\.r\.o\.$/, "").replace(/ (Park|Hub|Residences)$/, "")

/**
 * Journal overview — the book itself. Every posting traced to its document
 * (invoice, bank statement item, journal voucher), filtered and paged by the
 * database; and the proof the book holds: debits equal credits.
 */
export function Journal() {
  const { data: summary, isLoading, error } = useJournalSummary()
  const { data: rows } = useReport()
  const { entityId, setEntityId, names, include } = useEntityScope()
  const [period, setPeriod] = useState("all")
  const [type, setType] = useState("all")
  const [search, setSearch] = useState("")
  const [q, setQ] = useState("")
  const [page, setPage] = useState(0)
  const [openDoc, setOpenDoc] = useState<string | null>(null)
  useTourControl("doctype", (v) => setType(v))
  useTourControl("period", (v) => setPeriod(v === "@latest" ? `${lastClosed(rows ?? []) ?? ""}-01` : v))

  // Debounce the search box; any filter change goes back to page 1.
  useEffect(() => { const t = window.setTimeout(() => setQ(search), 300); return () => window.clearTimeout(t) }, [search])
  useEffect(() => { setPage(0); setOpenDoc(null) }, [entityId, period, type, q])

  const last = useMemo(() => lastClosed(rows ?? []), [rows])
  // Months from the summary, or — while it is still loading — from the P&L roll-up.
  const months = useMemo(() => {
    const src = summary?.length ? summary : rows ?? []
    if (!src.length) return []
    const ks = src.map((s) => mk(s.period)).sort()
    return monthRange(ks[0], ks[ks.length - 1])
  }, [summary, rows])

  const scoped = useMemo(() => (summary ?? []).filter((s) => include(s.entity_id)), [summary, include])
  const inScope = scoped.filter((s) => (period === "all" || s.period === period) && (type === "all" || s.doc_type === type))
  const docs = inScope.reduce((n, s) => n + s.docs, 0)
  const lines = inScope.reduce((n, s) => n + s.lines, 0)
  const debit = inScope.reduce((n, s) => n + s.debit, 0)
  const credit = inScope.reduce((n, s) => n + s.credit, 0)
  const unbalanced = inScope.reduce((n, s) => n + s.unbalanced, 0)
  const volume = useMemo(() => volumeByMonth(scoped, months).map((r) => ({ ...r, month: mLabel(String(r.month)) })), [scoped, months])

  const tbMonths = useMemo(() => new Set(period === "all" ? months : [mk(period)]), [period, months])
  const tb = useMemo(() => trialBalance((rows ?? []).filter((r) => include(r.entity_id)), tbMonths), [rows, include, tbMonths])

  const { data: pageData, isFetching } = useJournalDocuments({ entityId, period, type, search: q }, page)
  const total = pageData?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="relative">
      <PageIntro eyebrow="General ledger" title="Journal">
        Every posting, grouped by the document it came from — rent invoices, supplier bills, bank statement items,
        journal vouchers — and the proof the books hold: total debits equal total credits.
      </PageIntro>

      {/* The page never waits for the summary: filters and the paged documents
          render at once; the counts and the chart fill in when they arrive. */}
      {summary && !summary.length && !(rows?.length) ? <EmptyNote title="The journal is empty" hint="Approve and load a batch on the Ingest page." />
        : (
        <div className="space-y-6">
          <div data-tour="jr-filters" className="flex flex-wrap items-center gap-3">
            <EntitySelect value={entityId} onChange={setEntityId} names={names} />
            <FilterLabel label="Month">
              <SimpleSelect aria-label="Month" value={period} onValueChange={setPeriod}
                options={[{ value: "all", label: `All (${months.length} mo.)` }, ...[...months].reverse().map((m) => ({ value: `${m}-01`, label: mLong(m) }))]} />
            </FilterLabel>
            <label className="ml-auto flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 focus-within:border-accent/60">
              <Search className="size-3.5 text-muted-foreground" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Document no. or text…"
                className="w-48 bg-transparent font-mono text-xs outline-none placeholder:text-muted-foreground/60" aria-label="Search journal" />
            </label>
          </div>

          <div data-tour="jr-types" className="flex flex-wrap gap-2">
            {[{ key: "all", label: "All documents" }, ...DOC_TYPES.filter((d) => (summary ? scoped.some((s) => s.doc_type === d.key) : d.key !== "UP"))].map((d) => (
              <button key={d.key} data-tour={`jr-type-${d.key}`} onClick={() => setType(d.key)}
                className={cn("inline-flex items-center gap-2 rounded-full px-3 py-1 font-mono text-[10px] uppercase tracking-widest ring-1 transition",
                  type === d.key ? "bg-accent text-accent-foreground ring-accent" : "text-muted-foreground ring-border hover:text-foreground")}>
                {d.key !== "all" && <span className="size-2 rounded-full" style={{ background: DOC_COLORS[d.key] }} />}
                {d.key === "all" ? d.label : `${d.key} · ${d.label}`}
              </button>
            ))}
          </div>

          {isLoading ? <LoadingNote label="counting documents…" />
            : error ? <ErrorNote message={error.message} />
            : (<>
          <div data-tour="jr-kpis" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KpiTile i={0} label="Documents" value={docs} format={(n) => num.format(n)} hint={period === "all" ? "all months" : mLong(mk(period))} />
            <KpiTile i={1} label="Journal lines" value={lines} format={(n) => num.format(n)} hint={`${(lines / (docs || 1)).toFixed(1)} lines per document`} />
            <KpiTile i={2} label="Posted (debit side)" value={debit} format={(n) => money(n)} hint="sum of all debits" />
            <KpiTile i={3} label="Unbalanced documents" value={unbalanced} format={(n) => num.format(n)} tone={unbalanced ? "bad" : "good"}
              hint={unbalanced ? "debits ≠ credits — investigate" : "every document balances"} />
          </div>

          <TieOut tour="jr-proof" label="Debits = credits" left={debit} right={credit} leftLabel="total debits" rightLabel="total credits" />
          </>)}

          <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
            <ChartCard tour="jr-volume" title="Documents posted per month" hint="by type">
              {summary ? <VolumeStacked data={volume} types={DOC_TYPES} /> : <LoadingNote label="loading…" />}
            </ChartCard>
            <TableCard tour="jr-tb" title="Trial balance" hint={period === "all" ? `${months.length} months` : mLong(mk(period))}>
              <div className="max-h-[300px] overflow-auto">
                <table className="w-full text-[12.5px]">
                  <thead className="sticky top-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground [&_th]:bg-card">
                    <tr className="border-b border-border"><th className="px-5 py-2 text-left font-normal">Account</th><th className="px-2 py-2 text-right font-normal">Debit</th><th className="px-5 py-2 text-right font-normal">Credit</th></tr>
                  </thead>
                  <tbody className="font-mono tabular-nums">
                    {tb.lines.map((l) => (
                      <tr key={l.code} className="border-b border-border/40">
                        <td className="max-w-[200px] truncate px-5 py-1.5 font-sans"><span className="mr-2 font-mono text-[11px] text-muted-foreground">{l.code}</span>{l.name}</td>
                        <td className="px-2 py-1.5 text-right">{l.debit ? money(l.debit) : "—"}</td>
                        <td className="px-5 py-1.5 text-right">{l.credit ? money(l.credit) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="sticky bottom-0 font-mono font-semibold tabular-nums [&_td]:bg-card">
                    <tr className="border-t border-border"><td className="px-5 py-2 font-sans">Total</td><td className="px-2 py-2 text-right">{money(tb.debit)}</td><td className="px-5 py-2 text-right">{money(tb.credit)}</td></tr>
                  </tfoot>
                </table>
              </div>
            </TableCard>
          </div>

          <TableCard tour="jr-docs" title="Documents"
            hint={<span className={cn(isFetching && "animate-pulse")}>{total ? `${page * PAGE_SIZE + 1}–${Math.min(total, (page + 1) * PAGE_SIZE)} of ${num.format(total)}` : "no match"}</span>}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-[13px]">
                <thead className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="w-8 px-3 py-2.5" /><th className="px-2 py-2.5 text-left font-normal">Date</th>
                    <th className="px-2 py-2.5 text-left font-normal">Document</th>
                    {entityId === "all" && <th className="px-2 py-2.5 text-left font-normal">Property</th>}
                    <th className="px-2 py-2.5 text-left font-normal">Description</th>
                    <th className="px-2 py-2.5 text-right font-normal">Lines</th><th className="px-2 py-2.5 text-right font-normal">Debit</th>
                    <th className="px-2 py-2.5 text-right font-normal">Credit</th><th className="px-5 py-2.5 text-right font-normal">Check</th>
                  </tr>
                </thead>
                <tbody>
                  {(pageData?.docs ?? []).map((d, i) => {
                    const key = `${d.entity_id}|${d.doc_no}`
                    const isOpen = openDoc === key
                    return (
                      <Fragment key={key}>
                        <tr data-tour={i === 0 ? "jr-doc-row" : undefined} onClick={() => setOpenDoc(isOpen ? null : key)}
                          className={cn("cursor-pointer border-b border-border/40 hover:bg-secondary/40", isOpen && "bg-secondary/40")}>
                          <td className="px-3 py-2 text-muted-foreground"><ChevronDown className={cn("size-3.5 transition-transform", !isOpen && "-rotate-90")} /></td>
                          <td className="px-2 py-2 font-mono text-xs text-muted-foreground">{d.txn_date}</td>
                          <td className="px-2 py-2 font-mono text-xs">
                            <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: DOC_COLORS[d.doc_type] ?? "#78889b" }} />{d.doc_no}</span>
                          </td>
                          {entityId === "all" && <td className="whitespace-nowrap px-2 py-2 font-mono text-[11px] text-muted-foreground">{short(names.get(d.entity_id))}</td>}
                          <td className="max-w-[340px] truncate px-2 py-2 text-foreground/85">{d.description}</td>
                          <td className="px-2 py-2 text-right font-mono tabular-nums text-muted-foreground">{d.lines}</td>
                          <td className="px-2 py-2 text-right font-mono tabular-nums">{money(d.debit)}</td>
                          <td className="px-2 py-2 text-right font-mono tabular-nums">{money(d.credit)}</td>
                          <td className="px-5 py-2 text-right">{d.balanced ? <Chip tone="good">balanced</Chip> : <Chip tone="bad">off {money(d.debit - d.credit)}</Chip>}</td>
                        </tr>
                        {isOpen && <DocLines doc={d} names={names} span={entityId === "all" ? 8 : 7} />}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-border px-5 py-3 font-mono text-[11px] text-muted-foreground">
              <span>{type === "all" ? "All types" : docLabel(type)} · {period === "all" ? "all months" : mLong(mk(period))}{last ? ` · closed to ${mLong(last)}` : ""}</span>
              <span className="flex items-center gap-2">
                <button aria-label="Previous page" disabled={page === 0} onClick={() => setPage((p) => p - 1)}
                  className="rounded-md p-1 ring-1 ring-border transition enabled:hover:text-foreground disabled:opacity-40"><ChevronLeft className="size-4" /></button>
                <span className="tabular-nums">page {page + 1} / {pages}</span>
                <button aria-label="Next page" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}
                  className="rounded-md p-1 ring-1 ring-border transition enabled:hover:text-foreground disabled:opacity-40"><ChevronRight className="size-4" /></button>
              </span>
            </div>
          </TableCard>
        </div>
      )}
    </div>
  )
}

/** A document opened: its journal lines (account, debit, credit, cash-flow tag). */
function DocLines({ doc, names, span }: { doc: JournalDoc; names: Map<string, string>; span: number }) {
  const { data, isLoading } = useDocumentLines(doc)
  return (
    <tr className="border-b border-border/60 bg-background/40">
      <td />
      <td colSpan={span} className="px-2 py-3">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {docLabel(doc.doc_type)} · {(names.get(doc.entity_id) ?? "").replace(/ s\.r\.o\.$/, "")}
        </p>
        {isLoading ? <p className="font-mono text-xs text-muted-foreground">loading lines…</p> : (
          <table className="w-full text-[12.5px]">
            <tbody className="font-mono tabular-nums">
              {(data ?? []).map((l) => (
                <tr key={l.id} className="border-b border-border/30 last:border-0">
                  <td className="w-[230px] py-1.5 pr-3 font-sans"><span className="mr-2 font-mono text-[11px] text-muted-foreground">{l.accounts?.code}</span>{l.accounts?.name}</td>
                  <td className="py-1.5 pr-3 font-sans text-muted-foreground">{l.description}{l.flow && <span className="ml-2"><Chip tone="muted">cash · {l.flow.replace(/_/g, " ")}</Chip></span>}</td>
                  <td className="w-[120px] py-1.5 pr-3 text-right">{l.debit ? money(l.debit) : ""}</td>
                  <td className="w-[120px] py-1.5 text-right">{l.credit ? money(l.credit) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </td>
    </tr>
  )
}
