/**
 * Who built this, and how to reach her — one place, used by the landing, the
 * About page and the footer. A link left empty is simply not shown (no
 * placeholder ever reaches the page).
 */
export const AUTHOR = {
  name: "Mariia Chernenko",
  github: "https://github.com/ria631",
  repo: "https://github.com/ria631/rievoree_ukazka",
  /** e.g. "name@example.com" — shows a "Write to me" button. */
  email: "",
  /** Full profile URL. */
  linkedin: "",
  /** URL of a CV (PDF). */
  cv: "",
}

export type ContactLink = { label: string; href: string; external: boolean }

/** The contact links that are actually filled in, in display order. */
export function contactLinks(): ContactLink[] {
  const links: ContactLink[] = []
  if (AUTHOR.email) links.push({ label: "Write to me", href: `mailto:${AUTHOR.email}`, external: false })
  if (AUTHOR.linkedin) links.push({ label: "LinkedIn", href: AUTHOR.linkedin, external: true })
  if (AUTHOR.cv) links.push({ label: "CV (PDF)", href: AUTHOR.cv, external: true })
  links.push({ label: "GitHub", href: AUTHOR.github, external: true })
  return links
}

/** What the project demonstrates, each claim pointing at the code that backs it. */
export const EVIDENCE: { area: string; claim: string; where: { label: string; path: string }[] }[] = [
  {
    area: "Postgres & security",
    claim: "Row-level security on every table, column grants and triggers underneath; a privilege escalation found in review, fixed and pinned by a test; demo accounts locked read-only in the database.",
    where: [
      { label: "migrations", path: "supabase/migrations" },
      { label: "isolation test", path: "supabase/tests/security_isolation_test.sql" },
      { label: "the fix", path: "supabase/migrations/20261013000001_security_hardening_demo_lockdown.sql" },
    ],
  },
  {
    area: "ETL & data quality",
    claim: "Validate → z-score anomaly screen → human approval → idempotent delete-and-reload; a spreadsheet link the database fetches and parses itself; CSV-injection defence.",
    where: [
      { label: "anomaly test", path: "supabase/tests/detect_anomalies_test.sql" },
      { label: "reload test", path: "supabase/tests/load_batch_test.sql" },
      { label: "sanitizer", path: "worker/src/sanitize.ts" },
    ],
  },
  {
    area: "Async & scheduling",
    claim: "A queue claimed with FOR UPDATE SKIP LOCKED and leases, advisory locks, trigger chains, pg_cron refreshes and pg_net callbacks — all inside Postgres.",
    where: [
      { label: "worker claim", path: "worker/src/db.ts" },
      { label: "cron refresh", path: "supabase/migrations/20260610000006_pg_cron_refresh_and_housekeeping.sql" },
    ],
  },
  {
    area: "Frontend",
    claim: "React 19 + TypeScript strict, TanStack Router/Query with code-split routes, every request instrumented at one fetch seam, a WebGL landing, finance pages a CFO reads.",
    where: [
      { label: "fetch seam", path: "src/lib/xray/instrumentedFetch.ts" },
      { label: "pages", path: "src/pages" },
      { label: "KPI maths", path: "src/lib/data" },
    ],
  },
  {
    area: "Testing & delivery",
    claim: "pgTAP against a real local Supabase, Deno tests for the parser, vitest for the reporting maths, ESLint, a migration-safety scanner — all in CI on every pull request.",
    where: [
      { label: "pgTAP", path: "supabase/tests" },
      { label: "CI", path: ".github/workflows/ci.yml" },
    ],
  },
]

/** GitHub URL for a repo path (tree for folders, blob for files). */
export function repoUrl(path: string) {
  const isFile = /\.[a-z]+$/i.test(path)
  return `${AUTHOR.repo}/${isFile ? "blob" : "tree"}/main/${path}`
}
