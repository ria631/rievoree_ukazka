# DB-COMMANDS.md — connectors + user management

> Everything in this file you run yourself. Claude wrote the migrations, edge
> functions and config; it did **not** touch your database. Run the blocks below
> in order. Lines starting with `#` are comments.

New artifacts in this change:

| Kind | Path |
|---|---|
| Migration 29 | `supabase/migrations/20260628000001_connectors.sql` |
| Migration 30 | `supabase/migrations/20260628000002_user_management.sql` |
| Migration 31 | `supabase/migrations/20260628000003_connector_cron.sql` |
| Migration 40 | `supabase/migrations/20261016000002_connector_kind_url.sql` (enum values — run alone first) |
| Migration 41 | `supabase/migrations/20261016000003_sheet_link_connector.sql` (spreadsheet-link connector; retires Drive) |
| Edge fn | `supabase/functions/connector-webhook` (HMAC inbound, public) |
| Edge fn | `supabase/functions/admin-users` (create / reset password / reset MFA) |
| Shared | `supabase/functions/_shared/connectors.ts` |

> The Google Drive connector (edge functions `connector-oauth`,
> `connector-callback`, `connector-sync`) was retired in migration 41 — it
> needed a Google-verified OAuth app. If they were deployed, remove them:
> `supabase functions delete connector-oauth connector-callback connector-sync`.

---

## 1. Apply the migrations

### Local (Supabase CLI)

```bash
# Applies all pending migrations to the local stack:
supabase migration up

# …or a clean rebuild (drops + re-seeds local data):
supabase db reset
```

### Remote (your hosted project)

```bash
# Review what will be sent first:
supabase db push --dry-run

# Then apply:
supabase db push
```

> The migrations are idempotent where it matters (`create extension if not
> exists`, guarded cron block). `seed.sql` is never pushed to remote.

---

## 2. Deploy the edge functions

```bash
supabase functions deploy connector-webhook
supabase functions deploy admin-users
```

---

## 3. Spreadsheet-link connector — nothing to configure

The database fetches the link itself (`pg_net`), so there are no secrets and no
OAuth app. A Google Sheet must be shared "Anyone with the link" (or published to
the web as CSV); the link is turned into its CSV export automatically.

The shared demo shows one showcase connector (preview only). It points at
`https://rievoree-ukazka.vercel.app/samples/facility-costs-sheet.csv`; to point
it elsewhere (e.g. your own published sheet):

```sql
select private.ensure_showcase_connector('<public https link to a CSV>');
```

---

## 4. Social login (Sign in with Google / GitHub)

`config.toml` now enables the `google` and `github` providers from env vars.

```bash
# Remote: push the auth config + set the provider secrets.
supabase config push   # (CLI ≥ 1.150; otherwise set providers in the dashboard)

supabase secrets set \
  SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID="..." \
  SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET="..." \
  SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID="..." \
  SUPABASE_AUTH_EXTERNAL_GITHUB_SECRET="..."
```

Local: export those four vars (or add to your shell env) before `supabase start`.
The buttons render regardless; an unconfigured provider returns a clear error.


---

## 5. Connector auto-sync cron

`connector-auto-sync` runs `private.run_connector_syncs(5)` every 10 min: it
finishes answered fetches and re-reads each active link hourly (connectors of the
shared demo accounts are never synced unattended). No Vault secrets needed since
migration 41.

```sql
select jobname, schedule, active from cron.job where jobname = 'connector-auto-sync';
```

---

## 6. (Optional) regenerate TypeScript types

```bash
supabase gen types typescript --local > src/lib/database.types.ts   # if you keep generated types
```

---

## 7. Smoke tests

### Webhook connector (no Google needed)

1. In the app: Connectors → add an **HMAC webhook** connector → copy the secret + URL.
2. From a shell:

```bash
URL='https://<project-ref>.supabase.co/functions/v1/connector-webhook?id=<connector-id>'
SECRET='<the secret shown once>'
BODY='account_code,txn_date,debit,credit,currency
4000,2026-06-20,0,13000,EUR'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')
curl -X POST "$URL" -H "content-type: text/csv" -H "x-signature: sha256=$SIG" --data-binary "$BODY"
```

Expect `201 {"status":"created","batch_id":...}`. A wrong signature → `401`.
The batch then appears on the Ingest page at `awaiting_review`.

### User management

- Sign in as `admin@demo.local` / `super@demo.local` (platform admins) to see the
  full table: create user, reset password (returns a recovery link locally),
  reset MFA, assign roles, activate/deactivate.
- A self-registered admin sees only the members of the entities they own and the
  membership tools (invite/remove) — credential ops stay platform-only.

### Spreadsheet-link connector

Register an account → Connectors → **Use the sample sheet** (or paste a Google
Sheets link shared "Anyone with the link") → **Add** → **Sync now**. Expect
"Imported N rows … waiting for review on Ingest". **Sync now** again → "No change
since the last sync" (same SHA-256, nothing imported twice).
