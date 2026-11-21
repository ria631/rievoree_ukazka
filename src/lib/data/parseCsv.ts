/**
 * Client-side CSV parser for ingest — mirrors the worker's parse.ts so the hosted
 * demo can stage rows without a standing worker. Maps the file's columns to the
 * canonical fields via the ruleset's header_aliases, coerces amounts/dates (null
 * when unparseable — the DB transform records that as a validation_error), and
 * returns rows shaped for process_uploaded_rows. CSV only; XLSX needs the worker.
 */

export interface StagingRow {
  row_num: number
  account_code: string | null
  txn_date: string | null
  description: string | null
  debit: number | null
  credit: number | null
  currency: string | null
  raw: Record<string, string>
}

export type AmountMode = "split" | "signed"

// Minimal CSV line splitter — handles double-quoted fields with embedded commas
// and escaped quotes (""). Good enough for the accounting exports this app takes.
// Exported so the column mapper can show real sample values per column.
export function splitLine(line: string): string[] {
  const out: string[] = []
  let cur = ""
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++ } else inQuotes = false
      } else cur += c
    } else if (c === '"') inQuotes = true
    else if (c === ",") { out.push(cur); cur = "" }
    else cur += c
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

/**
 * Read an amount the way accounting exports write it: "14,820.40" and
 * "14.820,40" are both 14820.4, "1234,56" is 1234.56 (decimal comma), spaces
 * group thousands. When both separators appear, the last one is the decimal
 * point; a lone separator followed by exactly three digits in groups is a
 * thousands separator ("1,234" → 1234). Anything else → null (the DB flags it).
 */
function parseAmount(value: string | undefined): number | null {
  if (value == null) return null
  let s = value.trim().replace(/[\s\u00a0\u202f]/g, "")
  if (s === "") return null
  const lastComma = s.lastIndexOf(","), lastDot = s.lastIndexOf(".")
  if (lastComma >= 0 && lastDot >= 0) {
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "")
  } else if (lastComma >= 0) {
    s = /^[+-]?\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, "") : s.replace(",", ".")
  } else if (/^[+-]?\d{1,3}(\.\d{3}){2,}$/.test(s)) {
    s = s.replace(/\./g, "")
  }
  if (!/^[+-]?\d+(\.\d+)?$/.test(s)) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

const DATE_PATTERNS: Record<string, { re: RegExp; y: number; m: number; d: number }> = {
  "YYYY-MM-DD": { re: /^(\d{4})-(\d{2})-(\d{2})$/, y: 1, m: 2, d: 3 },
  "DD.MM.YYYY": { re: /^(\d{2})\.(\d{2})\.(\d{4})$/, y: 3, m: 2, d: 1 },
  "MM/DD/YYYY": { re: /^(\d{2})\/(\d{2})\/(\d{4})$/, y: 3, m: 1, d: 2 },
}

function parseDate(value: string | undefined, formats: string[]): string | null {
  if (value == null) return null
  const v = value.trim()
  if (v === "") return null
  for (const fmt of formats) {
    const p = DATE_PATTERNS[fmt]
    if (!p) continue
    const m = v.match(p.re)
    if (!m) continue
    const year = Number(m[p.y]), month = Number(m[p.m]), day = Number(m[p.d])
    const dt = new Date(Date.UTC(year, month - 1, day))
    if (dt.getUTCFullYear() === year && dt.getUTCMonth() === month - 1 && dt.getUTCDate() === day) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    }
  }
  return null
}

/** field → column-index, from header_aliases (case-insensitive; first wins). */
function buildFieldMap(headers: string[], aliases: Record<string, string[]>): Map<number, string> {
  const aliasToField = new Map<string, string>()
  for (const [field, list] of Object.entries(aliases)) {
    aliasToField.set(field.toLowerCase().trim(), field)
    for (const a of list ?? []) aliasToField.set(a.toLowerCase().trim(), field)
  }
  const map = new Map<number, string>()
  const taken = new Set<string>()
  headers.forEach((h, i) => {
    const field = aliasToField.get((h ?? "").toLowerCase().trim())
    if (field && !taken.has(field)) { map.set(i, field); taken.add(field) }
  })
  return map
}

export function parseCsvToRows(
  text: string,
  aliases: Record<string, string[]>,
  dateFormats: string[],
  amountMode: AmountMode,
): { rows: StagingRow[]; mappedFields: string[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length)
  if (lines.length === 0) return { rows: [], mappedFields: [] }

  const headers = splitLine(lines[0])
  const fieldByCol = buildFieldMap(headers, aliases)

  const rows: StagingRow[] = []
  for (let r = 1; r < lines.length; r++) {
    const cells = splitLine(lines[r])
    if (cells.every((c) => c.trim() === "")) continue

    const raw: Record<string, string> = {}
    const field: Record<string, string> = {}
    headers.forEach((h, i) => {
      const val = cells[i] ?? ""
      raw[h || `col${i}`] = val
      const f = fieldByCol.get(i)
      if (f) field[f] = val
    })

    let debit: number | null = null
    let credit: number | null = null
    if (amountMode === "signed") {
      const amt = parseAmount(field["amount"])
      if (amt != null) { if (amt >= 0) { debit = amt; credit = 0 } else { debit = 0; credit = -amt } }
    } else {
      debit = parseAmount(field["debit"])
      credit = parseAmount(field["credit"])
    }

    rows.push({
      row_num: r,
      account_code: (field["account_code"] ?? "").trim() || null,
      txn_date: parseDate(field["txn_date"], dateFormats),
      description: (field["description"] ?? "").trim() || null,
      debit,
      credit,
      currency: field["currency"] ? field["currency"].trim().toUpperCase().slice(0, 3) || null : null,
      raw,
    })
  }

  return { rows, mappedFields: [...new Set(fieldByCol.values())] }
}
