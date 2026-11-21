import { describe, expect, it } from "vitest"
import type { CashActualRow, CashPlanRow } from "./useCash"
import { buildCashModel, cashBridge } from "./cashflow"

const act = (period: string, flow: string, net: number): CashActualRow =>
  ({ entity_id: "e1", period: `${period}-01`, flow, inflow: Math.max(net, 0), outflow: Math.max(-net, 0), net })
const plan = (period: string, flow: string, amount: number): CashPlanRow =>
  ({ entity_id: "e1", period: `${period}-01`, flow, amount })

const ACTUAL: CashActualRow[] = [
  act("2025-06", "opening", 50000),        // before the year → opening cash
  act("2025-12", "rent_receipts", 10000),  // before the year → opening cash (60 000)
  act("2026-01", "rent_receipts", 12000), act("2026-01", "opex", -4000), act("2026-01", "interest", -1000), act("2026-01", "principal", -2000),
  act("2026-02", "rent_receipts", 11000), act("2026-02", "opex", -5000), act("2026-02", "interest", -1000), act("2026-02", "principal", -2000),
  act("2026-03", "rent_receipts", 12000), act("2026-03", "opex", -3000), act("2026-03", "capex", -20000),
  act("2026-03", "interest", -1000), act("2026-03", "principal", -2000),
  act("2026-04", "rent_receipts", 99999),  // a month that is not closed yet → must not count
  act("2027-01", "rent_receipts", 88888),  // next year → ignored
]
// Plan: +12 000 receipts, −4 000 opex, −1 000 interest, −2 000 principal every month (net +5 000);
// one −30 000 capex in June.
const PLAN: CashPlanRow[] = [
  ...Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, "0")}`).flatMap((m) => [
    plan(m, "rent_receipts", 12000), plan(m, "opex", -4000), plan(m, "interest", -1000), plan(m, "principal", -2000),
  ]),
  plan("2026-06", "capex", -30000),
]

const M = buildCashModel(ACTUAL, PLAN, "2026", "2026-03")

describe("buildCashModel", () => {
  it("opens the year with every bank movement before 1 Jan and closes only months up to the last closed one", () => {
    expect(M.opening).toBe(60000)
    expect(M.closed.filter(Boolean)).toHaveLength(3)
    expect(M.lines.map((l) => l.key)).toEqual(["rent_receipts", "opex", "capex", "interest", "principal"]) // empty flows dropped
  })

  it("runs the actual balance through closed months and the plan after (outlook)", () => {
    // net actual: Jan +5 000, Feb +3 000, Mar −14 000 (capex)
    expect(M.netActual.slice(0, 4)).toEqual([5000, 3000, -14000, null])
    expect(M.closingActual.slice(0, 4)).toEqual([65000, 68000, 54000, null])
    // Apr–May +5 000 each, Jun −25 000, then +5 000 a month → Dec 69 000
    expect(M.closingOutlook).toEqual([65000, 68000, 54000, 59000, 64000, 39000, 44000, 49000, 54000, 59000, 64000, 69000])
    expect(M.closingPlan.at(-1)).toBe(90000) // 60 000 + full-year plan 30 000
    expect(M.lowest).toEqual({ month: "2026-06", value: 39000 })
  })

  it("compares YTD actual vs plan and re-forecasts the full year", () => {
    // YTD actual: 35 000 − 12 000 − 20 000 − 3 000 − 6 000; YTD plan: 36 000 − 12 000 − 3 000 − 6 000
    expect(M.ytdActual).toBe(-6000)
    expect(M.ytdPlan).toBe(15000)
    expect(M.fyPlan).toBe(30000)
    expect(M.fyOutlook).toBe(9000) // −6 000 + (30 000 − 15 000)
    expect(M.closingOutlook.at(-1)).toBe(M.opening + M.fyOutlook)
  })

  it("holds three months of planned debt service as the cash buffer", () => {
    // |−12 000 interest − 24 000 principal| / 12 × 3
    expect(M.buffer).toBe(9000)
  })

  it("returns a flat zero model for no data", () => {
    const e = buildCashModel([], [], "2026", "2026-03")
    expect(e).toMatchObject({ opening: 0, lines: [], ytdActual: 0, fyOutlook: 0, buffer: 0, lowest: { month: "2026-01", value: 0 } })
    expect(e.closingOutlook.every((v) => v === 0)).toBe(true)
  })
})

describe("cashBridge", () => {
  it("walks opening cash to cash today and lands on the closing actual balance", () => {
    const b = cashBridge(M)
    expect(b.map((s) => [s.name, s.value])).toEqual([
      ["Cash 1 Jan", 60000],
      ["Tenant receipts", 35000],
      ["Running costs & tax", -12000],
      ["Capex", -20000],
      ["Debt service", -9000],
      ["Cash today", 54000],
    ]) // no distributions → step dropped
    expect(b.at(-1)!.value).toBe(M.closingActual[2])
  })
})

describe("buildCashModel — opening balance inside the year", () => {
  it("counts an opening balance dated in the selected year as the cash it starts with", () => {
    const m = buildCashModel(
      [{ period: "2026-01-01", flow: "opening", net: 100000 }, { period: "2026-01-01", flow: "rent_receipts", net: 5000 }] as CashActualRow[],
      [], "2026", "2026-01",
    )
    // 100,000 opening + 5,000 January receipts = 105,000 at the end of January
    expect(m.opening).toBe(100000)
    expect(m.closingActual[0]).toBe(105000)
  })
})
