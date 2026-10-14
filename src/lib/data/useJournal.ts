import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/auth/useAuth"
import { fetchAll } from "./fetchAll"

/** Posting volume per month × document type (view journal_month_summary). */
export interface JournalMonth {
  entity_id: string
  period: string
  doc_type: string
  docs: number
  lines: number
  debit: number
  credit: number
  unbalanced: number
}

export function useJournalSummary() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ["journal-summary", user?.id ?? "anon"],
    enabled: Boolean(user),
    queryFn: () =>
      fetchAll<JournalMonth>((from, to) =>
        supabase.from("journal_month_summary").select("*")
          .order("period").order("entity_id").order("doc_type").range(from, to),
      ).then((rows) => rows.map((r) => ({ ...r, debit: Number(r.debit), credit: Number(r.credit) }))),
  })
}

/** One document (view journal_documents): its lines summed, and whether they balance. */
export interface JournalDoc {
  entity_id: string
  doc_no: string
  doc_type: string
  txn_date: string
  period: string
  description: string | null
  lines: number
  debit: number
  credit: number
  balanced: boolean
  batch_id: string
}

export interface DocFilter { entityId: string; period: string; type: string; search: string }
export const PAGE_SIZE = 25

/**
 * Server-side paging: the database filters, sorts and slices; the browser only
 * ever holds one page (25 documents) plus the exact total for the pager.
 */
export function useJournalDocuments(f: DocFilter, page: number) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ["journal-docs", user?.id ?? "anon", f, page],
    enabled: Boolean(user),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let q = supabase.from("journal_documents").select("*", { count: "exact" })
      if (f.entityId !== "all") q = q.eq("entity_id", f.entityId)
      if (f.period !== "all") q = q.eq("period", f.period)
      if (f.type !== "all") q = q.eq("doc_type", f.type)
      const s = f.search.trim().replace(/[%,()]/g, " ")
      if (s) q = q.or(`doc_no.ilike.%${s}%,description.ilike.%${s}%`)
      const from = page * PAGE_SIZE
      const { data, error, count } = await q
        .order("txn_date", { ascending: false })
        .order("doc_no", { ascending: false })
        .range(from, from + PAGE_SIZE - 1)
      if (error) throw error
      return {
        docs: (data ?? []).map((d) => ({ ...d, debit: Number(d.debit), credit: Number(d.credit) })) as JournalDoc[],
        total: count ?? 0,
      }
    },
  })
}

/** The lines of one document, with their account — fetched when a row opens. */
export interface JournalLine {
  id: number
  txn_date: string
  description: string | null
  debit: number
  credit: number
  flow: string | null
  accounts: { code: string; name: string } | null
}

export function useDocumentLines(doc: JournalDoc | null) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ["journal-lines", user?.id ?? "anon", doc?.entity_id, doc?.doc_no],
    enabled: Boolean(user && doc),
    queryFn: async (): Promise<JournalLine[]> => {
      let q = supabase.from("journal_entries")
        .select("id, txn_date, description, debit, credit, flow, accounts(code, name)")
        .eq("entity_id", doc!.entity_id)
      // Upload batches carry no document number — their lines are the batch.
      q = doc!.doc_type === "UP" ? q.eq("batch_id", doc!.batch_id).is("doc_no", null) : q.eq("doc_no", doc!.doc_no)
      const { data, error } = await q.order("id").limit(200)
      if (error) throw error
      return (data ?? []).map((l) => ({ ...l, debit: Number(l.debit), credit: Number(l.credit) })) as unknown as JournalLine[]
    },
  })
}
