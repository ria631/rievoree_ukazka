import type { Invoice, InvoiceMonth } from "./useInvoices"
import type { ReportRow } from "./useReport"
import { isPayable, isReceivable } from "./aggregate"
import { addMonths, daysBetween, mk, monthRange } from "./period"

/**
 * Receivables (what tenants owe us) and payables (what we owe suppliers), from
 * the invoice sub-ledger, as at the as-of date.
 *
 *   aging      open balance split by days past due — the older, the less
 *              likely it is ever collected (AR) / the more a supplier chases (AP)
 *   DSO / DPO  open balance ÷ average daily invoicing over the last 3 months:
 *              how many days of billing are sitting unpaid
 *   on time    share of last quarter's invoices settled by their due date
 *   tie-out    open items must equal the general-ledger balance of the control
 *              account (1100 / 2000) — if not, something was posted outside
 *              the sub-ledger
 */
export const BUCKETS = ["Not due", "1–30", "31–60", "61–90", "90+"] as const

export function bucketOf(daysOverdue: number): number {
  if (daysOverdue <= 0) return 0
  if (daysOverdue <= 30) return 1
  if (daysOverdue <= 60) return 2
  if (daysOverdue <= 90) return 3
  return 4
}

export interface AgingRow { name: string; buckets: number[]; total: number }

export function agingBy(items: Invoice[], keyOf: (i: Invoice) => string, asOf: string): AgingRow[] {
  const m = new Map<string, number[]>()
  for (const i of items) {
    const k = keyOf(i)
    const b = m.get(k) ?? BUCKETS.map(() => 0)
    b[bucketOf(daysBetween(i.due_date, asOf))] += i.amount
    m.set(k, b)
  }
  return [...m.entries()]
    .map(([name, buckets]) => ({ name, buckets, total: buckets.reduce((s, v) => s + v, 0) }))
    .sort((a, b) => b.total - a.total)
}

export interface Counterparty {
  name: string
  entityId: string
  open: number
  overdue: number
  oldest: number
  count: number
}

/** Open balance per counterparty, worst first (overdue, then size). */
export function byCounterparty(items: Invoice[], asOf: string): Counterparty[] {
  const m = new Map<string, Counterparty>()
  for (const i of items) {
    const key = `${i.entity_id}|${i.counterparty}`
    const d = daysBetween(i.due_date, asOf)
    const c = m.get(key) ?? { name: i.counterparty, entityId: i.entity_id, open: 0, overdue: 0, oldest: 0, count: 0 }
    c.open += i.amount
    c.count += 1
    if (d > 0) { c.overdue += i.amount; c.oldest = Math.max(c.oldest, d) }
    m.set(key, c)
  }
  return [...m.values()].sort((a, b) => b.overdue - a.overdue || b.open - a.open)
}

export interface ArApKpis {
  open: number
  overdue: number
  overduePct: number
  over60: number
  dueNext14: number
  days: number          // DSO (AR) or DPO (AP)
  onTimePct: number
  avgDaysToPay: number | null
}

export function arApKpis(items: Invoice[], monthly: InvoiceMonth[], asOf: string, last: string): ArApKpis {
  let open = 0, overdue = 0, over60 = 0, dueNext14 = 0
  for (const i of items) {
    const d = daysBetween(i.due_date, asOf)
    open += i.amount
    if (d > 0) overdue += i.amount
    if (d > 60) over60 += i.amount
    if (d <= 0 && d > -14) dueNext14 += i.amount
  }
  // Last three months' invoicing → average per day.
  const win = new Set(monthRange(addMonths(last, -2), last))
  const recent = monthly.filter((r) => win.has(mk(r.period)))
  const invoiced = recent.reduce((s, r) => s + r.invoiced, 0)
  const days = invoiced > 0 ? open / (invoiced / 92) : 0
  // On-time record: the three months before the last one (all of them are due by now).
  const due = new Set(monthRange(addMonths(last, -3), addMonths(last, -1)))
  const settled = monthly.filter((r) => due.has(mk(r.period)))
  const billed = settled.reduce((s, r) => s + r.invoiced, 0)
  const onTime = settled.reduce((s, r) => s + r.settled_on_time, 0)
  const paidN = settled.reduce((s, r) => s + r.invoices, 0)
  const avg = paidN ? settled.reduce((s, r) => s + (r.avg_days_to_pay ?? 0) * r.invoices, 0) / paidN : null
  return { open, overdue, overduePct: open ? (overdue / open) * 100 : 0, over60, dueNext14, days, onTimePct: billed ? (onTime / billed) * 100 : 0, avgDaysToPay: avg }
}

/** Each month's invoicing split by what happened to it: paid on time, paid late, still open. */
export function settlementSeries(monthly: InvoiceMonth[], last: string, n = 12): { month: string; onTime: number; late: number; open: number }[] {
  return monthRange(addMonths(last, -(n - 1)), last).map((month) => {
    const rs = monthly.filter((r) => mk(r.period) === month)
    const inv = rs.reduce((s, r) => s + r.invoiced, 0)
    const settled = rs.reduce((s, r) => s + r.settled, 0)
    const onTime = rs.reduce((s, r) => s + r.settled_on_time, 0)
    return { month, onTime, late: Math.max(0, settled - onTime), open: Math.max(0, inv - settled) }
  })
}

/** General-ledger balance of the control account: AR 1100 (debit), AP 2000 (credit). */
export function ledgerBalance(rows: ReportRow[], kind: "ar" | "ap"): number {
  let b = 0
  for (const r of rows) {
    if (kind === "ar" && isReceivable(r)) b += r.net
    if (kind === "ap" && isPayable(r)) b -= r.net
  }
  return b
}
