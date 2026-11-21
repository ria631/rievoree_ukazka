import { describe, expect, it } from "vitest"
import type { ReportRow } from "./useReport"
import { classify, kpiOf, lastN, monthlySeries, noiByEntity, opexByAccount } from "./aggregate"

function row(period: string, code: string, name: string, type: string, debit: number, credit: number, entity = "e1"): ReportRow {
  return {
    entity_id: entity, period: `${period}-01`, account_id: `acc-${code}`, account_code: code, account_name: name,
    account_type: type, debit, credit, net: debit - credit, entry_count: 1,
  }
}

// Two closed months, deliberately listed Feb before Jan.
const FEB: ReportRow[] = [
  row("2026-02", "4000", "Rental income", "revenue", 1000, 10000), // credit note of 1 000 → 9 000
  row("2026-02", "5000", "Utilities", "expense", 2500, 500),       // refund of 500 → 2 000
  row("2026-02", "5100", "Repairs", "expense", 1500, 0),
  row("2026-02", "7000", "Interest expense", "expense", 480, 0),
  row("2026-02", "1000", "Bank", "asset", 9000, 6000),
  row("2026-02", "2500", "Bank loan", "liability", 2000, 0),       // repayment
]
const JAN: ReportRow[] = [
  row("2026-01", "4000", "Rental income", "revenue", 0, 10000),
  row("2026-01", "4100", "Service charge", "revenue", 0, 2000),
  row("2026-01", "5000", "Utilities", "expense", 3000, 0),
  row("2026-01", "6000", "Depreciation", "expense", 1000, 0),
  row("2026-01", "7000", "Interest expense", "expense", 500, 0),
  row("2026-01", "1000", "Bank", "asset", 11000, 3500),
  row("2026-01", "1100", "Trade receivables", "asset", 12000, 11000),
  row("2026-01", "2000", "Trade payables", "liability", 0, 3000),
  row("2026-01", "2500", "Bank loan", "liability", 0, 100000),     // drawdown
  row("2026-01", "3000", "Share capital", "equity", 0, 50000),     // no P&L, no anchor
]
const ROWS = [...FEB, ...JAN]

describe("classify", () => {
  it("routes expense accounts by demo code first, then by (Slovak or English) name", () => {
    expect(classify({ account_code: "4999", account_name: "Anything", account_type: "revenue" })).toBe("revenue")
    expect(classify({ account_code: "6000", account_name: "Depreciation", account_type: "expense" })).toBe("depreciation")
    expect(classify({ account_code: "6100", account_name: "Odpisy budov", account_type: "expense" })).toBe("depreciation")
    expect(classify({ account_code: "7100", account_name: "Úroky z úveru", account_type: "expense" })).toBe("interest")
    expect(classify({ account_code: "5000", account_name: "Utilities", account_type: "expense" })).toBe("opex")
    expect(classify({ account_code: "1000", account_name: "Bank", account_type: "asset" })).toBeNull()
  })
})

describe("monthlySeries", () => {
  const s = monthlySeries(ROWS)

  it("returns one point per month, sorted", () => {
    expect(s.map((p) => p.month)).toEqual(["2026-01", "2026-02"])
  })

  it("computes revenue, opex, NOI and PBT on their natural sides (credit notes and refunds net off)", () => {
    // Jan: rev 10 000 + 2 000; opex 3 000; NOI 9 000; PBT 9 000 − dep 1 000 − int 500
    expect(s[0]).toMatchObject({ revenue: 12000, opex: 3000, noi: 9000, depreciation: 1000, interest: 500, pbt: 7500 })
    // Feb: rev 10 000 − 1 000; opex (2 500 − 500) + 1 500; NOI 5 500; PBT 5 500 − 480
    expect(s[1]).toMatchObject({ revenue: 9000, opex: 3500, noi: 5500, depreciation: 0, interest: 480, pbt: 5020 })
  })

  it("carries balance-sheet anchors as running closing balances", () => {
    // bank: 7 500, then + 3 000; AR unchanged in Feb; AP is credit-positive; loan 100 000 − 2 000
    expect(s[0]).toMatchObject({ bank: 7500, receivables: 1000, payables: 3000, loan: 100000, principal: 0 })
    expect(s[1]).toMatchObject({ bank: 10500, receivables: 1000, payables: 3000, loan: 98000, principal: 2000 })
  })

  it("is empty for no rows", () => {
    expect(monthlySeries([])).toEqual([])
  })
})

describe("lastN — LTM totals behind NOI margin and DSCR", () => {
  const s = monthlySeries(ROWS)

  it("sums the trailing window and copes with fewer months than n", () => {
    expect(lastN(s, (p) => p.noi)).toBe(14500)
    expect(lastN(s, (p) => p.noi, 1)).toBe(5500)
    expect(lastN([], (p) => p.noi)).toBe(0)
  })

  it("feeds NOI margin and debt service (interest + principal)", () => {
    const margin = lastN(s, (p) => p.noi) / lastN(s, (p) => p.revenue)
    expect(margin).toBeCloseTo(14500 / 21000, 10)
    // 500 + 0 (Jan) + 480 + 2 000 (Feb)
    expect(lastN(s, (p) => p.interest + p.principal)).toBe(2980)
  })
})

describe("kpiOf", () => {
  it("gives the latest value, MoM change in % and the sparkline", () => {
    const k = kpiOf(monthlySeries(ROWS), (p) => p.noi)
    expect(k.value).toBe(5500)
    expect(k.delta).toBeCloseTo(((5500 - 9000) / 9000) * 100, 10) // −38.9 %
    expect(k.spark).toEqual([9000, 5500])
  })

  it("has no delta for an empty series, a single month, or a zero previous month", () => {
    expect(kpiOf([], (p) => p.noi)).toEqual({ value: 0, delta: null, spark: [] })
    expect(kpiOf(monthlySeries(JAN), (p) => p.noi).delta).toBeNull()
    // principal 0 (Jan) → 2 000 (Feb): no division by zero
    expect(kpiOf(monthlySeries(ROWS), (p) => p.principal)).toMatchObject({ value: 2000, delta: null })
  })

  it("reads a swing from loss to profit as a positive change", () => {
    const rows = [
      row("2026-01", "4000", "Rental income", "revenue", 0, 1000),
      row("2026-01", "5000", "Utilities", "expense", 2000, 0),
      row("2026-02", "4000", "Rental income", "revenue", 0, 1500),
      row("2026-02", "5000", "Utilities", "expense", 1000, 0),
    ]
    // NOI −1 000 → +500: (500 − (−1 000)) / |−1 000| = +150 %
    expect(kpiOf(monthlySeries(rows), (p) => p.noi).delta).toBe(150)
  })
})

describe("opexByAccount", () => {
  it("sums opex per account for the chosen months, largest first, excluding depreciation and interest", () => {
    expect(opexByAccount(ROWS, new Set(["2026-01", "2026-02"]))).toEqual([
      { name: "Utilities", value: 5000 },
      { name: "Repairs", value: 1500 },
    ])
    expect(opexByAccount(ROWS, new Set(["2026-02"]))).toEqual([
      { name: "Utilities", value: 2000 },
      { name: "Repairs", value: 1500 },
    ])
  })

  it("drops accounts that net to zero or a credit", () => {
    const rows = [
      row("2026-01", "5200", "Insurance", "expense", 0, 300),
      row("2026-01", "5300", "Cleaning", "expense", 400, 400),
      row("2026-01", "5000", "Utilities", "expense", 100, 0),
    ]
    expect(opexByAccount(rows, new Set(["2026-01"]))).toEqual([{ name: "Utilities", value: 100 }])
  })
})

describe("noiByEntity", () => {
  it("nets revenue − opex per building, ignores dep/interest, falls back to a short id", () => {
    const rows = [
      row("2026-01", "4000", "Rental income", "revenue", 0, 10000, "e1"),
      row("2026-01", "5000", "Utilities", "expense", 4000, 0, "e1"),
      row("2026-01", "4000", "Rental income", "revenue", 0, 3000, "abcdef123456"),
      row("2026-01", "5000", "Utilities", "expense", 5000, 0, "abcdef123456"),
      row("2026-01", "6000", "Depreciation", "expense", 9999, 0, "abcdef123456"),
      row("2025-12", "4000", "Rental income", "revenue", 0, 7777, "e1"), // outside the window
    ]
    expect(noiByEntity(rows, new Map([["e1", "Tower A"]]), new Set(["2026-01"]))).toEqual([
      { name: "Tower A", value: 6000 },
      { name: "abcdef12", value: -2000 },
    ])
  })
})
