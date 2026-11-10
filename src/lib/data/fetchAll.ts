import type { PostgrestError } from "@supabase/supabase-js"

/**
 * PostgREST caps one response at `max_rows` (1000 on Supabase). The reporting
 * tables are bigger than that — 4 SPVs × 24 months × 21 accounts is already
 * ~2k rows — so a single select would silently truncate and every total would
 * be wrong. Read in ranges until a short page comes back. The caller's query
 * MUST have a deterministic order, or rows can repeat/skip between pages.
 */
export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown; error: PostgrestError | null }>,
  size = 1000,
): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += size) {
    const { data, error } = await page(from, from + size - 1)
    if (error) throw error
    const rows = (data ?? []) as T[]
    out.push(...rows)
    if (rows.length < size) return out
  }
}
