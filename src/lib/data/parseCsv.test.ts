import { describe, expect, it } from "vitest"
import { parseCsvToRows, splitLine } from "./parseCsv"

// The default ruleset (migration 20260607000001_validation_rulesets.sql).
const ALIASES: Record<string, string[]> = {
  account_code: ["account", "acct", "account code", "kód účtu"],
  txn_date: ["date", "posting date", "dátum"],
  debit: ["dr", "debit"],
  credit: ["cr", "credit"],
  amount: ["amount", "value", "suma"],
  description: ["memo", "narrative", "popis"],
  currency: ["ccy", "currency", "mena"],
}
const FORMATS = ["YYYY-MM-DD", "DD.MM.YYYY", "MM/DD/YYYY"]

describe("splitLine", () => {
  it("honours quoted commas, escaped quotes and trailing empty cells", () => {
    expect(splitLine('5000,"Energy, October","say ""hi""", x ')).toEqual(["5000", "Energy, October", 'say "hi"', "x"])
    expect(splitLine("a,,")).toEqual(["a", "", ""])
  })
})

describe("parseCsvToRows — split debit/credit", () => {
  it("maps aliased headers case-insensitively and coerces values (CRLF, quoted thousands)", () => {
    const csv = 'Kód účtu,Dátum,Popis,DR,CR,Mena\r\n5000,02.10.2026,"Metro Energy, October","14,820.40",0, eur \r\n'
    const { rows, mappedFields } = parseCsvToRows(csv, ALIASES, FORMATS, "split")
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      row_num: 1, account_code: "5000", txn_date: "2026-10-02", description: "Metro Energy, October",
      debit: 14820.4, credit: 0, currency: "EUR",
    })
    expect(rows[0].raw["Popis"]).toBe("Metro Energy, October")
    expect(mappedFields.sort()).toEqual(["account_code", "credit", "currency", "debit", "description", "txn_date"])
  })

  it("leaves unparseable or empty amounts as null rather than 0", () => {
    // "(100)" (accounting negative) is not guessed at; "1 234.50" groups
    // thousands with a space, as European exports do → 1234.5.
    const csv = "account,date,debit,credit\n5000,2026-01-05,abc,\n5000,2026-01-05,(100),1 234.50\n5000,2026-01-05,-250.5,+3"
    const rows = parseCsvToRows(csv, ALIASES, FORMATS, "split").rows
    expect(rows.map((r) => [r.debit, r.credit])).toEqual([[null, null], [null, 1234.5], [-250.5, 3]])
  })

  it("reads a decimal comma instead of multiplying by 100", () => {
    // Quoted so the comma stays inside the field.
    const csv = 'account,date,debit,credit\n5000,2026-01-05,"1234,56",0\n5000,2026-01-05,"1.234,56",0\n5000,2026-01-05,"1,23",0\n5000,2026-01-05,"1,234",0\n5000,2026-01-05,"1.234.567",0\n5000,2026-01-05,"12,3,4",0'
    const rows = parseCsvToRows(csv, ALIASES, FORMATS, "split").rows
    // 1234,56 → 1234.56 · 1.234,56 → 1234.56 · 1,23 → 1.23 · 1,234 → thousands
    // · 1.234.567 → thousands · 12,3,4 → nonsense, null
    expect(rows.map((r) => r.debit)).toEqual([1234.56, 1234.56, 1.23, 1234, 1234567, null])
  })

  it("uses the first column when two headers map to the same field", () => {
    const { rows, mappedFields } = parseCsvToRows("account,acct,date\n5000,9999,2026-01-01", ALIASES, FORMATS, "split")
    expect(rows[0].account_code).toBe("5000")
    expect(mappedFields).toEqual(["account_code", "txn_date"])
  })
})

describe("parseCsvToRows — signed amount", () => {
  it("turns a positive amount into a debit and a negative one into a credit", () => {
    const csv = "account,date,suma\n5000,2026-09-05,14210.30\n2000,2026-09-05,-14210.30\n4000,2026-09-05,0\n4000,2026-09-05,n/a"
    const rows = parseCsvToRows(csv, ALIASES, FORMATS, "signed").rows
    expect(rows.map((r) => [r.debit, r.credit])).toEqual([[14210.3, 0], [0, 14210.3], [0, 0], [null, null]])
  })
})

describe("parseCsvToRows — dates and row hygiene", () => {
  it("accepts only real calendar dates in an allowed format", () => {
    const csv = "account,date\n1,31.12.2026\n2,01/13/2026\n3,2026-02-30\n4,13/01/2026\n5,2026/01/05"
    const rows = parseCsvToRows(csv, ALIASES, FORMATS, "split").rows
    expect(rows.map((r) => r.txn_date)).toEqual(["2026-12-31", "2026-01-13", null, null, null])
    // A format that is not enabled in the ruleset is not guessed.
    expect(parseCsvToRows("account,date\n1,31.12.2026", ALIASES, ["YYYY-MM-DD"], "split").rows[0].txn_date).toBeNull()
  })

  it("skips blank lines and all-empty rows; header-only or empty input yields no rows", () => {
    const rows = parseCsvToRows("account,date,debit\n\n5000,2026-01-01,10\n,,\n", ALIASES, FORMATS, "split").rows
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ account_code: "5000", debit: 10, credit: null, description: null, currency: null })
    expect(parseCsvToRows("account,date", ALIASES, FORMATS, "split").rows).toEqual([])
    expect(parseCsvToRows("", ALIASES, FORMATS, "split")).toEqual({ rows: [], mappedFields: [] })
  })
})
