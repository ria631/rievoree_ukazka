import { describe, expect, it } from "vitest"
import type { BudgetRow } from "./useBudget"
import type { ReportRow } from "./useReport"
import type { Lease, RentRollData, Unit } from "./useRentRoll"
import { runForecast, type Drivers } from "./forecast"
import { addMonths, monthRange } from "./period"

const LAST = "2026-09" // horizon Oct 2026 – Sep 2027

function unit(id: string, area: number, ervM2: number, entity = "e1"): Unit {
  return { id, entity_id: entity, property_id: entity === "e1" ? "p1" : "p2", code: id.toUpperCase(), floor: null, use: "office", area_m2: area, erv_m2: ervM2 }
}
function lease(id: string, unitId: string, tenant: string, start: string, end: string, rent: number, sc: number, parking: number, idx: number): Lease {
  return {
    id, entity_id: "e1", unit_id: unitId, tenant, start_date: start, end_date: end, rent_month: rent,
    service_charge_month: sc, parking_month: parking, indexation_pct: idx, deposit: 0,
  }
}
function row(period: string, code: string, name: string, type: string, debit: number, credit: number, entity = "e1"): ReportRow {
  return {
    entity_id: entity, period: `${period}-01`, account_id: code, account_code: code, account_name: name,
    account_type: type, debit, credit, net: debit - credit, entry_count: 1,
  }
}

//   u1 100 m² Alpha: 1 000 rent + 200 SC + 50 parking, +10 % indexation every March, runs past the horizon
//   u2 100 m² Beta:  1 000 rent + 100 SC, expires 31 Dec 2026; ERV 12/m² → 1 200
//   u3  50 m² vacant today; ERV 20/m² → 1 000
//   u9 belongs to another company and is filtered out
const office = (segment: "office" | "residential"): RentRollData => ({
  properties: [
    { id: "p1", entity_id: "e1", name: "Office One", segment, city: "Bratislava", address: null, valuation: 0, valuation_date: null },
    { id: "p2", entity_id: "e2", name: "Other Co", segment: "office", city: "Košice", address: null, valuation: 0, valuation_date: null },
  ],
  units: [unit("u1", 100, 15), unit("u2", 100, 12), unit("u3", 50, 20), unit("u9", 100, 10, "e2")],
  leases: [
    lease("L1", "u1", "Alpha", "2025-03-01", "2027-12-31", 1000, 200, 50, 10),
    lease("L2", "u2", "Beta", "2023-01-01", "2026-12-31", 1000, 100, 0, 0),
    lease("L9", "u9", "Other", "2024-01-01", "2030-12-31", 5000, 0, 0, 0),
  ],
})

const ROWS: ReportRow[] = [
  ...monthRange("2025-10", "2026-09").map((m) => row(m, "5000", "Utilities", "expense", 400, 0)),
  row("2026-01", "5500", "Letting fees", "expense", 5000, 0),      // one-off, not part of the run-rate
  row("2026-06", "7000", "Interest expense", "expense", 600, 0),   // outside the 3-month interest window
  row("2026-07", "7000", "Interest expense", "expense", 300, 0),
  row("2026-08", "7000", "Interest expense", "expense", 300, 0),
  row("2026-09", "7000", "Interest expense", "expense", 360, 0),
  row("2025-12", "2500", "Bank loan", "liability", 2000, 0),       // repayment pattern
  row("2026-09", "4000", "Rental income", "revenue", 0, 2000),
  row("2025-10", "5000", "Utilities", "expense", 10000, 0, "e2"),  // other company
]
const BUDGETS: BudgetRow[] = [
  { entity_id: "e1", period: "2026-10-01", account_code: "4000", amount: 3000 },
  { entity_id: "e1", period: "2026-10-01", account_code: "5000", amount: 500 },
  { entity_id: "e2", period: "2026-10-01", account_code: "4000", amount: 99999 },
]

const BASE: Drivers = { renewal: 50, voidMonths: 3, cpi: 0, opexInfl: 10, badDebt: 0 }
const run = (d: Partial<Drivers> = {}, segment: "office" | "residential" = "office") =>
  runForecast({ data: office(segment), rows: ROWS, budgets: BUDGETS, last: LAST, include: (e) => e === "e1" }, { ...BASE, ...d })

describe("runForecast — revenue from the rent roll", () => {
  const fc = run()

  it("covers the 12 months after the last closed month", () => {
    expect(fc.months.map((m) => m.month)).toEqual(monthRange(addMonths(LAST, 1), addMonths(LAST, 12)))
  })

  it("indexes running leases on their anniversary, re-lets expiries and voids at ERV", () => {
    // Oct–Dec: u1 1 000 + u2 1 000                     = 2 000
    // Jan–Feb: u1 1 000 + u2 50 % renewed at ERV 600 + u3 let after a 3-month void 1 000 = 2 600
    // Mar:     u1 indexed to 1 100                      = 2 700
    // Apr–Sep: u2's other 50 % re-let after its void → 1 100 + 1 200 + 1 000 = 3 300
    expect(fc.months.map((m) => m.rent)).toEqual([2000, 2000, 2000, 2600, 2600, 2700, 3300, 3300, 3300, 3300, 3300, 3300])
    // SC + parking: 250 + 100; then u2 half-occupied (50); u3 has no SC history
    expect(fc.months.map((m) => m.other)).toEqual([350, 350, 350, 300, 300, 300, 350, 350, 350, 350, 350, 350])
  })

  it("flags expiries and vacancies, biggest income first, and the rent at risk", () => {
    expect(fc.events.map((e) => [e.unit, e.kind, e.month, e.rentPa, e.ervPa])).toEqual([
      ["U2", "expiry", "2026-12", 12000, 14400],
      ["U3", "vacant", "2026-09", 0, 12000],
    ])
    expect(fc.rentAtRisk).toBe(6000) // 12 000 p.a. × (1 − 50 % renewal)
  })

  it("applies the bad-debt allowance to all revenue", () => {
    const m = run({ badDebt: 2 }).months[0]
    expect(m.revenue).toBeCloseTo(2350 * 0.98, 10)
    expect(m.rent).toBeCloseTo(2000 * 0.98, 10)
  })

  it("grows market rent (ERV) with CPI but leaves running leases on their own indexation", () => {
    // Sep 2027, 12 months out: u1 1 100 (contract) + u2 1 200 × 1.12 + u3 1 000 × 1.12
    expect(run({ cpi: 12 }).months[11].rent).toBeCloseTo(1100 + 1344 + 1120, 8)
  })

  it("shortens the void for residential space (void ÷ 3, min 1 month) with a smaller letting fee", () => {
    const m = run({}, "residential").months[1] // Nov 2026: u3 let after a 1-month void
    expect(m.rent).toBe(3000)
    expect(m.opex).toBeCloseTo(440 + 0.5 * 1000, 8) // run-rate + ½ month's ERV fee
  })
})

describe("runForecast — costs, debt service and outlook", () => {
  const fc = run()

  it("grows last year's same-month opex by inflation and adds letting fees for new lettings", () => {
    // run-rate 400 × 1.10 = 440; Jan: + 1.5 × 1 000 (u3); Apr: + 50 % × 1.5 × 1 200 (u2)
    const opex = fc.months.map((m) => Math.round(m.opex * 100) / 100)
    expect(opex).toEqual([440, 440, 440, 1940, 440, 440, 1340, 440, 440, 440, 440, 440])
    expect(fc.months[0].noi).toBeCloseTo(2350 - 440, 8)
    expect(fc.months[0].budgetNoi).toBe(2500)
    expect(fc.months[1].budgetNoi).toBeNull()
  })

  it("takes interest at the last-3-month run-rate and principal from the same month last year", () => {
    expect(fc.months.every((m) => m.interest === 320)).toBe(true) // (300 + 300 + 360) / 3
    expect(fc.months.map((m) => m.principal)).toEqual([0, 0, 2000, 0, 0, 0, 0, 0, 0, 0, 0, 0])
  })

  it("shows the last 12 months of actual NOI as history", () => {
    expect(fc.history).toHaveLength(12)
    expect(fc.history.at(-1)).toEqual({ month: "2026-09", noi: 1600, budgetNoi: null }) // 2 000 − 400
    expect(fc.history.find((h) => h.month === "2026-01")?.noi).toBe(-5400)          // −400 − 5 000 letting fee
  })

  it("builds the full-year outlook as actual YTD + forecast for the rest of the year", () => {
    expect(fc.outlookYear).toBe("2026")
    const noi = fc.outlook.find((r) => r.label === "Net operating income")!
    // YTD: 2 000 rent − (9 × 400 + 5 000) opex; rest Oct–Dec: 6 000 + 1 050 − 3 × 440
    expect(noi.ytd).toBe(-6600)
    expect(noi.rest).toBeCloseTo(5730, 8)
    expect(noi.outlook).toBeCloseTo(noi.ytd + noi.rest, 8)
    expect(noi.budget).toBe(2500) // other company's budget excluded
  })
})

describe("runForecast — signed leases that haven't started", () => {
  // u3 (50 m², ERV 1 000) is pre-let to Gamma from 1 Dec 2026 at 1 500 + 100 SC.
  const prelet: RentRollData = {
    ...office("office"),
    leases: [...office("office").leases, lease("L3", "u3", "Gamma", "2026-12-01", "2031-11-30", 1500, 100, 0, 0)],
  }
  const fc = runForecast({ data: prelet, rows: ROWS, budgets: BUDGETS, last: LAST, include: (e) => e === "e1" }, BASE)
  const plain = run()

  it("collects the signed rent from its start month, not ERV after a void", () => {
    // Oct–Nov: u3 still empty (committed, so no speculative re-let); Dec: +1 500 rent + 100 SC
    const delta = (k: number) => fc.months[k].revenue - plain.months[k].revenue
    expect(delta(0)).toBe(0)
    expect(delta(1)).toBe(0)
    expect(delta(2)).toBe(1500 + 100)
    // From month 4 the plain forecast would have re-let u3 at ERV 1 000 + its SC
    expect(fc.months[6].revenue).toBeGreaterThan(plain.months[6].revenue)
  })

  it("lists it as signed, not vacant", () => {
    expect(fc.events.find((e) => e.unit === "U3")).toMatchObject({ kind: "signed", tenant: "Gamma", month: "2026-12", rentPa: 18000 })
    expect(fc.events.some((e) => e.unit === "U3" && e.kind === "vacant")).toBe(false)
  })
})

describe("runForecast — short interest history", () => {
  it("averages only the months that have interest (one month of history isn't a third of it)", () => {
    const rows = [...ROWS.filter((r) => r.account_code !== "7000"), row("2026-09", "7000", "Interest expense", "expense", 900, 0)]
    const fc = runForecast({ data: office("office"), rows, budgets: BUDGETS, last: LAST, include: (e) => e === "e1" }, BASE)
    expect(fc.months[0].interest).toBe(900) // was 900 / 3 = 300
  })
})
