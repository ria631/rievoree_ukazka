import { describe, expect, it } from "vitest"
import type { Invoice } from "./useInvoices"
import type { Lease, RentRollData, Unit } from "./useRentRoll"
import { buildRentRoll, expiryProfile, occupancySeries, rollKpis, tenantConcentration } from "./rentroll"

const AS_OF = "2026-09-30"

function unit(id: string, area: number, ervM2: number, entity = "e1"): Unit {
  return { id, entity_id: entity, property_id: "p1", code: id.toUpperCase(), floor: null, use: "office", area_m2: area, erv_m2: ervM2 }
}

function lease(id: string, unitId: string, tenant: string, start: string, end: string, rent: number): Lease {
  return {
    id, entity_id: "e1", unit_id: unitId, tenant, start_date: start, end_date: end, rent_month: rent,
    service_charge_month: 0, parking_month: 0, indexation_pct: 0, deposit: 0,
  }
}

function arInvoice(id: string, leaseId: string | null, due: string, amount: number, kind: "ar" | "ap" = "ar"): Invoice {
  return {
    id, entity_id: "e1", kind, counterparty: "x", doc_no: null, issued_date: "2026-01-01", due_date: due, amount,
    status: "open", paid_date: null, lease_id: leaseId, category: null,
  }
}

// GLA 500 m²:
//   u1 200 m² let to Alpha at 2 000/month to 2030-09-30 (exactly 1 461 days = 4.00 years), ERV 12/m² → 2 400
//   u2 100 m² let to Beta at 1 000/month to 2027-03-31 (182 days), ERV 9/m² → 900 (over-rented)
//   u3 100 m² vacant: Gamma's lease ended mid-month on 2026-09-15, ERV 10/m² → 1 000
//   u4 100 m² vacant: Delta's lease is signed but only starts 2026-10-01, ERV 10/m² → 1 000
const DATA: RentRollData = {
  properties: [{ id: "p1", entity_id: "e1", name: "Office One", segment: "office", city: "Bratislava", address: null, valuation: 0, valuation_date: null }],
  units: [unit("u1", 200, 12), unit("u2", 100, 9), unit("u3", 100, 10), unit("u4", 100, 10)],
  leases: [
    lease("L1", "u1", "Alpha", "2024-01-01", "2030-09-30", 2000),
    lease("L2", "u2", "Beta", "2025-04-01", "2027-03-31", 1000),
    lease("L3", "u3", "Gamma", "2023-01-01", "2026-09-15", 800),
    lease("L4", "u4", "Delta", "2026-10-01", "2031-09-30", 1100),
  ],
}

const OPEN_AR: Invoice[] = [
  arInvoice("i1", "L2", "2026-08-31", 1000),      // 30 days overdue
  arInvoice("i2", "L2", "2026-07-31", 1000),      // 61 days overdue
  arInvoice("i3", "L2", "2026-09-30", 1000),      // due today → not arrears
  arInvoice("i4", "L1", "2026-06-30", 500, "ap"), // payable → ignored
  arInvoice("i5", null, "2026-06-30", 700),       // not tied to a lease → ignored
]

const ROLL = buildRentRoll(DATA, OPEN_AR, AS_OF)
const byId = (id: string) => ROLL.find((r) => r.unitId === id)!

describe("buildRentRoll", () => {
  it("treats a lease that ended mid-period and a not-yet-started lease as vacant", () => {
    expect(ROLL.map((r) => r.tenant)).toEqual(["Alpha", "Beta", null, null])
    expect(byId("u3")).toMatchObject({ lease: null, rentMonth: 0, rentM2: 0, reversionPct: null, yearsLeft: 0, expiring12: false })
  })

  it("derives rent/m², reversion and term left per unit", () => {
    expect(byId("u1")).toMatchObject({ rentM2: 10, ervMonth: 2400, yearsLeft: 4, expiring12: false, property: "Office One" })
    expect(byId("u1").reversionPct).toBeCloseTo(20, 10)  // 2 400 / 2 000 − 1
    expect(byId("u2").reversionPct).toBeCloseTo(-10, 10) // 900 / 1 000 − 1 (over-rented)
    expect(byId("u2").yearsLeft).toBeCloseTo(182 / 365.25, 10)
    expect(byId("u2").expiring12).toBe(true)
  })

  it("collects overdue AR on the current lease only (past due, receivable, lease-linked)", () => {
    expect(byId("u2")).toMatchObject({ arrears: 2000, arrearsDays: 61 })
    expect(byId("u1")).toMatchObject({ arrears: 0, arrearsDays: 0 })
  })
})

describe("rollKpis", () => {
  const k = rollKpis(ROLL)

  it("measures occupancy by area, not by unit count", () => {
    // let 200 + 100 of 500 m² = 60 % (by count it would be 2 of 4 = 50 %)
    expect(k).toMatchObject({ gla: 500, units: 4, letArea: 300, vacantArea: 200 })
    expect(k.occupancyPct).toBeCloseTo(60, 10)
  })

  it("annualises passing rent and ERV, and splits out vacant ERV", () => {
    expect(k.passingPa).toBe(36000)                 // (2 000 + 1 000) × 12
    expect(k.ervPa).toBe(63600)                     // (2 400 + 900 + 1 000 + 1 000) × 12
    expect(k.vacantErvPa).toBe(24000)               // (1 000 + 1 000) × 12
    expect(k.reversionPct).toBeCloseTo(10, 10)      // let ERV 3 300 / passing 3 000 − 1
    expect(k.expiring12Pa).toBe(12000)              // Beta only
    expect(k.arrears).toBe(2000)
  })

  it("weights WALT by rent, not by area or unit count", () => {
    const expected = (2000 * 4 + 1000 * (182 / 365.25)) / 3000 // ≈ 2.83 years
    expect(k.walt).toBeCloseTo(expected, 10)
  })

  it("returns zeros (not NaN) for an empty roll", () => {
    expect(rollKpis([])).toMatchObject({ gla: 0, occupancyPct: 0, walt: 0, reversionPct: 0, passingPa: 0 })
  })
})

describe("expiryProfile / tenantConcentration", () => {
  it("buckets annual passing rent by years to expiry; vacant units add nothing", () => {
    const p = expiryProfile(ROLL)
    expect(p.map((b) => b.value)).toEqual([12000, 0, 0, 24000, 0]) // Beta < 1 yr, Alpha 3–5 yrs
    expect(p[0].share).toBeCloseTo(100 / 3, 10)
    expect(expiryProfile([]).every((b) => b.value === 0 && b.share === 0)).toBe(true)
  })

  it("rolls tenants beyond the top n into one 'Other' slice", () => {
    const c = tenantConcentration(ROLL, 1)
    expect(c).toHaveLength(2)
    expect(c[0]).toMatchObject({ name: "Alpha", value: 24000 })
    expect(c[1].value).toBe(12000)
    expect(c[0].share + c[1].share).toBeCloseTo(100, 10)
  })
})

describe("occupancySeries", () => {
  it("measures each month at month end", () => {
    // Aug 31: u1, u2, u3 let = 400/500; Sep 30: Gamma gone = 300/500; Oct 31: Delta in = 400/500
    const s = occupancySeries(DATA, ["2026-08", "2026-09", "2026-10"], () => true)
    expect(s.map((v) => Math.round(v * 1e9) / 1e9)).toEqual([80, 60, 80])
  })

  it("never double-counts a unit with overlapping leases, and respects the entity filter", () => {
    const overlap = { ...DATA, leases: [...DATA.leases, lease("L1b", "u1", "Alpha", "2026-01-01", "2031-12-31", 2100)] }
    expect(occupancySeries(overlap, ["2026-09"], () => true)[0]).toBeCloseTo(60, 10)
    const split = { ...DATA, units: [...DATA.units, unit("u9", 500, 10, "e2")] }
    expect(occupancySeries(split, ["2026-09"], (e) => e === "e1")[0]).toBeCloseTo(60, 10)
  })
})
