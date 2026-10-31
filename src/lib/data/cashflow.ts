import type { CashActualRow, CashPlanRow } from "./useCash"
import type { WfStep } from "./aggregate"
import { mk, monthDiff, monthRange } from "./period"

/**
 * Budget flow — the cash budget for one year, plan vs actual, by flow category.
 *
 * Closed months show what the bank statement says (bank lines tagged with a
 * flow category); open months show the plan. Opening cash is the real bank
 * balance on 1 January, so the plan line and the actual line start together
 * and every gap between them is a variance someone can explain.
 */
export const FLOWS = [
  { key: "rent_receipts", label: "Tenant receipts", dir: "in" },
  { key: "deposits", label: "Tenant deposits (net)", dir: "in" },
  { key: "opex", label: "Operating costs", dir: "out" },
  { key: "property_tax", label: "Property tax", dir: "out" },
  { key: "capex", label: "Capital expenditure", dir: "out" },
  { key: "interest", label: "Loan interest", dir: "out" },
  { key: "principal", label: "Loan principal", dir: "out" },
  { key: "distributions", label: "Distributions", dir: "out" },
] as const

export type FlowKey = (typeof FLOWS)[number]["key"]

export interface FlowLine {
  key: FlowKey
  label: string
  dir: "in" | "out"
  actual: (number | null)[]   // null = month not closed yet
  plan: number[]
  ytdActual: number
  ytdPlan: number
  fyPlan: number
  fyOutlook: number
}

export interface CashModel {
  year: string
  months: string[]
  closed: boolean[]
  lines: FlowLine[]
  opening: number
  netActual: (number | null)[]
  netPlan: number[]
  closingActual: (number | null)[]
  closingPlan: number[]
  closingOutlook: number[]
  ytdActual: number
  ytdPlan: number
  fyPlan: number
  fyOutlook: number
  buffer: number          // minimum cash to hold: next 3 months of debt service
  lowest: { month: string; value: number }
}

export function buildCashModel(actual: CashActualRow[], plan: CashPlanRow[], year: string, last: string): CashModel {
  const months = monthRange(`${year}-01`, `${year}-12`)
  const closed = months.map((m) => monthDiff(m, last) >= 0)
  const idx = new Map(months.map((m, i) => [m, i]))

  // Opening cash on 1 Jan = every bank movement before the year (incl. the opening balance).
  let opening = 0
  const act = new Map<string, number[]>()
  for (const r of actual) {
    const k = mk(r.period)
    if (k < `${year}-01`) { opening += r.net; continue }
    const i = idx.get(k)
    if (i == null || r.flow === "opening") continue
    const arr = act.get(r.flow) ?? months.map(() => 0)
    arr[i] += r.net
    act.set(r.flow, arr)
  }
  const pl = new Map<string, number[]>()
  for (const r of plan) {
    const i = idx.get(mk(r.period))
    if (i == null) continue
    const arr = pl.get(r.flow) ?? months.map(() => 0)
    arr[i] += r.amount
    pl.set(r.flow, arr)
  }

  const lines: FlowLine[] = FLOWS.map((f) => {
    const a = act.get(f.key) ?? months.map(() => 0)
    const p = pl.get(f.key) ?? months.map(() => 0)
    const actualM = a.map((v, i) => (closed[i] ? v : null))
    const ytdActual = a.reduce((s, v, i) => s + (closed[i] ? v : 0), 0)
    const ytdPlan = p.reduce((s, v, i) => s + (closed[i] ? v : 0), 0)
    const fyPlan = p.reduce((s, v) => s + v, 0)
    return { key: f.key, label: f.label, dir: f.dir, actual: actualM, plan: p, ytdActual, ytdPlan, fyPlan, fyOutlook: ytdActual + (fyPlan - ytdPlan) }
  }).filter((l) => l.fyPlan !== 0 || l.ytdActual !== 0)

  const netActual = months.map((_, i) => (closed[i] ? lines.reduce((s, l) => s + (l.actual[i] ?? 0), 0) : null))
  const netPlan = months.map((_, i) => lines.reduce((s, l) => s + l.plan[i], 0))
  let ca = opening, cp = opening, co = opening
  const closingActual: (number | null)[] = [], closingPlan: number[] = [], closingOutlook: number[] = []
  months.forEach((_, i) => {
    cp += netPlan[i]
    closingPlan.push(cp)
    if (closed[i]) { ca += netActual[i]!; co = ca; closingActual.push(ca) } else { co += netPlan[i]; closingActual.push(null) }
    closingOutlook.push(co)
  })
  const sum = (xs: number[]) => xs.reduce((s, v) => s + v, 0)
  const ytdActual = sum(lines.map((l) => l.ytdActual))
  const ytdPlan = sum(lines.map((l) => l.ytdPlan))
  const fyPlan = sum(lines.map((l) => l.fyPlan))
  const debt = lines.filter((l) => l.key === "interest" || l.key === "principal")
  const buffer = Math.abs(sum(debt.map((l) => l.fyPlan))) / 12 * 3
  let lowest = { month: months[0], value: Infinity }
  closingOutlook.forEach((v, i) => { if (v < lowest.value) lowest = { month: months[i], value: v } })
  return {
    year, months, closed, lines, opening, netActual, netPlan, closingActual, closingPlan, closingOutlook,
    ytdActual, ytdPlan, fyPlan, fyOutlook: ytdActual + (fyPlan - ytdPlan), buffer, lowest,
  }
}

/** Opening cash → what came in and went out, year to date → cash today. */
export function cashBridge(m: CashModel): WfStep[] {
  const ytd = (...keys: FlowKey[]) => m.lines.filter((l) => keys.includes(l.key)).reduce((s, l) => s + l.ytdActual, 0)
  const steps: WfStep[] = [
    { name: "Cash 1 Jan", value: m.opening, isTotal: true },
    { name: "Tenant receipts", value: ytd("rent_receipts", "deposits") },
    { name: "Running costs & tax", value: ytd("opex", "property_tax") },
    { name: "Capex", value: ytd("capex") },
    { name: "Debt service", value: ytd("interest", "principal") },
    { name: "Dividends", value: ytd("distributions") },
  ].filter((s) => s.isTotal || Math.abs(s.value) >= 1)
  return [...steps, { name: "Cash today", value: m.opening + m.ytdActual, isTotal: true }]
}
