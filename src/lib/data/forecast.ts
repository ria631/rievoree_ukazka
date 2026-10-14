import type { RentRollData, Lease } from "./useRentRoll"
import type { ReportRow } from "./useReport"
import type { BudgetRow } from "./useBudget"
import { classify, isLoan, plAmount } from "./aggregate"
import { addMonths, mk, monthDiff, monthEnd, monthRange } from "./period"

/**
 * Rolling 12-month forecast, built bottom-up from the rent roll — computed in
 * the browser, so moving a driver re-forecasts instantly with no server call.
 *
 * Revenue, unit by unit, month by month:
 *   • lease running        contract rent, stepped up by its indexation on
 *                          each anniversary
 *   • lease expires        `renewal` share renews at market rent (ERV); the
 *                          rest re-lets at ERV after a `void` of empty months
 *   • unit vacant today    lets at ERV after the void
 *   then less a bad-debt allowance.
 * Costs: the same month last year (keeps seasonality: heating in winter, tax
 * in April) grown by opex inflation, plus a letting fee for every new letting.
 * Debt service: the run-rate of interest and the loan's repayment pattern.
 */
export interface Drivers {
  renewal: number    // % of expiring leases that renew
  voidMonths: number // months a unit stands empty before it re-lets
  cpi: number        // % p.a. — indexation and market-rent growth
  opexInfl: number   // % p.a. cost inflation
  badDebt: number    // % of revenue never collected
}

export const SCENARIOS: Record<"base" | "downside" | "upside", Drivers & { label: string }> = {
  base: { label: "Base", renewal: 65, voidMonths: 6, cpi: 2.5, opexInfl: 4, badDebt: 1 },
  downside: { label: "Downside", renewal: 40, voidMonths: 12, cpi: 1.5, opexInfl: 7, badDebt: 3 },
  upside: { label: "Upside", renewal: 85, voidMonths: 3, cpi: 3.5, opexInfl: 3, badDebt: 0.5 },
}

export interface ForecastMonth {
  month: string
  rent: number
  other: number      // service charge + parking
  revenue: number
  opex: number
  noi: number
  interest: number
  principal: number
  budgetNoi: number | null
}

export interface LeaseEvent {
  property: string
  unit: string
  tenant: string | null
  month: string          // expiry month (or "now" for vacant)
  rentPa: number         // passing rent p.a. (0 if vacant)
  ervPa: number
  kind: "expiry" | "vacant"
}

export interface OutlookRow { label: string; ytd: number; rest: number; outlook: number; budget: number; favorableUp: boolean; strong?: boolean }

export interface Forecast {
  months: ForecastMonth[]
  history: { month: string; noi: number; budgetNoi: number | null }[]
  events: LeaseEvent[]
  rentAtRisk: number
  outlookYear: string
  outlook: OutlookRow[]
}

interface Input {
  data: RentRollData
  rows: ReportRow[]
  budgets: BudgetRow[]
  last: string
  include: (entityId: string) => boolean
}

const isLetting = (r: { account_code: string; account_name: string }) =>
  r.account_code === "5500" || /letting|leasing|agent/i.test(r.account_name)

export function runForecast({ data, rows, budgets, last, include }: Input, d: Drivers): Forecast {
  const horizon = monthRange(addMonths(last, 1), addMonths(last, 12))
  const asOf = monthEnd(last)
  const propOf = new Map(data.properties.map((p) => [p.id, p]))
  const units = data.units.filter((u) => include(u.entity_id))
  const byUnit = new Map<string, Lease[]>()
  for (const l of data.leases) byUnit.set(l.unit_id, [...(byUnit.get(l.unit_id) ?? []), l])

  const rent = horizon.map(() => 0), other = horizon.map(() => 0), letting = horizon.map(() => 0)
  const events: LeaseEvent[] = []
  let rentAtRisk = 0
  const g = (m: string) => Math.pow(1 + d.cpi / 100, monthDiff(last, m) / 12)

  for (const u of units) {
    const prop = propOf.get(u.property_id)
    const resi = prop?.segment === "residential"
    const voidM = resi ? Math.max(1, Math.round(d.voidMonths / 3)) : d.voidMonths
    const feeX = resi ? 0.5 : 1.5
    const leases = (byUnit.get(u.id) ?? []).sort((a, b) => a.start_date.localeCompare(b.start_date))
    const cur = leases.find((l) => l.start_date <= asOf && l.end_date >= asOf) ?? null
    const ervM = u.erv_m2 * u.area_m2
    const scRate = cur ? cur.service_charge_month / u.area_m2 : (leases.at(-1)?.service_charge_month ?? 0) / u.area_m2
    const p = d.renewal / 100

    if (cur) {
      const endK = mk(cur.end_date)
      if (endK <= horizon[11]) {
        events.push({ property: prop?.name ?? "—", unit: u.code, tenant: cur.tenant, month: endK, rentPa: cur.rent_month * 12, ervPa: ervM * 12, kind: "expiry" })
        rentAtRisk += cur.rent_month * 12 * (1 - p)
      }
      horizon.forEach((m, i) => {
        if (m <= endK) {
          // Indexation steps on each lease anniversary after the as-of month.
          const startMonth = Number(cur.start_date.slice(5, 7))
          let steps = 0
          for (const k of monthRange(addMonths(last, 1), m)) if (Number(k.slice(5, 7)) === startMonth) steps++
          rent[i] += cur.rent_month * Math.pow(1 + cur.indexation_pct / 100, steps)
          other[i] += cur.service_charge_month + cur.parking_month
        } else {
          const since = monthDiff(endK, m)          // months after expiry (≥ 1)
          const relet = since > voidM ? 1 : 0
          rent[i] += ervM * g(m) * (p + (1 - p) * relet)
          other[i] += scRate * u.area_m2 * (p + (1 - p) * relet) + cur.parking_month * p
          if (since === voidM + 1) letting[i] += (1 - p) * feeX * ervM * g(m)
        }
      })
    } else {
      events.push({ property: prop?.name ?? "—", unit: u.code, tenant: null, month: last, rentPa: 0, ervPa: ervM * 12, kind: "vacant" })
      horizon.forEach((m, i) => {
        const since = monthDiff(last, m)
        if (since > voidM) { rent[i] += ervM * g(m); other[i] += scRate * u.area_m2 }
        if (since === voidM + 1) letting[i] += feeX * ervM * g(m)
      })
    }
  }

  // Costs and debt service from history (same month last year).
  const scoped = rows.filter((r) => include(r.entity_id))
  const opexBy = new Map<string, number>(), interestBy = new Map<string, number>(), principalBy = new Map<string, number>()
  for (const r of scoped) {
    const k = mk(r.period), c = classify(r)
    if (c === "opex" && !isLetting(r)) opexBy.set(k, (opexBy.get(k) ?? 0) + plAmount(r))
    if (c === "interest") interestBy.set(k, (interestBy.get(k) ?? 0) + plAmount(r))
    if (isLoan(r)) principalBy.set(k, (principalBy.get(k) ?? 0) + r.debit)
  }
  const recentInterest = monthRange(addMonths(last, -2), last).reduce((s, k) => s + (interestBy.get(k) ?? 0), 0) / 3
  const budgetNoi = budgetNoiBy(budgets.filter((b) => include(b.entity_id)))

  const months: ForecastMonth[] = horizon.map((m, i) => {
    const ly = addMonths(m, -12)
    const revenue = (rent[i] + other[i]) * (1 - d.badDebt / 100)
    const opex = (opexBy.get(ly) ?? 0) * (1 + d.opexInfl / 100) + letting[i]
    return {
      month: m, rent: rent[i] * (1 - d.badDebt / 100), other: other[i] * (1 - d.badDebt / 100), revenue, opex,
      noi: revenue - opex, interest: recentInterest, principal: principalBy.get(ly) ?? 0,
      budgetNoi: budgetNoi.get(m) ?? null,
    }
  })

  // Actual NOI history (last 12 closed months) for the chart.
  const histNoi = new Map<string, number>()
  for (const r of scoped) {
    const c = classify(r), k = mk(r.period)
    if (c === "revenue") histNoi.set(k, (histNoi.get(k) ?? 0) + plAmount(r))
    if (c === "opex") histNoi.set(k, (histNoi.get(k) ?? 0) - plAmount(r))
  }
  const history = monthRange(addMonths(last, -11), last).map((m) => ({ month: m, noi: histNoi.get(m) ?? 0, budgetNoi: budgetNoi.get(m) ?? null }))

  const { year, rowsOut } = outlook(scoped, budgets.filter((b) => include(b.entity_id)), months, last)
  // Biggest income at stake first: expiries by rent, then vacant space by ERV.
  events.sort((a, b) => (a.kind === b.kind ? (b.rentPa - a.rentPa) || (b.ervPa - a.ervPa) : a.kind === "expiry" ? -1 : 1))
  return { months, history, events, rentAtRisk, outlookYear: year, outlook: rowsOut }
}

function budgetNoiBy(budgets: BudgetRow[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const b of budgets) {
    const k = mk(b.period)
    if (b.account_code.startsWith("4")) m.set(k, (m.get(k) ?? 0) + b.amount)
    else if (b.account_code.startsWith("5")) m.set(k, (m.get(k) ?? 0) - b.amount)
  }
  return m
}

/** Full-year outlook ("latest estimate"): actual year-to-date + forecast for the rest of the year, against the budget. */
function outlook(rows: ReportRow[], budgets: BudgetRow[], fc: ForecastMonth[], last: string) {
  const year = addMonths(last, 1).slice(0, 4)
  const inYear = (k: string) => k.slice(0, 4) === year
  const ytd = { rent: 0, other: 0, opex: 0, interest: 0 }
  for (const r of rows) {
    const k = mk(r.period)
    if (!inYear(k) || k > last) continue
    const c = classify(r)
    if (c === "revenue") { if (r.account_code === "4000" || /rent/i.test(r.account_name)) ytd.rent += plAmount(r); else ytd.other += plAmount(r) }
    else if (c === "opex") ytd.opex += plAmount(r)
    else if (c === "interest") ytd.interest += plAmount(r)
  }
  const rest = { rent: 0, other: 0, opex: 0, interest: 0 }
  for (const f of fc) if (inYear(f.month)) { rest.rent += f.rent; rest.other += f.other; rest.opex += f.opex; rest.interest += f.interest }
  const bud = { rent: 0, other: 0, opex: 0, interest: 0 }
  for (const b of budgets) {
    if (!inYear(mk(b.period))) continue
    const c = b.account_code
    if (c === "4000") bud.rent += b.amount
    else if (c.startsWith("4")) bud.other += b.amount
    else if (c.startsWith("5")) bud.opex += b.amount
    else if (c.startsWith("7")) bud.interest += b.amount
  }
  const row = (label: string, k: keyof typeof ytd, favorableUp: boolean): OutlookRow =>
    ({ label, ytd: ytd[k], rest: rest[k], outlook: ytd[k] + rest[k], budget: bud[k], favorableUp })
  const r1 = row("Rental income", "rent", true)
  const r2 = row("Service charge & parking", "other", true)
  const r3 = row("Operating costs", "opex", false)
  const noi: OutlookRow = {
    label: "Net operating income", strong: true, favorableUp: true,
    ytd: r1.ytd + r2.ytd - r3.ytd, rest: r1.rest + r2.rest - r3.rest,
    outlook: r1.outlook + r2.outlook - r3.outlook, budget: r1.budget + r2.budget - r3.budget,
  }
  const r5 = row("Interest", "interest", false)
  const cf: OutlookRow = {
    label: "NOI after interest", strong: true, favorableUp: true,
    ytd: noi.ytd - r5.ytd, rest: noi.rest - r5.rest, outlook: noi.outlook - r5.outlook, budget: noi.budget - r5.budget,
  }
  return { year, rowsOut: [r1, r2, r3, noi, r5, cf] }
}
