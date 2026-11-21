import { describe, expect, it } from "vitest"
import type { BudgetRow } from "./useBudget"
import type { ReportRow } from "./useReport"
import { buildPl, lineVariances, profitBridge, scopeLabel, scopeMonths, scopeOptions, type PlRow } from "./pl"

function row(period: string, code: string, name: string, type: string, debit: number, credit: number): ReportRow {
  return {
    entity_id: "e1", period: `${period}-01`, account_id: code, account_code: code, account_name: name,
    account_type: type, debit, credit, net: debit - credit, entry_count: 1,
  }
}
const bud = (period: string, code: string, amount: number): BudgetRow => ({ entity_id: "e1", period: `${period}-01`, account_code: code, amount })

const subtotal = (model: PlRow[], id: string) => {
  const r = model.find((x) => x.kind === "subtotal" && x.id === id)
  return r && r.kind === "subtotal" ? { actual: r.actual, budget: r.budget } : undefined
}

describe("period scopes", () => {
  it("resolves YTD, LTM (across a year end), a fiscal year and a single month", () => {
    expect([...scopeMonths("ytd", "2026-03")]).toEqual(["2026-01", "2026-02", "2026-03"])
    const ltm = scopeMonths("ltm", "2026-03")
    expect(ltm.size).toBe(12)
    expect(ltm.has("2025-04") && !ltm.has("2025-03")).toBe(true)
    expect([...scopeMonths("fy:2025", "2026-03")]).toEqual([...Array(12)].map((_, i) => `2025-${String(i + 1).padStart(2, "0")}`))
    expect([...scopeMonths("m:2026-02", "2026-03")]).toEqual(["2026-02"])
    expect(scopeMonths("bogus", "2026-03").size).toBe(0)
  })

  it("offers last year's FY only when the books cover its January", () => {
    expect(scopeOptions("2026-03", "2025-11").map((o) => o.value))
      .toEqual(["ytd", "ltm", "m:2026-03", "m:2026-02", "m:2026-01", "m:2025-12", "m:2025-11"])
    expect(scopeOptions("2026-03", "2025-01").find((o) => o.value === "fy:2025")?.label).toBe("FY 2025")
    expect(scopeLabel("m:2026-02", "2026-03")).toBe("Feb 2026")
  })
})

// Scope: February 2026. January rows only feed the monthly trend.
const ROWS: ReportRow[] = [
  row("2026-01", "4000", "Rental income", "revenue", 0, 10000),
  row("2026-02", "4000", "Rental income", "revenue", 0, 10000),
  row("2026-02", "4100", "Service charge", "revenue", 0, 2000),
  row("2026-01", "5000", "Utilities", "expense", 3000, 0),
  row("2026-02", "5000", "Utilities", "expense", 2500, 0),
  row("2026-02", "6000", "Depreciation", "expense", 1000, 0),
  row("2026-02", "7000", "Interest expense", "expense", 500, 0),
  row("2026-02", "1000", "Bank", "asset", 9000, 0), // balance sheet → not in the P&L
]
const BUDGETS: BudgetRow[] = [
  bud("2026-02", "4000", 11000),
  bud("2026-02", "4100", 1500),
  bud("2026-02", "5000", 2000),
  bud("2026-02", "5100", 800),   // budgeted, never posted → line with zero actual
  bud("2026-02", "7000", 600),
  bud("2026-02", "1000", 5000),  // not a P&L code → ignored
  bud("2026-01", "4000", 99999), // outside scope
]
const MODEL = buildPl(ROWS, BUDGETS, new Set(["2026-02"]), ["2026-01", "2026-02"])

describe("buildPl", () => {
  it("builds the subtotal cascade revenue → NOI → EBIT → PBT for actual and budget", () => {
    expect(subtotal(MODEL, "total-revenue")).toEqual({ actual: 12000, budget: 12500 })
    expect(subtotal(MODEL, "total-opex")).toEqual({ actual: 2500, budget: 2800 })
    expect(subtotal(MODEL, "noi")).toEqual({ actual: 9500, budget: 9700 })
    expect(subtotal(MODEL, "ebit")).toEqual({ actual: 8500, budget: 9700 })   // NOI − depreciation
    expect(subtotal(MODEL, "pbt")).toEqual({ actual: 8000, budget: 9100 })    // EBIT − interest
  })

  it("lists every account line once, with the monthly trend and budget-only lines", () => {
    const lines = MODEL.flatMap((r) => (r.kind === "line" ? [[r.code, r.actual, r.budget]] : []))
    expect(lines).toEqual([
      ["4000", 10000, 11000], ["4100", 2000, 1500],
      ["5000", 2500, 2000], ["5100", 0, 800],
      ["6000", 1000, 0], ["7000", 500, 600],
    ])
    const util = MODEL.find((r) => r.kind === "line" && r.code === "5000")
    expect(util && util.kind === "line" ? util.monthly : null).toEqual([3000, 2500])
  })

  it("yields zero totals and no EBIT line for empty input", () => {
    const empty = buildPl([], [], new Set(["2026-02"]), [])
    expect(subtotal(empty, "noi")).toEqual({ actual: 0, budget: 0 })
    expect(subtotal(empty, "pbt")).toEqual({ actual: 0, budget: 0 })
    expect(subtotal(empty, "ebit")).toBeUndefined()
  })
})

describe("profitBridge / lineVariances", () => {
  it("bridges revenue to PBT with steps that add up", () => {
    const b = profitBridge(MODEL)
    expect(b.map((s) => s.value)).toEqual([12000, -2500, 9500, -1000, -500, 8000])
    expect(b[0].value + b[1].value).toBe(b[2].value)
    expect(b[2].value + b[3].value + b[4].value).toBe(b[5].value)
  })

  it("signs variances so + beats plan: income above budget, costs below it", () => {
    expect(lineVariances(MODEL)).toEqual([
      { name: "Rental income", value: -1000 },  // 10 000 vs 11 000
      { name: "5100", value: 800 },             // nothing spent of 800
      { name: "Service charge", value: 500 },   // 2 000 vs 1 500
      { name: "Utilities", value: -500 },       // 2 500 vs 2 000
      { name: "Interest expense", value: 100 }, // 500 vs 600
    ]) // depreciation had no budget → excluded
  })
})
