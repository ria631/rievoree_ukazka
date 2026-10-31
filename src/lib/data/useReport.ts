import { useQuery } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/auth/useAuth"
import { fetchAll } from "./fetchAll"

/**
 * A row of public.report_account_monthly — the tenant-filtered view over the
 * private MV (migrations 11/12): one row per entity × month × account with the
 * month's debits, credits and net. RLS returns only the caller's entities, so
 * the SAME query yields different rows per role (viewer 1 SPV, manager 2,
 * admin 4) — the panel's RLS demo, on real pages.
 */
export interface ReportRow {
  entity_id: string
  period: string
  account_id: string
  account_code: string
  account_name: string
  account_type: string
  debit: number
  credit: number
  net: number
  entry_count: number
}

/**
 * Every report row the signed-in identity may see, read in 1000-row pages. The
 * query key includes the user id so switching identity (login or the RLS demo)
 * re-fetches instead of serving another role's cached rows.
 */
export function useReport() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ["report_account_monthly", user?.id ?? "anon"],
    enabled: Boolean(user),
    queryFn: () =>
      fetchAll<ReportRow>((from, to) =>
        supabase
          .from("report_account_monthly")
          .select("*")
          .order("period", { ascending: true })
          .order("entity_id", { ascending: true })
          .order("account_code", { ascending: true })
          .range(from, to),
      ).then((rows) => rows.map((r) => ({ ...r, debit: Number(r.debit), credit: Number(r.credit), net: Number(r.net) }))),
  })
}
