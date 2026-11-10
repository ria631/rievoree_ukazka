import type { Lease, RentRollData } from "./useRentRoll"
import type { Invoice } from "./useInvoices"
import { daysBetween, monthEnd } from "./period"

/**
 * The rent roll — one row per unit as at the as-of date — and the metrics a
 * property investor reads off it:
 *
 *   occupancy   let area ÷ lettable area (GLA)
 *   passing rent the contracted rent being paid today, annualised
 *   ERV         estimated rental value — what the space would let for today
 *   reversion   ERV ÷ passing − 1: + means rents are below market (upside)
 *   WALT        weighted average lease term to expiry, weighted by rent —
 *               how long today's income is contractually secure
 *   arrears     overdue rent the tenant still owes
 */
export interface RollRow {
  unitId: string
  entityId: string
  property: string
  code: string
  use: string
  area: number
  ervM2: number
  ervMonth: number
  lease: Lease | null
  tenant: string | null
  rentMonth: number
  rentM2: number
  reversionPct: number | null
  start: string | null
  end: string | null
  yearsLeft: number
  expiring12: boolean
  arrears: number
  arrearsDays: number
}

export function buildRentRoll(data: RentRollData, openAr: Invoice[], asOf: string): RollRow[] {
  const propName = new Map(data.properties.map((p) => [p.id, p.name]))
  const current = new Map<string, Lease>()
  for (const l of data.leases) if (l.start_date <= asOf && l.end_date >= asOf) current.set(l.unit_id, l)

  // Overdue rent per lease (open AR invoices past due at the as-of date).
  const arrears = new Map<string, { amt: number; days: number }>()
  for (const i of openAr) {
    if (i.kind !== "ar" || !i.lease_id) continue
    const d = daysBetween(i.due_date, asOf)
    if (d <= 0) continue
    const cur = arrears.get(i.lease_id) ?? { amt: 0, days: 0 }
    arrears.set(i.lease_id, { amt: cur.amt + i.amount, days: Math.max(cur.days, d) })
  }

  return data.units.map((u) => {
    const l = current.get(u.id) ?? null
    const rentMonth = l?.rent_month ?? 0
    const ervMonth = u.erv_m2 * u.area_m2
    const yearsLeft = l ? Math.max(0, daysBetween(asOf, l.end_date) / 365.25) : 0
    const a = l ? arrears.get(l.id) : undefined
    return {
      unitId: u.id, entityId: u.entity_id, property: propName.get(u.property_id) ?? "—",
      code: u.code, use: u.use, area: u.area_m2, ervM2: u.erv_m2, ervMonth,
      lease: l, tenant: l?.tenant ?? null, rentMonth, rentM2: l ? rentMonth / u.area_m2 : 0,
      reversionPct: l && rentMonth > 0 ? (ervMonth / rentMonth - 1) * 100 : null,
      start: l?.start_date ?? null, end: l?.end_date ?? null, yearsLeft,
      expiring12: Boolean(l) && yearsLeft <= 1,
      arrears: a?.amt ?? 0, arrearsDays: a?.days ?? 0,
    }
  })
}

export interface RollKpis {
  gla: number; units: number; letArea: number; occupancyPct: number; vacantArea: number
  passingPa: number; ervPa: number; vacantErvPa: number; walt: number; reversionPct: number
  arrears: number; expiring12Pa: number
}

export function rollKpis(rows: RollRow[]): RollKpis {
  let gla = 0, letArea = 0, passing = 0, ervLet = 0, ervVacant = 0, waltNum = 0, arrears = 0, expiring = 0
  for (const r of rows) {
    gla += r.area
    if (r.lease) {
      letArea += r.area; passing += r.rentMonth; ervLet += r.ervMonth
      waltNum += r.rentMonth * r.yearsLeft; arrears += r.arrears
      if (r.expiring12) expiring += r.rentMonth
    } else ervVacant += r.ervMonth
  }
  return {
    gla, units: rows.length, letArea, occupancyPct: gla ? (letArea / gla) * 100 : 0, vacantArea: gla - letArea,
    passingPa: passing * 12, ervPa: (ervLet + ervVacant) * 12, vacantErvPa: ervVacant * 12,
    walt: passing ? waltNum / passing : 0, reversionPct: passing ? (ervLet / passing - 1) * 100 : 0,
    arrears, expiring12Pa: expiring * 12,
  }
}

/** Annual passing rent by time to expiry — when today's income runs out. */
export function expiryProfile(rows: RollRow[]): { name: string; value: number; share: number }[] {
  const edges = [
    { name: "< 1 yr", max: 1 }, { name: "1–2 yrs", max: 2 }, { name: "2–3 yrs", max: 3 },
    { name: "3–5 yrs", max: 5 }, { name: "5+ yrs", max: Infinity },
  ]
  const vals = edges.map(() => 0)
  for (const r of rows) {
    if (!r.lease) continue
    vals[edges.findIndex((e) => r.yearsLeft < e.max)] += r.rentMonth * 12
  }
  const total = vals.reduce((s, v) => s + v, 0) || 1
  return edges.map((e, i) => ({ name: e.name, value: vals[i], share: (vals[i] / total) * 100 }))
}

/** Share of passing rent by tenant — concentration risk (one tenant leaving). */
export function tenantConcentration(rows: RollRow[], n = 8): { name: string; value: number; share: number }[] {
  const m = new Map<string, number>()
  for (const r of rows) if (r.lease) m.set(r.tenant!, (m.get(r.tenant!) ?? 0) + r.rentMonth * 12)
  const total = [...m.values()].reduce((s, v) => s + v, 0) || 1
  const sorted = [...m.entries()].sort((a, b) => b[1] - a[1])
  const top = sorted.slice(0, n).map(([name, value]) => ({ name, value, share: (value / total) * 100 }))
  const rest = sorted.slice(n).reduce((s, [, v]) => s + v, 0)
  return rest > 0 ? [...top, { name: `Other ${sorted.length - n} tenants`, value: rest, share: (rest / total) * 100 }] : top
}

/** Occupancy (by area) at each month end — for the KPI sparkline. */
export function occupancySeries(data: RentRollData, months: string[], unitFilter: (entityId: string) => boolean): number[] {
  const units = data.units.filter((u) => unitFilter(u.entity_id))
  const gla = units.reduce((s, u) => s + u.area_m2, 0) || 1
  const area = new Map(units.map((u) => [u.id, u.area_m2]))
  return months.map((k) => {
    const d = monthEnd(k)
    let let_ = 0
    const seen = new Set<string>()
    for (const l of data.leases) {
      if (!area.has(l.unit_id) || seen.has(l.unit_id)) continue
      if (l.start_date <= d && l.end_date >= d) { let_ += area.get(l.unit_id)!; seen.add(l.unit_id) }
    }
    return (let_ / gla) * 100
  })
}
