# Demo walkthrough — X-Ray Financial Reporting Engine

A 3–5 minute self-guided tour. **Live:** https://rievoree-ukazka.vercel.app
(or run locally — see README). Everything below is read-only unless you create
your own account.

---

## The 3-minute path (what to look at, in order)

1. **Landing → Explore the demo.** You land on the Dashboard as a read-only
   visitor. Nothing you do here is saved.

2. **Open the 🔬 X-RAY panel (top-right) → Calls.** Every number on the page
   came from Postgres through one instrumented fetch; the panel logs each call
   with its status and timing. This is the whole point — the backend runs in
   the open.

3. **X-RAY → RLS.** Click **Run as Viewer**, then **Manager**, then **Admin**.
   The identical query `select id, name from entities` returns **1 / 2 / 4**
   rows — the database decides, by `auth.uid()`, not the frontend. This runs in
   an isolated session, so your own view doesn't change.

4. **Reports / P&L / Balance / Pivot / Variance / Aging.** Real figures from
   `report_account_monthly`, RLS-filtered to the entities your role can see.
   The balance sheet ties (A = L + E); the variance bridge sums to the total.

5. **Sign in as a role to see the machinery** (login page → *Explore as a role*):
   - **Manager** → **Ingest**: upload a CSV (use the template), watch it get
     validated and z-score-screened; a batch at *Needs review* shows the flagged
     anomaly. Approve it and the figures flow into Reports. **Connectors** shows
     the Google Drive (simulate) + HMAC webhook paths.
   - **Admin** → **Users**: invite-by-email, roles, reset password/MFA,
     deactivate — every privileged change goes through an audited RPC.

   These role logins are shared, read-only demo accounts: the DB refuses writes
   that would change account state (role, password, 2FA, provisioning), so you
   can explore safely. To actually upload and approve, **create your own account**
   — you get a private sandbox you can't break.

---

## Run it locally

```bash
export SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=x SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET=x \
       SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID=x SUPABASE_AUTH_EXTERNAL_GITHUB_SECRET=x
supabase start          # Postgres, Auth, Storage, Edge Functions, Realtime + seed
npm run dev             # http://localhost:5173
```

For the XLSX ingest path (optional) also run the worker: `docker compose up -d --build`.
CSV uploads are parsed in the browser and need no worker.

> **Clean slate:** `supabase db reset` re-applies migrations + seed (4 tenants,
> 18 months of deterministic history, the live anomaly batch, demo users).

---

## What proves the flow actually ran

- **Reports** gains the new period's rows after you approve a batch.
- **X-ray → Pipeline** streams `approved → refresh_enqueued → mv_refreshed`
  events over Realtime (the async trigger chain + pg_cron, made visible).
- **X-ray → Calls** lists every request you triggered, timed at the fetch seam.
- **X-ray → SQL / Arch** show the real policies behind the calls and which
  layers were exercised this session.
