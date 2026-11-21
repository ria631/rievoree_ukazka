import { describe, expect, it } from "vitest"
import type { Invoice, InvoiceMonth } from "./useInvoices"
import type { ReportRow } from "./useReport"
import { agingBy, arApKpis, bucketOf, byCounterparty, ledgerBalance, settlementSeries } from "./receivables"

const AS_OF = "2026-09-30"
const LAST = "2026-09"

function inv(id: string, counterparty: string, due: string, amount: number): Invoice {
  return {
    id, entity_id: "e1", kind: "ar", counterparty, doc_no: id, issued_date: "2026-01-01", due_date: due, amount,
    status: "open", paid_date: null, lease_id: null, category: null,
  }
}

// Days past due at 30 Sep 2026 in brackets.
const OPEN: Invoice[] = [
  inv("A1", "Alpha", "2026-10-10", 500),  // (−10) not due, due within 14 days
  inv("A2", "Alpha", "2026-09-15", 1000), // (15)
  inv("B1", "Beta", "2026-07-31", 2000),  // (61)
  inv("B2", "Beta", "2026-10-20", 300),   // (−20) not due, outside 14 days
  inv("C1", "Gamma", "2026-05-01", 400),  // (152)
  inv("C2", "Gamma", "2026-09-30", 100),  // (0) due today → not overdue
]

function month(period: string, invoices: number, invoiced: number, settled: number, onTime: number, avg: number | null): InvoiceMonth {
  return { entity_id: "e1", kind: "ar", period, invoices, invoiced, settled, settled_on_time: onTime, avg_days_to_pay: avg }
}

const MONTHLY: InvoiceMonth[] = [
  month("2026-05-01", 9, 99999, 99999, 99999, 99), // outside both windows
  month("2026-06-01", 2, 2800, 2800, 2100, 30),
  month("2026-07-01", 3, 3000, 3000, 2400, 20),
  month("2026-08-01", 3, 3000, 2700, 2700, 10),
  month("2026-09-01", 4, 3200, 1000, 1000, 5),
]

describe("bucketOf", () => {
  it("puts boundary days in the lower bucket", () => {
    expect([-5, 0, 1, 30, 31, 60, 61, 90, 91].map(bucketOf)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4])
  })
})

describe("agingBy / byCounterparty", () => {
  it("splits each counterparty's open balance into aging buckets, largest total first", () => {
    expect(agingBy(OPEN, (i) => i.counterparty, AS_OF)).toEqual([
      { name: "Beta", buckets: [300, 0, 0, 2000, 0], total: 2300 },
      { name: "Alpha", buckets: [500, 1000, 0, 0, 0], total: 1500 },
      { name: "Gamma", buckets: [100, 0, 0, 0, 400], total: 500 },
    ])
  })

  it("ranks counterparties by overdue amount and tracks the oldest overdue item", () => {
    const c = byCounterparty(OPEN, AS_OF)
    expect(c.map((x) => [x.name, x.overdue, x.oldest, x.count])).toEqual([
      ["Beta", 2000, 61, 2],
      ["Alpha", 1000, 15, 2],
      ["Gamma", 400, 152, 2],
    ])
  })
})

describe("arApKpis", () => {
  const k = arApKpis(OPEN, MONTHLY, AS_OF, LAST)

  it("totals open, overdue, over-60 and due-next-14-days balances", () => {
    expect(k).toMatchObject({ open: 4300, overdue: 3400, over60: 2400, dueNext14: 600 })
    expect(k.overduePct).toBeCloseTo((3400 / 4300) * 100, 10)
  })

  it("computes DSO on the last three months' invoicing (92-day window)", () => {
    // Jul–Sep invoiced 9 200 → 100/day; open 4 300 → 43 days
    expect(k.days).toBeCloseTo(43, 10)
  })

  it("scores on-time payment and average days to pay on the quarter before the last month", () => {
    // Jun–Aug: on time 7 200 of 8 800 billed; days weighted by invoice count (30·2 + 20·3 + 10·3) / 8
    expect(k.onTimePct).toBeCloseTo((7200 / 8800) * 100, 10)
    expect(k.avgDaysToPay).toBeCloseTo(18.75, 10)
  })

  it("returns zeros, not NaN/Infinity, with no open items and no invoicing", () => {
    expect(arApKpis([], [], AS_OF, LAST)).toEqual({
      open: 0, overdue: 0, overduePct: 0, over60: 0, dueNext14: 0, days: 0, onTimePct: 0, avgDaysToPay: null,
    })
  })
})

describe("settlementSeries", () => {
  it("splits each month's invoicing into on time / late / still open", () => {
    expect(settlementSeries(MONTHLY, LAST, 3)).toEqual([
      { month: "2026-07", onTime: 2400, late: 600, open: 0 },
      { month: "2026-08", onTime: 2700, late: 0, open: 300 },
      { month: "2026-09", onTime: 1000, late: 0, open: 2200 },
    ])
    // A month with no invoicing is a zero row, not a gap.
    expect(settlementSeries(MONTHLY, "2026-10", 1)).toEqual([{ month: "2026-10", onTime: 0, late: 0, open: 0 }])
  })
})

describe("ledgerBalance", () => {
  function r(code: string, name: string, type: string, debit: number, credit: number): ReportRow {
    return { entity_id: "e1", period: "2026-09-01", account_id: code, account_code: code, account_name: name, account_type: type, debit, credit, net: debit - credit, entry_count: 1 }
  }

  it("ties out the AR control account (debit-positive) and AP (credit-positive)", () => {
    const rows = [
      r("1100", "Trade receivables", "asset", 5000, 3000),
      r("1110", "Pohľadávky z obchodného styku", "asset", 1000, 0), // matched by name
      r("1000", "Bank", "asset", 9999, 0),
      r("2000", "Trade payables", "liability", 1000, 4000),
    ]
    expect(ledgerBalance(rows, "ar")).toBe(3000)
    expect(ledgerBalance(rows, "ap")).toBe(3000)
  })
})

describe("arApKpis — regressions", () => {
  it("ignores a month with nothing paid yet instead of counting it as zero days", () => {
    // Jun–Aug: June 10 invoices paid in 20 days on average; July 10 unpaid (null); Aug none
    const monthly = [month("2026-06-01", 10, 1000, 1000, 1000, 20), month("2026-07-01", 10, 1000, 0, 0, null)]
    expect(arApKpis([], monthly, AS_OF, LAST).avgDaysToPay).toBe(20) // not (20·10 + 0·10) / 20 = 10
  })

  it("uses the window's real length for DSO (Dec–Feb is 90 days)", () => {
    // Dec 2026–Feb 2027 invoiced 9 000 → 100/day over 90 days; 4 300 open → 43 days
    const monthly = [month("2026-12-01", 3, 3000, 0, 0, null), month("2027-01-01", 3, 3000, 0, 0, null), month("2027-02-01", 3, 3000, 0, 0, null)]
    expect(arApKpis(OPEN, monthly, "2027-02-28", "2027-02").days).toBeCloseTo(43, 10)
  })
})
