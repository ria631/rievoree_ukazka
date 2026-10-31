import { useQuery } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/auth/useAuth"
import { fetchAll } from "./fetchAll"

/** An invoice from the AR/AP sub-ledger (public.invoices), RLS-filtered.
 *  AR = rent invoices to tenants, AP = supplier invoices. */
export interface Invoice {
  id: string
  entity_id: string
  kind: "ar" | "ap"
  counterparty: string
  doc_no: string | null
  issued_date: string
  due_date: string
  amount: number
  status: "open" | "paid"
  paid_date: string | null
  lease_id: string | null
  category: string | null
}

/** Open items only — what is still owed, by tenants or to suppliers. */
export function useOpenItems() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ["invoices-open", user?.id ?? "anon"],
    enabled: Boolean(user),
    queryFn: () =>
      fetchAll<Invoice>((from, to) =>
        supabase
          .from("invoices")
          .select("id, entity_id, kind, counterparty, doc_no, issued_date, due_date, amount, status, paid_date, lease_id, category")
          .eq("status", "open")
          .order("due_date").order("id")
          .range(from, to),
      ).then((rows) => rows.map((r) => ({ ...r, amount: Number(r.amount) }))),
  })
}

/** Invoicing vs settlement per month (view report_invoice_monthly) — the
 *  collection track record without shipping every paid invoice to the browser. */
export interface InvoiceMonth {
  entity_id: string
  kind: "ar" | "ap"
  period: string
  invoices: number
  invoiced: number
  settled: number
  settled_on_time: number
  avg_days_to_pay: number | null
}

export function useInvoiceMonthly() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ["invoice-monthly", user?.id ?? "anon"],
    enabled: Boolean(user),
    queryFn: () =>
      fetchAll<InvoiceMonth>((from, to) =>
        supabase
          .from("report_invoice_monthly")
          .select("*")
          .order("period").order("entity_id").order("kind")
          .range(from, to),
      ).then((rows) => rows.map((r) => ({
        ...r, invoiced: Number(r.invoiced), settled: Number(r.settled), settled_on_time: Number(r.settled_on_time),
      }))),
  })
}
