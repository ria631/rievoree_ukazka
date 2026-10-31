import type { ReportRow } from "./useReport"
import { mk } from "./period"

/**
 * Report rows → the property P&L and balance anchors, per month.
 *
 * A property company's P&L reads: revenue (rent, service charge, parking) −
 * property operating expenses = NET OPERATING INCOME (NOI), the number a
 * building is valued and financed on; then depreciation and interest below it.
 * Accounts are classified by the demo chart's codes first, then by name, so a
 * custom chart of accounts still lands in the right line.
 */
export type PlClass = "revenue" | "opex" | "depreciation" | "interest"

export function classify(r: { account_code: string; account_name: string; account_type: string }): PlClass | null {
  if (r.account_type === "revenue") return "revenue"
  if (r.account_type !== "expense") return null
  if (r.account_code === "6000" || /deprec|amortis|odpis/i.test(r.account_name)) return "depreciation"
  if (r.account_code === "7000" || /interest|úrok|urok/i.test(r.account_name)) return "interest"
  return "opex"
}

/** A P&L amount on its natural side: income = credit − debit, cost = debit − credit. */
export const plAmount = (r: ReportRow) => (r.account_type === "revenue" ? r.credit - r.debit : r.debit - r.credit)

// Balance-sheet anchors (asset/liability running balances).
export const isBank = (r: ReportRow) =>
  r.account_code === "1000" || (r.account_type === "asset" && /\b(bank|cash)\b|pokladn|banka/i.test(r.account_name))
export const isReceivable = (r: ReportRow) =>
  r.account_code === "1100" || (r.account_type === "asset" && /receivab|pohľad|pohlad|odberat/i.test(r.account_name))
export const isPayable = (r: ReportRow) =>
  r.account_code === "2000" || (r.account_type === "liability" && /payab|záväz|zavaz|dodávat|dodavat/i.test(r.account_name))
export const isLoan = (r: ReportRow) =>
  r.account_code === "2500" || (r.account_type === "liability" && /loan|úver|uver|borrow/i.test(r.account_name))

export interface MonthPoint {
  month: string
  revenue: number
  opex: number
  noi: number
  depreciation: number
  interest: number
  pbt: number
  bank: number        // closing balance
  receivables: number // closing balance
  payables: number    // closing balance
  loan: number        // closing balance (positive = owed)
  principal: number   // loan repaid in the month
}

export function monthlySeries(rows: ReportRow[]): MonthPoint[] {
  const m = new Map<string, Omit<MonthPoint, "month" | "noi" | "pbt" | "bank" | "receivables" | "payables" | "loan"> & { dBank: number; dAr: number; dAp: number; dLoan: number }>()
  for (const r of rows) {
    const k = mk(r.period)
    const e = m.get(k) ?? { revenue: 0, opex: 0, depreciation: 0, interest: 0, principal: 0, dBank: 0, dAr: 0, dAp: 0, dLoan: 0 }
    const c = classify(r)
    if (c) e[c] += plAmount(r)
    if (isBank(r)) e.dBank += r.net
    else if (isReceivable(r)) e.dAr += r.net
    else if (isPayable(r)) e.dAp -= r.net
    else if (isLoan(r)) { e.dLoan -= r.net; e.principal += r.debit }
    m.set(k, e)
  }
  let bank = 0, ar = 0, ap = 0, loan = 0
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([month, v]) => {
    bank += v.dBank; ar += v.dAr; ap += v.dAp; loan += v.dLoan
    const noi = v.revenue - v.opex
    return {
      month, revenue: v.revenue, opex: v.opex, noi, depreciation: v.depreciation, interest: v.interest,
      pbt: noi - v.depreciation - v.interest, bank, receivables: ar, payables: ap, loan, principal: v.principal,
    }
  })
}

/** Sum of the last n months of a series. */
export function lastN(series: MonthPoint[], pick: (p: MonthPoint) => number, n = 12): number {
  return series.slice(-n).reduce((s, p) => s + pick(p), 0)
}

export interface Kpi { value: number; delta: number | null; spark: number[] }

/** Latest value, its month-over-month change (%) and a sparkline. */
export function kpiOf(series: MonthPoint[], pick: (p: MonthPoint) => number, n = 12): Kpi {
  const spark = series.slice(-n).map(pick)
  const value = spark.at(-1) ?? 0
  const prev = spark.length > 1 ? spark[spark.length - 2] : null
  return { value, delta: prev ? ((value - prev) / Math.abs(prev)) * 100 : null, spark }
}

export interface Slice { name: string; value: number }

/** Operating expenses by account over a set of months (cost structure). */
export function opexByAccount(rows: ReportRow[], months: Set<string>): Slice[] {
  const m = new Map<string, number>()
  for (const r of rows) {
    if (classify(r) !== "opex" || !months.has(mk(r.period))) continue
    m.set(r.account_name, (m.get(r.account_name) ?? 0) + plAmount(r))
  }
  return [...m.entries()].map(([name, value]) => ({ name, value })).filter((s) => s.value > 0).sort((a, b) => b.value - a.value)
}

/** NOI per entity (building) over a set of months. */
export function noiByEntity(rows: ReportRow[], names: Map<string, string>, months: Set<string>): Slice[] {
  const m = new Map<string, number>()
  for (const r of rows) {
    const c = classify(r)
    if ((c !== "revenue" && c !== "opex") || !months.has(mk(r.period))) continue
    m.set(r.entity_id, (m.get(r.entity_id) ?? 0) + (c === "revenue" ? plAmount(r) : -plAmount(r)))
  }
  return [...m.entries()].map(([id, value]) => ({ name: names.get(id) ?? id.slice(0, 8), value })).sort((a, b) => b.value - a.value)
}

/** One step of a bridge (waterfall) chart. */
export interface WfStep { name: string; value: number; isTotal?: boolean }
