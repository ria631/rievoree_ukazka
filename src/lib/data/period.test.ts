import { describe, expect, it } from "vitest"
import { addMonths, daysBetween, lastClosed, monthDiff, monthEnd, monthRange } from "./period"

describe("addMonths", () => {
  it("moves forward and backward across year boundaries", () => {
    expect(addMonths("2026-11", 1)).toBe("2026-12")
    expect(addMonths("2026-12", 1)).toBe("2027-01")
    expect(addMonths("2026-01", -1)).toBe("2025-12")
    expect(addMonths("2026-03", -14)).toBe("2025-01")
    expect(addMonths("2026-05", 0)).toBe("2026-05")
    expect(addMonths("2026-01", 24)).toBe("2028-01")
  })
})

describe("monthDiff / monthRange", () => {
  it("counts whole months b − a, signed", () => {
    expect(monthDiff("2025-11", "2026-02")).toBe(3)
    expect(monthDiff("2026-02", "2025-11")).toBe(-3)
    expect(monthDiff("2026-02", "2026-02")).toBe(0)
  })

  it("lists months inclusive of both ends, across a year end; empty when reversed", () => {
    expect(monthRange("2025-11", "2026-02")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"])
    expect(monthRange("2026-04", "2026-04")).toEqual(["2026-04"])
    // An LTM window is exactly 12 months.
    expect(monthRange(addMonths("2026-09", -11), "2026-09")).toHaveLength(12)
    expect(monthRange("2026-03", "2026-02")).toEqual([])
  })
})

describe("lastClosed", () => {
  it("returns null for no postings", () => {
    expect(lastClosed([])).toBeNull()
  })

  it("picks the latest month regardless of row order or full-date periods", () => {
    const rows = [{ period: "2026-03-01" }, { period: "2026-10-01" }, { period: "2026-09-01" }]
    expect(lastClosed(rows)).toBe("2026-10")
  })
})

describe("monthEnd / daysBetween", () => {
  it("knows month lengths, including leap-year February", () => {
    expect(monthEnd("2024-02")).toBe("2024-02-29")
    expect(monthEnd("2026-02")).toBe("2026-02-28")
    expect(monthEnd("2026-04")).toBe("2026-04-30")
    expect(monthEnd("2026-12")).toBe("2026-12-31")
  })

  it("counts calendar days, signed, across a leap day", () => {
    expect(daysBetween("2026-09-30", "2026-10-30")).toBe(30)
    expect(daysBetween("2026-10-30", "2026-09-30")).toBe(-30)
    expect(daysBetween("2024-02-28", "2024-03-01")).toBe(2)
  })
})
