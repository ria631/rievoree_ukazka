import { useMemo } from "react"
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
  title: string
  migration: string
  note: string
  sql: string
  file: string // the migration it comes from — "open file" jumps there
  focus: string
}

const ENTRIES: SqlEntry[] = [
  {
    target: "entities",
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
    target: "report_account_monthly",
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
    target: "pipeline_events",
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
    target: "approve_batch",
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
    target: "profiles",
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
]

export function SqlTab() {
  const events = useXRayEvents()
  const { openCode } = useXrayPanel()
  const seen = useMemo(
    () => new Set(events.map((e) => e.target)),
    [events],
  )

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <p className="border-b border-border px-4 py-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
        Reference SQL — the real definitions behind these calls, pulled from the
        migrations.{" "}
        <span className="text-foreground">Not a live query or EXPLAIN.</span> The
        “seen” tag is the only live signal (from this session's CALLS).
      </p>

      <div className="space-y-4 px-4 py-3">
        {ENTRIES.map((entry) => (
          <section key={entry.target}>
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="font-mono text-xs text-foreground">{entry.title}</span>
              {seen.has(entry.target) && (
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
              onExpand={() => openCode({ kind: "target", target: { title: entry.title, refs: [{ file: entry.file, focus: entry.focus, label: entry.migration }] } })} />
            <p className="mt-1 font-mono text-[10px] leading-snug text-muted-foreground">
              {entry.note}
            </p>
          </section>
        ))}
      </div>
    </div>
  )
}
