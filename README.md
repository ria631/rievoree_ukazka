# X-Ray Financial Reporting Engine

A full-stack financial reporting tool whose real product is **visible backend
machinery**: every page carries an X-ray panel (🔬) that shows the live API
calls, RLS policies, SQL and security layers doing the work.

**Live demo:** https://rievoree-ukazka.vercel.app — click **Explore the demo**
(read-only, no account), then open the **X-RAY** panel on any page.

Portfolio project by **Mariia Chernenko**. All data is fake, built from scratch.

---

## What it actually does

Messy accounting spreadsheets in → validated, anomaly-screened, RLS-scoped
reports out — and you can watch every layer run:

- **Multi-tenant RLS.** The same query returns different rows per role; the
  database, not the frontend, is the barrier. The X-ray **RLS** tab runs the
  identical `select … from entities` as viewer / manager / admin and shows the
  row counts side by side.
- **Real ETL pipeline.** Upload a CSV → validate per-entity rules → z-score
  anomaly screen → manual approval → idempotent delete-and-reload → the report
  materialized view refreshes (trigger chain + `pg_cron`), with `pg_net` calling
  an edge function on the way.
- **Auth & user management.** Four roles, TOTP 2FA, email invites, password
  reset, deactivation, OAuth — with frozen privileged columns (defense in depth).
- **Connectors.** A spreadsheet link (a Google Sheet shared "anyone with the
  link", or any public CSV) that the database itself fetches with `pg_net`,
  parses in SQL and re-reads hourly via `pg_cron` — plus an HMAC-signed
  webhook. Both feed the same pipeline; already-seen content is skipped.

### What's real vs. illustrative (honesty invariant)
Every figure in the product app is a real query result. The small panels in the
landing page's "What it does" section are **on-brand illustrations** (labelled as
such) — the live versions are one click into the demo. The X-ray **SQL** tab
shows reference SQL pulled from the migrations, clearly marked "not a live
EXPLAIN"; the **Calls** and **Pipeline** tabs are live.

---

## Repository map

| Path | Responsibility |
|---|---|
| `src/` | React 19 + TypeScript frontend (Vite, Tailwind v4, shadcn/ui, TanStack Router/Query, recharts) |
| `src/lib/xray/` | X-ray instrumentation: every Supabase request is timed at the fetch layer |
| `supabase/migrations/` | Versioned SQL — schema, RLS policies, RPCs, grant hardening |
| `supabase/tests/` | pgTAP: ETL transform, z-score, load, tenant isolation |
| `supabase/functions/` | Deno edge functions (ingest-submit, notify-review, connectors, admin-users) |
| `worker/` | Deno ETL worker — used locally for XLSX; the hosted path parses CSV in-browser |
| `docs/` | Design spec, DB operation notes, the Claude-in-Chrome review prompts |

## Security model

- **Multi-tenant RLS** on every table, keyed by `entities`; global roles
  (super_admin / admin / manager / viewer) + per-entity membership.
- **Global admin is explicit.** Cross-tenant access requires
  `profiles.is_platform_staff`; a self-registered admin is scoped to their own
  entities. (This closed a privilege-escalation found in review — see
  migration `20261013000001`.)
- **Demo accounts are DB-locked read-only** (`profiles.is_demo`): they can't
  change role/password/2FA, provision, or manage connectors/members, and an
  hourly `reset_demo_state()` keeps the showcase clean.
- **Defense in depth:** column-level grants under RLS under triggers — frozen
  profile columns are protected at three layers.
- **Least privilege:** API roles hold only what they can legitimately use;
  `ingest_queue` is deny-all by design.

## Getting started (local)

Prerequisites: Node 20+, Docker, [Supabase CLI](https://supabase.com/docs/guides/local-development).

```bash
npm install
# config.toml reads OAuth provider secrets from env — dummy values are fine locally:
export SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=x SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET=x \
       SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID=x SUPABASE_AUTH_EXTERNAL_GITHUB_SECRET=x
supabase start            # boots the local stack + applies all migrations + seed
cp .env.example .env.local
# fill VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY from `supabase status`
npm run dev
```

All demo users share the password **`demo123456`** (local seed, `super@` /
`admin@` / `manager@` / `viewer@` / `demo@demo.local`). The shared accounts are
read-only — register a real account to try uploads and role switching.

## Tests

```bash
supabase test db          # pgTAP: transform, z-score, load, tenant isolation
cd worker && deno test    # CSV/XLSX parser + CSV-injection sanitizer
npm run build             # tsc -b (typecheck) + vite build
bash scripts/check-migrations.sh   # migration-safety scanner (no fake-RLS)
```

CI (`.github/workflows/ci.yml`) runs all of the above on every push and PR.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | typecheck + production build |
| `npm run typecheck` | `tsc -b` |
| `npm run stack` | Supabase stack + worker container + Vite |
