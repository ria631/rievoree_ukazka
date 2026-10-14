import type { ReportRow } from "./useReport"
import type { JournalMonth } from "./useJournal"
import { mk } from "./period"

/**
 * The journal overview: every posting belongs to a source document, and the
 * book only holds together if every document — and so every month — has
 * debits equal to credits. Document types:
 */
export const DOC_TYPES = [
  { key: "SI", label: "Sales invoices", hint: "rent invoices to tenants" },
  { key: "PI", label: "Purchase invoices", hint: "supplier bills" },
  { key: "BS", label: "Bank statements", hint: "money in / out" },
  { key: "GJ", label: "General journal", hint: "depreciation, accruals" },
  { key: "OB", label: "Opening balances", hint: "carried forward" },
  { key: "UP", label: "Uploads", hint: "rows loaded from a CSV batch" },
] as const

export const docLabel = (t: string) => DOC_TYPES.find((d) => d.key === t)?.label ?? t

/** Documents posted per month, by type (stacked chart rows). */
export function volumeByMonth(summary: JournalMonth[], months: string[]): Record<string, number | string>[] {
  const idx = new Map(months.map((m, i) => [m, i]))
  const out = months.map((month) => ({ month } as Record<string, number | string>))
  for (const s of summary) {
    const i = idx.get(mk(s.period))
    if (i == null) continue
    out[i][s.doc_type] = ((out[i][s.doc_type] as number) ?? 0) + s.docs
  }
  return out
}

export interface TbRow { code: string; name: string; type: string; debit: number; credit: number }

/** Trial balance (turnovers) of the selected months: every account's debits and credits. */
export function trialBalance(rows: ReportRow[], months: Set<string>): { lines: TbRow[]; debit: number; credit: number } {
  const m = new Map<string, TbRow>()
  for (const r of rows) {
    if (!months.has(mk(r.period))) continue
    const t = m.get(r.account_code) ?? { code: r.account_code, name: r.account_name, type: r.account_type, debit: 0, credit: 0 }
    t.debit += r.debit
    t.credit += r.credit
    m.set(r.account_code, t)
  }
  const lines = [...m.values()].sort((a, b) => a.code.localeCompare(b.code))
  return { lines, debit: lines.reduce((s, l) => s + l.debit, 0), credit: lines.reduce((s, l) => s + l.credit, 0) }
}
