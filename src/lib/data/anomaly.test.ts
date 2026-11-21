import { describe, expect, it } from "vitest"
import { explainAnomaly } from "./anomaly"

describe("explainAnomaly", () => {
  it("turns the z-score reason into money and a multiple", () => {
    // 63598.08 / 16214.68 = 3.92 → "about 3.9×"
    const r = explainAnomaly("month net 63598.08 is 15.3σ vs 12-mo mean 16214.68 ± 3103.79")
    expect(r.plain).toBe("€63,598 this month — about 3.9× the usual €16,215")
    expect(r.stats).toBe("15.3σ from the 12-month average (€16,215 ± €3,104)")
  })

  it("says when a month is far below its usual level", () => {
    // 4000 / 16000 = 25%
    const r = explainAnomaly("month net 4000 is -3.9σ vs 12-mo mean 16000 ± 3100")
    expect(r.plain).toBe("€4,000 this month — only 25% of the usual €16,000")
  })

  it("does not invent a multiple when the sign flips", () => {
    expect(explainAnomaly("month net -500 is -4.2σ vs 6-mo mean 1200 ± 400").plain)
      .toBe("-€500 this month against a usual €1,200")
  })

  it("passes unknown text through and has a fallback", () => {
    expect(explainAnomaly("something else").plain).toBe("something else")
    expect(explainAnomaly(null)).toEqual({ plain: "Unusual against its own history", stats: null })
  })
})
