/**
 * Month arithmetic on "YYYY-MM" keys — every report in the app is monthly, and
 * the books always end at the LAST CLOSED MONTH (the as-of date is its last
 * day). Pure string math: no Date timezone surprises.
 */
export const mk = (period: string) => period.slice(0, 7)

export function addMonths(key: string, n: number): string {
  const [y, m] = key.split("-").map(Number)
  const t = y * 12 + (m - 1) + n
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`
}

/** Whole months from a to b (b − a). */
export function monthDiff(a: string, b: string): number {
  const [ya, ma] = a.split("-").map(Number)
  const [yb, mb] = b.split("-").map(Number)
  return (yb - ya) * 12 + (mb - ma)
}

/** Months a..b inclusive. */
export function monthRange(a: string, b: string): string[] {
  const out: string[] = []
  for (let k = a; monthDiff(k, b) >= 0; k = addMonths(k, 1)) out.push(k)
  return out
}

/** The last month that has postings = the last closed month. */
export function lastClosed(rows: { period: string }[]): string | null {
  let last: string | null = null
  for (const r of rows) { const k = mk(r.period); if (!last || k > last) last = k }
  return last
}

/** Last calendar day of a month key, as YYYY-MM-DD. */
export function monthEnd(key: string): string {
  const [y, m] = key.split("-").map(Number)
  return `${key}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`
}

/** Days from date a to date b (YYYY-MM-DD). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
/** "2026-09" → "Sep 26" (chart axes). */
export const mLabel = (key: string) => `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(2, 4)}`
/** "2026-09" → "Sep 2026" (selects, headings). */
export const mLong = (key: string) => `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`
/** "2026-09-30" → "30 Sep 2026". */
export const dLong = (d: string) => `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`
