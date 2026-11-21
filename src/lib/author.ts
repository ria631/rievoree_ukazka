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

/** What the project demonstrates: a plain sentence first, the technique under
 *  it, and the code that backs it. */
export const EVIDENCE: { area: string; plain: string; tech: string; where: { label: string; path: string }[] }[] = [
  {
    area: "Data security",
    plain: "Each company's numbers reach only the people invited to it — and the database enforces that, not the website.",
    tech: "Row-level security on every table, column grants and triggers underneath; a privilege escalation found in review, fixed and pinned by a test.",
    where: [
      { label: "isolation test", path: "supabase/tests/security_isolation_test.sql" },
      { label: "the policies", path: "supabase/migrations/20260605000001_identity_and_tenancy.sql" },
    ],
  },
  {
    area: "Data quality",
    plain: "Messy spreadsheets go in; every row is checked, and anything far outside its history waits for a person.",
    tech: "Validation rules per company, a z-score screen against 12 months of history, manual approval, idempotent delete-and-reload.",
    where: [
      { label: "anomaly test", path: "supabase/tests/detect_anomalies_test.sql" },
      { label: "reload test", path: "supabase/tests/load_batch_test.sql" },
    ],
  },
  {
    area: "Automation in Postgres",
    plain: "Reports refresh themselves and linked sheets are re-read every hour — no one exports or copies anything.",
    tech: "Trigger chains, a refresh queue drained by pg_cron, pg_net fetching sheets, FOR UPDATE SKIP LOCKED queue claims.",
    where: [
      { label: "cron refresh", path: "supabase/migrations/20260610000006_pg_cron_refresh_and_housekeeping.sql" },
      { label: "queue claim", path: "worker/src/db.ts" },
    ],
  },
  {
    area: "Product & frontend",
    plain: "Finance pages a CFO reads — P&L, rent roll, cash, forecast — with the maths unit-tested.",
    tech: "React 19 and TypeScript strict, TanStack Router/Query with code-split routes, every request timed at one fetch seam.",
    where: [
      { label: "KPI maths", path: "src/lib/data" },
      { label: "fetch seam", path: "src/lib/xray/instrumentedFetch.ts" },
    ],
  },
]

/** The tests worth naming — the rest are counted, not listed. */
export const TOP_TESTS: { name: string; path: string }[] = [
  { name: "Companies can't see each other's data", path: "supabase/tests/security_isolation_test.sql" },
  { name: "A demo account never sees a real one", path: "supabase/tests/demo_members_privacy_test.sql" },
  { name: "A reloaded batch is never counted twice", path: "supabase/tests/load_batch_test.sql" },
]

/** GitHub URL for a repo path (tree for folders, blob for files). */
export function repoUrl(path: string) {
  const isFile = /\.[a-z]+$/i.test(path)
  return `${AUTHOR.repo}/${isFile ? "blob" : "tree"}/main/${path}`
}
