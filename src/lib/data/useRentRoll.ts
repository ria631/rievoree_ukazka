import { useQuery } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/auth/useAuth"

/** The rent roll's three tables (migration 38): property → units → leases.
 *  Small (tens of rows per SPV), RLS-scoped like everything else. */
export interface Property {
  id: string
  entity_id: string
  name: string
  segment: "office" | "retail" | "residential" | "logistics"
  city: string
  address: string | null
  valuation: number
  valuation_date: string | null
}
export interface Unit {
  id: string
  entity_id: string
  property_id: string
  code: string
  floor: string | null
  use: string
  area_m2: number
  erv_m2: number
}
export interface Lease {
  id: string
  entity_id: string
  unit_id: string
  tenant: string
  start_date: string
  end_date: string
  rent_month: number
  service_charge_month: number
  parking_month: number
  indexation_pct: number
  deposit: number
}

export interface RentRollData { properties: Property[]; units: Unit[]; leases: Lease[] }

export function useRentRollData() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ["rent-roll", user?.id ?? "anon"],
    enabled: Boolean(user),
    queryFn: async (): Promise<RentRollData> => {
      const [p, u, l] = await Promise.all([
        supabase.from("properties").select("*").order("name"),
        supabase.from("units").select("*").order("code"),
        supabase.from("leases").select("*").order("start_date"),
      ])
      if (p.error) throw p.error
      if (u.error) throw u.error
      if (l.error) throw l.error
      const num = <T,>(rows: T[], keys: (keyof T)[]) =>
        rows.map((r) => { const o = { ...r }; keys.forEach((k) => { o[k] = Number(o[k]) as T[keyof T] }); return o })
      return {
        properties: num(p.data as Property[], ["valuation"]),
        units: num(u.data as Unit[], ["area_m2", "erv_m2"]),
        leases: num(l.data as Lease[], ["rent_month", "service_charge_month", "parking_month", "indexation_pct", "deposit"]),
      }
    },
  })
}
