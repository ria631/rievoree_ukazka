# Operations — deploying and running the hosted demo

Everything here runs against **your** Supabase project; nothing in the repo
touches a remote database on its own. Lines starting with `#` are comments.

## 1. Apply the migrations

```bash
supabase db push --dry-run   # review what will be sent
supabase db push             # apply
```

Locally: `supabase migration up` (pending only) or `supabase db reset` (clean
rebuild + seed). `seed.sql` is never pushed to a remote project.

## 2. Deploy the edge functions

```bash
supabase functions deploy ingest-submit
supabase functions deploy notify-review
supabase functions deploy connector-webhook
supabase functions deploy admin-users
supabase functions deploy classify-accounts
```

Secrets they read:

```bash
supabase secrets set APP_BASE_URL="https://rievoree-ukazka.vercel.app"   # invite / reset links
```

Review e-mails: `notify-review` is called by a trigger through `pg_net`; its
endpoint lives in Vault, never in a migration:

```sql
select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/notify-review', 'edge_notify_review_url');
select vault.create_secret('<service_role JWT>', 'edge_service_role_key');
```

## 3. Auth

- **Redirect URLs** (Dashboard → Authentication → URL Configuration):
  `https://rievoree-ukazka.vercel.app/**` and `http://localhost:5173/**`.
- **Social login**: `config.toml` enables Google and GitHub from env vars.
  ```bash
  supabase config push
  supabase secrets set \
    SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID="..." SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET="..." \
    SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID="..." SUPABASE_AUTH_EXTERNAL_GITHUB_SECRET="..."
  ```
- **SMTP** for invite / reset e-mails (Dashboard → Authentication → Emails →
  SMTP Settings). The built-in mailer reaches only a few addresses.

## 4. Connectors

The spreadsheet-link connector needs no secrets: Postgres fetches the public
link itself (`pg_net`) and the `connector-auto-sync` cron re-reads active links
hourly (the shared demo accounts are never synced unattended).

The shared demo shows one showcase connector (preview only). Point it at the
sample sheet the app serves itself:

```sql
select private.ensure_showcase_connector('https://rievoree-ukazka.vercel.app/samples/facility-costs-sheet.csv');
```

Check the cron jobs:

```sql
select jobname, schedule, active from cron.job order by jobname;
```

## 5. The shared demo

- Demo identities (`*@demo.local`, password `demo123456`) are read-only in the
  database (`profiles.is_demo`); `reset_demo_state()` runs hourly.
- A demo identity lists only demo identities (migration `20261121000001`).
  Real accounts should not be members of the sample companies at all — check:
  ```sql
  select p.email, e.name
  from public.entity_members em
  join public.entities e on e.id = em.entity_id and e.is_sample
  join public.profiles p on p.id = em.user_id and not p.is_demo;
  ```
  and, if that lists anyone, remove those memberships:
  ```sql
  delete from public.entity_members em
  using public.entities e, public.profiles p
  where e.id = em.entity_id and e.is_sample
    and p.id = em.user_id and not p.is_demo;
  ```
- Turn on two-factor for every real `super_admin` account.

## 6. Keep the free-tier project awake

`.github/workflows/keepalive.yml` makes one read-only request a day so a free
Supabase project isn't paused while nobody visits. Add two repository secrets
(Settings → Secrets and variables → Actions): `SUPABASE_URL` and
`SUPABASE_ANON_KEY` — the same public values the frontend uses. Without them
the job skips.

## 7. Smoke tests after a deploy

- `/` loads, the page tears open; **Explore the demo** lands on the dashboard.
- Press **X** → **RLS** → *Run as* Viewer / Manager / Admin returns 1 / 2 / 4.
- As `admin@demo.local` → **Users** lists only `*@demo.local` accounts.
- As `manager@demo.local` → **Connectors** → **Sync now** shows the sheet preview.
- Webhook connector (from a registered account):
  ```bash
  URL='https://<project-ref>.supabase.co/functions/v1/connector-webhook?id=<connector-id>'
  SECRET='<the secret shown once>'
  BODY='account_code,txn_date,debit,credit,currency
  4000,2026-06-20,0,13000,EUR'
  SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')
  curl -X POST "$URL" -H "content-type: text/csv" -H "x-signature: sha256=$SIG" --data-binary "$BODY"
  ```
  Expect `201`; a wrong signature → `401`.
