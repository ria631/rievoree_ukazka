import { useQuery } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/auth/useAuth"
import { fetchAll } from "./fetchAll"

/** Actual cash movements per month and flow category — view
 *  report_cash_monthly, i.e. the bank (1000) journal lines grouped by their
 *  `flow` tag. `net` is + for money in, − for money out. */
export interface CashActualRow { entity_id: string; period: string; flow: string; inflow: number; outflow: number; net: number }

/** The plan side: public.cash_budget, signed the same way. */
export interface CashPlanRow { entity_id: string; period: string; flow: string; amount: number }

export function useCashActual() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ["cash-actual", user?.id ?? "anon"],
    enabled: Boolean(user),
    queryFn: () =>
      fetchAll<CashActualRow>((from, to) =>
        supabase.from("report_cash_monthly").select("*")
          .order("period").order("entity_id").order("flow").range(from, to),
      ).then((rows) => rows.map((r) => ({ ...r, inflow: Number(r.inflow), outflow: Number(r.outflow), net: Number(r.net) }))),
  })
}

export function useCashBudget() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ["cash-budget", user?.id ?? "anon"],
    enabled: Boolean(user),
    queryFn: () =>
      fetchAll<CashPlanRow>((from, to) =>
        supabase.from("cash_budget").select("entity_id, period, flow, amount")
          .order("period").order("entity_id").order("flow").range(from, to),
      ).then((rows) => rows.map((r) => ({ ...r, amount: Number(r.amount) }))),
  })
}
