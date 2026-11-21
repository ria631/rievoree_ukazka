/**
 * The z-score screen writes its reason for the reviewer in statistician's
 * terms (supabase/migrations/20260607000002_etl_transform.sql):
 *   "month net 63598.08 is 15.3σ vs 12-mo mean 16214.68 ± 3103.79"
 * A controller reads money and multiples, so this turns it into
 *   "€63,598 this month — about 3.9× the usual €16,215"
 * and keeps the statistics as the second line. Unknown text passes through.
 */
const RE = /^month net (-?[\d.]+) is (-?[\d.]+)σ vs (\d+)-mo mean (-?[\d.]+) ± ([\d.]+)$/

const eur = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })

export function explainAnomaly(reason: string | null | undefined): { plain: string; stats: string | null } {
  if (!reason) return { plain: "Unusual against its own history", stats: null }
  const m = RE.exec(reason.trim())
  if (!m) return { plain: reason, stats: null }
  const [, net, z, months, mean, sd] = m
  const n = Number(net), mu = Number(mean)
  let plain: string
  if (mu !== 0 && Math.sign(n) === Math.sign(mu)) {
    const ratio = n / mu
    plain = ratio >= 1
      ? `${eur.format(n)} this month — about ${ratio.toFixed(1)}× the usual ${eur.format(mu)}`
      : `${eur.format(n)} this month — only ${Math.round(ratio * 100)}% of the usual ${eur.format(mu)}`
  } else {
    plain = `${eur.format(n)} this month against a usual ${eur.format(mu)}`
  }
  return { plain, stats: `${z}σ from the ${months}-month average (${eur.format(mu)} ± ${eur.format(Number(sd))})` }
}
