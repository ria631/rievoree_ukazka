import { useMemo } from "react"
import { useRouterState } from "@tanstack/react-router"
import { useXRayEvents } from "@/lib/xray/useXRayEvents"
import { CodeBlock } from "@/components/xray/CodeBlock"
import { useXrayPanel } from "@/components/xray/XrayPanelContext"

/**
 * SQL — reference definitions behind the calls, pulled VERBATIM from the
 * migrations. This is deliberately NOT a live query or EXPLAIN: it never claims
 * to have just run. Each entry is attributed to its migration; the only live
 * signal is the honest "seen this session" tag, derived from real CALLS targets.
 *
 * (A real EXPLAIN would require a dedicated RPC that actually executes — out of
 * scope here; an honest labelled reference is the right call for the demo.)
 */
interface SqlEntry {
  target: string // matches the seam's CALLS target, for the "seen" tag
  pages: string[] // routes whose data goes through it ("*" = every page)
  title: string
  migration: string
  note: string
  sql: string
  file: string // the migration it comes from — "open file" jumps there
  focus: string
}

const ENTRIES: SqlEntry[] = [
  {
    target: "entities", pages: ["*"],
    title: "entities — row-level security",
    migration: "migration 1",
    note: "The policy the RLS tab demonstrates: admin sees all, others only assigned entities.",
    file: "supabase/migrations/20260605000001_identity_and_tenancy.sql", focus: "create policy entities_select",
    sql: `create policy entities_select on public.entities
  for select to authenticated
  using (
    (select private.is_admin())
    or id in (select private.my_entity_ids())
  );`,
  },
  {
    target: "report_account_monthly", pages: ["/dashboard", "/pl", "/rent-roll", "/receivables", "/budget-flow", "/forecast", "/journal"],
    title: "report_account_monthly — tenant-filtered view",
    migration: "migrations 11 + 12",
    note: "security_invoker view over a private MV; the WHERE is the sole cross-tenant barrier.",
    file: "supabase/migrations/20260610000002_report_account_monthly.sql", focus: "create view public.report_account_monthly",
    sql: `create view public.report_account_monthly as
select m.entity_id, m.period, m.account_id, m.account_code,
       m.account_name, m.account_type, m.debit, m.credit, m.net, m.entry_count
from private.mv_account_monthly m
where (select private.is_admin())
   or m.entity_id in (select private.my_entity_ids());

-- migration 12: run as the caller, not the definer
alter view public.report_account_monthly set (security_invoker = on);`,
  },
  {
    target: "pipeline_events", pages: ["/ingest", "/connectors"],
    title: "pipeline_events — RLS for the live timeline",
    migration: "migration 13",
    note: "What scopes the PIPELINE tab: managers see their entities, admin sees all.",
    file: "supabase/migrations/20260610000004_pipeline_events_and_refresh_queue.sql", focus: "create policy pipeline_events_select",
    sql: `create policy pipeline_events_select on public.pipeline_events
  for select to authenticated
  using (
    (select private.is_admin())
    or (
      (select private.user_role()) = 'manager'
      and entity_id in (select private.my_entity_ids())
    )
  );`,
  },
  {
    target: "approve_batch", pages: ["/ingest"],
    title: "approve_batch — permission gate",
    migration: "migrations 14 + 27",
    note: "FOR UPDATE locks the row before the check; coalesce(...,false) fails closed. Managers and (scoped) admins may approve their own entities.",
    file: "supabase/migrations/20260626000007_scoped_admin.sql", focus: "create or replace function public.approve_batch",
    sql: `select * into v_batch from public.ingest_batches
  where id = p_batch_id for update;

if not coalesce(
  (select private.is_admin())
  or ((select private.user_role()) in ('manager', 'admin')
      and v_batch.entity_id in (select private.my_entity_ids())),
  false
) then
  raise exception 'not authorized ...' using errcode = '42501';
end if;`,
  },
  {
    target: "profiles", pages: ["/users", "/account"],
    title: "is_admin() — scoped global admin (security hardening)",
    migration: "migration 34",
    note: "Global cross-tenant access requires an explicit is_platform_staff flag — a self-registered admin stays scoped to their own entities. This closed a privilege-escalation found in review.",
    file: "supabase/migrations/20261013000001_security_hardening_demo_lockdown.sql", focus: "create or replace function private.is_admin",
    sql: `create or replace function private.is_admin()
returns boolean language sql stable security definer
set search_path = '' as $$
  select coalesce(
    (select private.is_super_admin())
    or exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and is_active
        and role = 'admin' and is_platform_staff),
    false)
$$;`,
  },
  {
    target: "leases", pages: ["/dashboard", "/rent-roll", "/forecast"],
    title: "properties · units · leases — the rent roll's tables",
    migration: "migration 38 · real-estate reporting",
    note: "Occupancy, WALT and the forecast are computed from these three tables; each is fenced by the same membership rule.",
    file: "supabase/migrations/20261015000001_real_estate_reporting.sql", focus: "create policy leases_select",
    sql: `create policy properties_select on public.properties for select to authenticated
  using ((select private.is_admin()) or entity_id in (select private.my_entity_ids()));

create policy units_select on public.units for select to authenticated
  using ((select private.is_admin()) or entity_id in (select private.my_entity_ids()));

create policy leases_select on public.leases for select to authenticated
  using ((select private.is_admin()) or entity_id in (select private.my_entity_ids()));`,
  },
  {
    target: "budgets", pages: ["/pl", "/forecast"],
    title: "budgets — what every P&L line is measured against",
    migration: "2026-06-26 · budgets",
    note: "Members see their companies' budgets; there is no client write path at all.",
    file: "supabase/migrations/20260626000002_budgets.sql", focus: "create policy budgets_select",
    sql: `create policy budgets_select on public.budgets
  for select to authenticated
  using ((select private.is_admin()) or entity_id in (select private.my_entity_ids()));`,
  },
  {
    target: "invoices", pages: ["/receivables", "/rent-roll"],
    title: "invoices — the open items behind AR / AP",
    migration: "2026-06-26 · invoices",
    note: "The aging buckets and the sub-ledger tie-out read these rows, scoped like everything else.",
    file: "supabase/migrations/20260626000003_invoices.sql", focus: "create policy invoices_select",
    sql: `create policy invoices_select on public.invoices
  for select to authenticated
  using ((select private.is_admin()) or entity_id in (select private.my_entity_ids()));`,
  },
  {
    target: "cash_budget", pages: ["/budget-flow"],
    title: "cash_budget — the plan the bank lines are compared to",
    migration: "migration 38 · real-estate reporting",
    note: "Actuals come from tagged bank postings (report_cash_monthly); the plan from this table.",
    file: "supabase/migrations/20261015000001_real_estate_reporting.sql", focus: "create policy cash_budget_select",
    sql: `create policy cash_budget_select on public.cash_budget for select to authenticated
  using ((select private.is_admin()) or entity_id in (select private.my_entity_ids()));`,
  },
  {
    target: "journal_documents", pages: ["/journal"],
    title: "journal_documents — a tenant-filtered window onto an MV",
    migration: "2026-10-16 · journal documents MV",
    note: "The page pages through 4,700 documents 25 at a time; Postgres filters, sorts and slices. The MV itself is never exposed.",
    file: "supabase/migrations/20261016000001_journal_documents_mv.sql", focus: "create or replace view public.journal_documents",
    sql: `create or replace view public.journal_documents
with (security_invoker = true) as
select m.entity_id, m.doc_no, m.doc_type, m.txn_date, m.period, m.description,
       m.lines, m.debit, m.credit, m.balanced, m.batch_id
from private.mv_journal_documents m
where (select private.is_admin())
   or m.entity_id in (select private.my_entity_ids());`,
  },
  {
    target: "journal_month_summary", pages: ["/journal"],
    title: "journal_month_summary — the debit = credit proof",
    migration: "migration 38 · real-estate reporting",
    note: "Counts and totals per month and document type, including how many documents don't balance (zero).",
    file: "supabase/migrations/20261015000001_real_estate_reporting.sql", focus: "create or replace view public.journal_month_summary",
    sql: `create or replace view public.journal_month_summary
with (security_invoker = true) as
select jd.entity_id, jd.period, jd.doc_type,
       count(*)::int                              as docs,
       sum(jd.lines)::int                         as lines,
       sum(jd.debit)                              as debit,
       sum(jd.credit)                             as credit,
       count(*) filter (where not jd.balanced)::int as unbalanced
from public.journal_documents jd
group by jd.entity_id, jd.period, jd.doc_type;`,
  },
]

export function SqlTab() {
  const events = useXRayEvents()
  const { openCode } = useXrayPanel()
  const path = useRouterState({ select: (s) => s.location.pathname })
  const seen = useMemo(
    () => new Set(events.map((e) => e.target)),
    [events],
  )
  // This page's definitions first; the rest of the app's below, folded.
  const here = ENTRIES.filter((e) => e.pages.includes("*") || e.pages.includes(path))
  const elsewhere = ENTRIES.filter((e) => !here.includes(e))

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <p className="border-b border-border px-4 py-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
        Reference SQL — the real definitions behind these calls, pulled from the
        migrations.{" "}
        <span className="text-foreground">Not a live query or EXPLAIN.</span> The
        “seen” tag is the only live signal (from this session's CALLS).
      </p>

      <div className="space-y-4 px-4 py-3">
        <h4 className="font-mono text-[10px] uppercase tracking-widest text-accent">Behind this page</h4>
        {here.map((entry) => <SqlCard key={entry.target} entry={entry} seen={seen.has(entry.target)} onOpen={openCode} />)}
      </div>
      {elsewhere.length > 0 && (
        <details className="border-t border-border px-4 py-3">
          <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground">
            Elsewhere in the app ({elsewhere.length})
          </summary>
          <div className="mt-3 space-y-4">
            {elsewhere.map((entry) => <SqlCard key={entry.target} entry={entry} seen={seen.has(entry.target)} onOpen={openCode} />)}
          </div>
        </details>
      )}
    </div>
  )
}

function SqlCard({ entry, seen, onOpen }: { entry: SqlEntry; seen: boolean; onOpen: ReturnType<typeof useXrayPanel>["openCode"] }) {
  return (
    <section>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="font-mono text-xs text-foreground">{entry.title}</span>
        {seen && (
          <span className="flex shrink-0 items-center gap-1 font-mono text-[9px] uppercase tracking-wider text-accent">
            <span aria-hidden className="size-1.5 rounded-full bg-accent" />
            seen
          </span>
        )}
      </div>
      <div className="mb-1 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
        {entry.migration}
      </div>
      <CodeBlock code={entry.sql} lang="sql" file={entry.file.split("/").pop()!}
        onExpand={() => onOpen({ kind: "target", target: { title: entry.title, refs: [{ file: entry.file, focus: entry.focus, label: entry.migration }] } })} />
      <p className="mt-1 font-mono text-[10px] leading-snug text-muted-foreground">
        {entry.note}
      </p>
    </section>
  )
}
