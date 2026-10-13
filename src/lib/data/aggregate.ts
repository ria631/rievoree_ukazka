import type { ReportRow } from "./useReport"

/**
 * Client-side roll-ups of report_account_monthly rows into chart-ready series.
 * The journal is double-entry, so total net ≈ 0 — the meaningful financial cuts
 * are revenue (credits on revenue accounts) vs expenses (debits on expense
 * accounts), their profit, and the expense mix.
 */

export interface PnlPoint { month: string; revenue: number; expenses: number; profit: number }

export function monthlyPnl(rows: ReportRow[]): PnlPoint[] {
  const m = new Map<string, { revenue: number; expenses: number }>()
  for (const r of rows) {
    const key = r.period.slice(0, 7)
    const e = m.get(key) ?? { revenue: 0, expenses: 0 }
    if (r.account_type === "revenue") e.revenue += Number(r.credit)
    else if (r.account_type === "expense") e.expenses += Number(r.debit)
    m.set(key, e)
  }
  return [...m.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, v]) => ({ month, revenue: v.revenue, expenses: v.expenses, profit: v.revenue - v.expenses }))
}

export interface Slice { name: string; value: number }

export function expenseByAccount(rows: ReportRow[]): Slice[] {
  const m = new Map<string, number>()
  for (const r of rows) {
    if (r.account_type !== "expense") continue
    m.set(r.account_name, (m.get(r.account_name) ?? 0) + Number(r.debit))
  }
  return [...m.entries()]
    .map(([name, value]) => ({ name, value }))
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value)
}

export function totals(rows: ReportRow[]) {
  let revenue = 0, expenses = 0
  for (const r of rows) {
    if (r.account_type === "revenue") revenue += Number(r.credit)
    else if (r.account_type === "expense") expenses += Number(r.debit)
  }
  return { revenue, expenses, profit: revenue - expenses }
}

// ---- Executive KPI series -------------------------------------------------
// Per month: revenue, EBITDA (revenue − operating expenses; the seed chart of
// accounts has no D&A/interest, so EBITDA == operating income), running Cash and
// A/R balances (asset accounts are debit-normal, balance = Σ net), DSO and margin.
export interface ExecPoint {
  month: string; revenue: number; ebitda: number; cash: number; ar: number; dso: number; marginPct: number
}

// Identify cash / receivable accounts flexibly: the demo's fixed codes first,
// else by name keyword (EN + SK/CZ) on an asset account — so custom charts still
// power the Cash & DSO KPIs instead of showing zero.
function isCashRow(r: ReportRow): boolean {
  if (r.account_code === "1000") return true
  return r.account_type === "asset" && /\b(cash|bank)\b|pokladn|banka/i.test(r.account_name)
}
function isReceivableRow(r: ReportRow): boolean {
  if (r.account_code === "1100") return true
  return r.account_type === "asset" && /receivab|pohľad|pohlad|odberate/i.test(r.account_name)
}

export function executiveSeries(rows: ReportRow[]): ExecPoint[] {
  const m = new Map<string, { revenue: number; expenses: number; cashFlow: number; arFlow: number }>()
  for (const r of rows) {
    const key = r.period.slice(0, 7)
    const e = m.get(key) ?? { revenue: 0, expenses: 0, cashFlow: 0, arFlow: 0 }
    if (r.account_type === "revenue") e.revenue += Number(r.credit)
    else if (r.account_type === "expense") e.expenses += Number(r.debit)
    if (isCashRow(r)) e.cashFlow += Number(r.net)       // Cash (debit-normal)
    if (isReceivableRow(r)) e.arFlow += Number(r.net)   // Accounts Receivable
    m.set(key, e)
  }
  const sorted = [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  let cash = 0, ar = 0
  return sorted.map(([month, v]) => {
    cash += v.cashFlow
    ar += v.arFlow
    const ebitda = v.revenue - v.expenses
    return {
      month,
      revenue: v.revenue,
      ebitda,
      cash,
      ar,
      dso: v.revenue > 0 ? (ar / (v.revenue / 30)) : 0,
      marginPct: v.revenue > 0 ? (ebitda / v.revenue) * 100 : 0,
    }
  })
}

export interface Kpi { value: number; delta: number | null; spark: number[] }

function kpiFrom(series: ExecPoint[], pick: (p: ExecPoint) => number): Kpi {
  const spark = series.map(pick)
  const value = spark.length ? spark[spark.length - 1] : 0
  const prev = spark.length > 1 ? spark[spark.length - 2] : null
  const delta = prev != null && prev !== 0 ? ((value - prev) / Math.abs(prev)) * 100 : null
  return { value, delta, spark }
}

export function executiveKpis(series: ExecPoint[]) {
  return {
    revenue: kpiFrom(series, (p) => p.revenue),
    ebitda: kpiFrom(series, (p) => p.ebitda),
    cash: kpiFrom(series, (p) => p.cash),
    dso: kpiFrom(series, (p) => p.dso),
  }
}

// ---- Extra high-value cuts (ratios, momentum, bridge, top accounts) --------
import type { WfStep } from "./balance"

const isCogs = (r: ReportRow) =>
  r.account_type === "expense" && (r.account_code.startsWith("5") || /cost of goods|cogs|náklady na predaný/i.test(r.account_name))

/** Month-over-month growth of revenue and expenses (%), per month. */
export interface GrowthPoint { month: string; revGrowth: number; expGrowth: number }
export function momGrowth(series: ExecPoint[]): GrowthPoint[] {
  const out: GrowthPoint[] = []
  for (let i = 1; i < series.length; i++) {
    const cur = series[i], prev = series[i - 1]
    const curExp = cur.revenue - cur.ebitda, prevExp = prev.revenue - prev.ebitda
    out.push({
      month: cur.month,
      revGrowth: prev.revenue ? ((cur.revenue - prev.revenue) / Math.abs(prev.revenue)) * 100 : 0,
      expGrowth: prevExp ? ((curExp - prevExp) / Math.abs(prevExp)) * 100 : 0,
    })
  }
  return out
}

/** Operating-income bridge: Revenue → −COGS → Gross profit → −OpEx → EBITDA. */
export function marginBridge(rows: ReportRow[]): WfStep[] {
  let revenue = 0, cogs = 0, opex = 0
  for (const r of rows) {
    if (r.account_type === "revenue") revenue += Number(r.credit)
    else if (isCogs(r)) cogs += Number(r.debit)
    else if (r.account_type === "expense") opex += Number(r.debit)
  }
  const gross = revenue - cogs
  const ebitda = gross - opex
  return [
    { name: "Revenue", value: revenue },
    { name: "COGS", value: -cogs },
    { name: "Gross profit", value: gross, isTotal: true },
    { name: "OpEx", value: -opex },
    { name: "EBITDA", value: ebitda, isTotal: true },
  ]
}

/** Top revenue + expense accounts by magnitude (for a leaderboard bar chart). */
export interface TopAccount { name: string; value: number; kind: "revenue" | "expense" }
export function topAccounts(rows: ReportRow[], n = 6): TopAccount[] {
  const m = new Map<string, TopAccount>()
  for (const r of rows) {
    if (r.account_type !== "revenue" && r.account_type !== "expense") continue
    const amt = r.account_type === "revenue" ? Number(r.credit) : Number(r.debit)
    const cur = m.get(r.account_name) ?? { name: r.account_name, value: 0, kind: r.account_type as "revenue" | "expense" }
    cur.value += amt
    m.set(r.account_name, cur)
  }
  return [...m.values()].filter((a) => a.value > 0).sort((a, b) => b.value - a.value).slice(0, n)
}

/** Headline financial ratios + a cash-runway read, all from the report rows. */
export interface Ratios {
  grossMarginPct: number
  currentRatio: number
  dso: number
  dpo: number
  runwayMonths: number | null   // null = cash-flow positive (no burn)
  cashPositive: boolean
}
export function financialRatios(rows: ReportRow[]): Ratios {
  const periods = [...new Set(rows.map((r) => r.period.slice(0, 7)))].sort()
  const last = periods[periods.length - 1]
  let revenue = 0, cogs = 0, expenses = 0
  let revLast = 0, cogsLast = 0
  let cash = 0, ar = 0, inv = 0, ap = 0
  // trailing-3-month net burn
  const win = periods.slice(-3)
  let winRev = 0, winExp = 0
  for (const r of rows) {
    const p = r.period.slice(0, 7), net = Number(r.net)
    if (r.account_type === "revenue") { revenue += Number(r.credit); if (p === last) revLast += Number(r.credit); if (win.includes(p)) winRev += Number(r.credit) }
    else if (r.account_type === "expense") { expenses += Number(r.debit); if (win.includes(p)) winExp += Number(r.debit); if (isCogs(r)) { cogs += Number(r.debit); if (p === last) cogsLast += Number(r.debit) } }
    if (r.account_code === "1000") cash += net
    else if (r.account_code === "1100") ar += net
    else if (r.account_code === "1200") inv += net
    else if (r.account_code === "2000") ap += -net
  }
  const currentAssets = cash + ar + inv
  const grossMarginPct = revenue ? ((revenue - cogs) / revenue) * 100 : 0
  const currentRatio = ap ? currentAssets / ap : 0
  const dso = revLast ? ar / (revLast / 30) : 0
  const dpo = cogsLast ? ap / (cogsLast / 30) : 0
  const monthlyBurn = (winExp - winRev) / Math.max(1, win.length)   // >0 means burning cash
  const cashPositive = monthlyBurn <= 0
  return { grossMarginPct, currentRatio, dso, dpo, cashPositive, runwayMonths: cashPositive ? null : cash / monthlyBurn }
}
