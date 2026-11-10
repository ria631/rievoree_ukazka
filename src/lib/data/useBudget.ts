import { useQuery } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/auth/useAuth"
import { fetchAll } from "./fetchAll"

/** One P&L budget line (public.budgets): entity × month × account code. The
 *  plan is prepared before each year and runs 12 months past the last close. */
export interface BudgetRow {
  entity_id: string
  period: string
  account_code: string
  amount: number
}

export function useBudget() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ["budgets", user?.id ?? "anon"],
    enabled: Boolean(user),
    queryFn: () =>
      fetchAll<BudgetRow>((from, to) =>
        supabase
          .from("budgets")
          .select("entity_id, period, account_code, amount")
          .order("period").order("entity_id").order("account_code")
          .range(from, to),
      ).then((rows) => rows.map((r) => ({ ...r, amount: Number(r.amount) }))),
  })
}
