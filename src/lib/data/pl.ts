import type { ReportRow } from "./useReport"
import type { BudgetRow } from "./useBudget"
import { classify, plAmount, type PlClass, type WfStep } from "./aggregate"
import { addMonths, mk, mLong, monthRange } from "./period"

/**
 * The property P&L statement: Actual vs Budget for a period scope.
 *
 *   Revenue                          (rent, service charge, parking)
 * − Property operating expenses      (utilities, repairs, management, …)
 * = NET OPERATING INCOME (NOI)       ← what the building earns
 * − Depreciation                     = Operating profit (EBIT)
 * − Interest                         = PROFIT BEFORE TAX
 *
 * `favorableUp` drives the variance colour: income is good above budget,
 * costs are good below it.
 */
export type PlRow =
  | { kind: "section"; id: string; label: string }
  | { kind: "line"; sectionId: string; code: string; label: string; actual: number; budget: number; monthly: number[]; favorableUp: boolean }
  | { kind: "subtotal"; id: string; label: string; actual: number; budget: number; favorableUp: boolean; strong: boolean }

/** Period scopes a finance team actually reports on. */
export function scopeOptions(last: string, first: string): { value: string; label: string }[] {
  const year = last.slice(0, 4)
  const prev = String(Number(year) - 1)
  const opts = [
    { value: "ytd", label: `YTD ${year}` },
    { value: "ltm", label: "Last 12 months" },
  ]
  if (first <= `${prev}-01`) opts.push({ value: `fy:${prev}`, label: `FY ${prev}` })
  return [...opts, ...monthRange(first, last).reverse().map((k) => ({ value: `m:${k}`, label: mLong(k) }))]
}

export function scopeMonths(scope: string, last: string): Set<string> {
  if (scope === "ytd") return new Set(monthRange(`${last.slice(0, 4)}-01`, last))
  if (scope === "ltm") return new Set(monthRange(addMonths(last, -11), last))
  if (scope.startsWith("fy:")) { const y = scope.slice(3); return new Set(monthRange(`${y}-01`, `${y}-12`)) }
  if (scope.startsWith("m:")) return new Set([scope.slice(2)])
  return new Set()
}

export function scopeLabel(scope: string, last: string): string {
  return scopeOptions(last, "0000-01").find((o) => o.value === scope)?.label ?? (scope.startsWith("m:") ? mLong(scope.slice(2)) : scope)
}

interface Acc { name: string; cls: PlClass; actual: number; monthly: Map<string, number> }

/** Budget codes carry no type — classify them like the chart does (4xxx income, 5xxx opex…). */
function budgetClass(code: string, acct?: Acc): PlClass | null {
  if (acct) return acct.cls
  if (code.startsWith("4")) return "revenue"
  if (code.startsWith("5")) return "opex"
  if (code.startsWith("6")) return "depreciation"
  if (code.startsWith("7")) return "interest"
  return null
}

export function buildPl(rows: ReportRow[], budgets: BudgetRow[], months: Set<string>, trend: string[]): PlRow[] {
  const acct = new Map<string, Acc>()
  for (const r of rows) {
    const cls = classify(r)
    if (!cls) continue
    const val = plAmount(r)
    const cur = acct.get(r.account_code) ?? { name: r.account_name, cls, actual: 0, monthly: new Map() }
    const k = mk(r.period)
    cur.monthly.set(k, (cur.monthly.get(k) ?? 0) + val)
    if (months.has(k)) cur.actual += val
    acct.set(r.account_code, cur)
  }
  const bud = new Map<string, number>()
  for (const b of budgets) {
    if (!months.has(mk(b.period))) continue
    bud.set(b.account_code, (bud.get(b.account_code) ?? 0) + b.amount)
    if (!acct.has(b.account_code) && budgetClass(b.account_code)) {
      acct.set(b.account_code, { name: b.account_code, cls: budgetClass(b.account_code)!, actual: 0, monthly: new Map() })
    }
  }

  const codes = (cls: PlClass) => [...acct.keys()].filter((c) => acct.get(c)!.cls === cls).sort()
  const sum = (cs: string[], key: "actual" | "budget") =>
    cs.reduce((s, c) => s + (key === "actual" ? acct.get(c)!.actual : bud.get(c) ?? 0), 0)
  const line = (code: string, sectionId: string, favorableUp: boolean): PlRow => {
    const a = acct.get(code)!
    return {
      kind: "line", sectionId, code, label: a.name, actual: a.actual, budget: bud.get(code) ?? 0,
      monthly: trend.map((m) => a.monthly.get(m) ?? 0), favorableUp,
    }
  }
  const sub = (id: string, label: string, actual: number, budget: number, favorableUp: boolean, strong = false): PlRow =>
    ({ kind: "subtotal", id, label, actual, budget, favorableUp, strong })

  const rev = codes("revenue"), opex = codes("opex"), dep = codes("depreciation"), int = codes("interest")
  const revA = sum(rev, "actual"), revB = sum(rev, "budget")
  const opA = sum(opex, "actual"), opB = sum(opex, "budget")
  const depA = sum(dep, "actual"), depB = sum(dep, "budget")
  const intA = sum(int, "actual"), intB = sum(int, "budget")
  const noiA = revA - opA, noiB = revB - opB

  const out: PlRow[] = []
  out.push({ kind: "section", id: "revenue", label: "Revenue" })
  rev.forEach((c) => out.push(line(c, "revenue", true)))
  out.push(sub("total-revenue", "Total revenue", revA, revB, true))
  out.push({ kind: "section", id: "opex", label: "Property operating expenses" })
  opex.forEach((c) => out.push(line(c, "opex", false)))
  out.push(sub("total-opex", "Total operating expenses", opA, opB, false))
  out.push(sub("noi", "Net operating income (NOI)", noiA, noiB, true, true))
  if (dep.length) {
    out.push({ kind: "section", id: "dep", label: "Depreciation" })
    dep.forEach((c) => out.push(line(c, "dep", false)))
    out.push(sub("ebit", "Operating profit (EBIT)", noiA - depA, noiB - depB, true))
  }
  if (int.length) {
    out.push({ kind: "section", id: "fin", label: "Finance costs" })
    int.forEach((c) => out.push(line(c, "fin", false)))
  }
  out.push(sub("pbt", "Profit before tax", noiA - depA - intA, noiB - depB - intB, true, true))
  return out
}

/** Revenue → NOI → profit before tax, as a bridge. */
export function profitBridge(model: PlRow[]): WfStep[] {
  const get = (id: string) => model.find((r) => r.kind === "subtotal" && r.id === id) as Extract<PlRow, { kind: "subtotal" }> | undefined
  const rev = get("total-revenue")?.actual ?? 0
  const opex = get("total-opex")?.actual ?? 0
  const noi = get("noi")?.actual ?? 0
  const pbt = get("pbt")?.actual ?? 0
  const dep = model.filter((r) => r.kind === "line" && r.sectionId === "dep").reduce((s, r) => s + (r.kind === "line" ? r.actual : 0), 0)
  const int = model.filter((r) => r.kind === "line" && r.sectionId === "fin").reduce((s, r) => s + (r.kind === "line" ? r.actual : 0), 0)
  return [
    { name: "Revenue", value: rev },
    { name: "Operating costs", value: -opex },
    { name: "NOI", value: noi, isTotal: true },
    { name: "Depreciation", value: -dep },
    { name: "Interest", value: -int },
    { name: "Profit before tax", value: pbt, isTotal: true },
  ]
}

/** Budget variance per line, signed so + is favourable (beats plan). */
export function lineVariances(model: PlRow[]): { name: string; value: number }[] {
  return model
    .filter((r): r is Extract<PlRow, { kind: "line" }> => r.kind === "line" && r.budget !== 0)
    .map((r) => ({ name: r.label, value: r.favorableUp ? r.actual - r.budget : r.budget - r.actual }))
    .filter((v) => Math.abs(v.value) >= 1)
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .slice(0, 8)
}
