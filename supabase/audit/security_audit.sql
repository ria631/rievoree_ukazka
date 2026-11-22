-- ============================================================================
-- Security audit — READ-ONLY. Changes nothing.
--
-- Run in Supabase → SQL Editor (or psql). Returns ONE table of findings:
--   severity · check · object · detail
-- HIGH   = a real way to read or change data you shouldn't; fix it.
-- MEDIUM = worth a look (it may be intended — the detail says why it's listed).
-- INFO   = inventory: every policy, every SECURITY DEFINER function, every
--          realtime table and cron job, so the whole surface is on one page.
--
-- What it checks, in the schemas the API exposes (public, graphql_public):
--   tables without RLS · what the anon role (no session) may touch · policies
--   open to everyone or true for every signed-in user · RLS with no policy ·
--   views that run with their owner's rights · materialized views readable
--   through the API · SECURITY DEFINER functions (who can call them, whether
--   search_path is pinned) · roles that bypass RLS · secret-looking columns
--   readable through the API · public storage buckets · and, for this
--   project, any real account's data inside the public demo companies.
-- ============================================================================
with
api as (select unnest(array['public', 'graphql_public'])::name as s),
rels as (
  select c.oid, n.nspname as schema, c.relname as name, c.relkind, c.relrowsecurity as rls, c.reloptions
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in (select s from api) and c.relkind in ('r', 'p', 'v', 'm', 'f')
),
pol as (select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check from pg_policies),
fns as (
  select p.oid, n.nspname as schema, p.proname as name, p.prosecdef as definer, p.proconfig,
         pg_get_function_identity_arguments(p.oid) as args
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where p.prokind in ('f', 'p')
),
findings as (
  -- 1. A table the API can reach with no row-level security at all.
  select 'HIGH' as sev, 'table without RLS' as chk, schema || '.' || name as obj,
         'anyone with a grant reads or writes every row' as detail
  from rels where relkind in ('r', 'p') and not rls

  union all
  -- 2. What a visitor with no session (the anon role) may do. INSERT-only on a
  --    table with RLS is a write-only box (a contact form): listed as INFO.
  select case when relkind in ('v', 'm', 'f') or not rls then 'HIGH'
              when not has_table_privilege('anon', oid, 'SELECT,UPDATE,DELETE') then 'INFO'
              else 'MEDIUM' end,
         'anon has privileges', schema || '.' || name,
         concat_ws(', ',
           case when has_table_privilege('anon', oid, 'SELECT') then 'SELECT' end,
           case when has_table_privilege('anon', oid, 'INSERT') then 'INSERT' end,
           case when has_table_privilege('anon', oid, 'UPDATE') then 'UPDATE' end,
           case when has_table_privilege('anon', oid, 'DELETE') then 'DELETE' end)
         || case when relkind in ('r', 'p') and rls then ' — RLS is on, so the policies decide what comes back'
                 else ' — nothing row-level protects this object' end
  from rels where has_table_privilege('anon', oid, 'SELECT,INSERT,UPDATE,DELETE')

  union all
  -- 3. A policy that lets everyone (anon / public) through. An open INSERT is
  --    only a write-only box when nobody can read the table back: INFO then.
  select case when p.cmd = 'INSERT'
                   and not exists (select 1 from pol q where q.schemaname = p.schemaname and q.tablename = p.tablename
                                     and q.cmd in ('SELECT', 'ALL') and q.roles && array['anon', 'public']::name[])
              then 'INFO' else 'HIGH' end,
         case when p.cmd = 'INSERT' then 'anyone may insert (write-only box)' else 'policy open to anon or public' end,
         p.schemaname || '.' || p.tablename || ' · ' || p.policyname,
         p.cmd || ' to ' || array_to_string(p.roles, ', ') || ' using (' || coalesce(p.qual, '—') || ')'
         || coalesce(' check (' || p.with_check || ')', '')
         || case when p.cmd = 'INSERT' then ' — nobody can read it back; fine for a contact form, mind spam' else '' end
  from pol p
  where p.roles && array['anon', 'public']::name[]
    and (coalesce(p.qual, 'true') = 'true' or p.with_check = 'true')

  union all
  -- 4. A policy that is simply true for every signed-in user.
  select 'MEDIUM', 'policy true for all signed-in users', schemaname || '.' || tablename || ' · ' || policyname,
         cmd || ' to ' || array_to_string(roles, ', ') || ' using (true)'
  from pol where 'authenticated' = any(roles) and qual = 'true'

  union all
  -- 5. RLS on but no policy: the API sees nothing; only the service role or
  --    SECURITY DEFINER functions can reach it (usually intended, for queues).
  select 'INFO', 'RLS on, no policy', r.schema || '.' || r.name,
         'API roles get no rows; only the service role or SECURITY DEFINER functions reach it'
  from rels r
  where r.relkind in ('r', 'p') and r.rls
    and not exists (select 1 from pol p where p.schemaname = r.schema and p.tablename = r.name)

  union all
  -- 6. A view that runs with its owner's rights skips the base tables' RLS.
  select case when has_table_privilege('anon', oid, 'SELECT') then 'HIGH' else 'MEDIUM' end,
         'view without security_invoker', schema || '.' || name,
         'runs as its owner, so base-table RLS does not apply — safe only if the view filters by auth.uid() itself'
  from rels
  where relkind = 'v'
    and not exists (select 1 from pg_options_to_table(reloptions) o
                    where o.option_name = 'security_invoker' and o.option_value in ('true', 'on', '1'))
    and (has_table_privilege('authenticated', oid, 'SELECT') or has_table_privilege('anon', oid, 'SELECT'))

  union all
  -- 7. Materialized views have no RLS; readable through the API = readable by all.
  select 'HIGH', 'materialized view readable through the API', schema || '.' || name,
         'materialized views have no row-level security'
  from rels
  where relkind = 'm'
    and (has_table_privilege('authenticated', oid, 'SELECT') or has_table_privilege('anon', oid, 'SELECT'))

  union all
  -- 8. SECURITY DEFINER functions the API can call (run with their owner's
  --    rights, so they must check the caller themselves).
  select case when has_function_privilege('anon', oid, 'EXECUTE') then 'HIGH' else 'INFO' end,
         'SECURITY DEFINER function callable through the API', schema || '.' || name || '(' || args || ')',
         'callable by: ' || concat_ws(', ',
           case when has_function_privilege('anon', oid, 'EXECUTE') then 'anon (no session!)' end,
           case when has_function_privilege('authenticated', oid, 'EXECUTE') then 'authenticated' end)
  from fns
  where schema in (select s from api) and definer
    and (has_function_privilege('anon', oid, 'EXECUTE') or has_function_privilege('authenticated', oid, 'EXECUTE'))

  union all
  -- 9. A SECURITY DEFINER function without a pinned search_path can be tricked
  --    into calling an attacker's object of the same name.
  select 'MEDIUM', 'SECURITY DEFINER without search_path', schema || '.' || name || '(' || args || ')',
         'add: set search_path = '''''
  from fns
  where definer
    and schema not in ('pg_catalog', 'information_schema', 'auth', 'storage', 'extensions', 'graphql', 'graphql_public',
                       'realtime', 'supabase_functions', 'vault', 'pgsodium', 'pgsodium_masks', 'net', 'cron', 'pgbouncer',
                       'supabase_migrations', 'pgtle', '_realtime', '_analytics')
    and not exists (select 1 from unnest(coalesce(proconfig, '{}'::text[])) c where c like 'search_path=%')

  union all
  -- 10. Roles that ignore RLS altogether (beyond Supabase's own service roles).
  select 'HIGH', 'role bypasses RLS', rolname, 'reads every row regardless of policies'
  from pg_roles
  where rolbypassrls
    and rolname not in ('postgres', 'supabase_admin', 'service_role', 'supabase_replication_admin', 'supabase_read_only_user',
                        'supabase_storage_admin', 'supabase_auth_admin', 'supabase_realtime_admin', 'supabase_etl_admin',
                        'dashboard_user', 'authenticator')

  union all
  -- 11. Secret-looking columns the API can read.
  select 'HIGH', 'secret column readable through the API', c.table_schema || '.' || c.table_name || '.' || c.column_name,
         'readable by: ' || concat_ws(', ',
           case when has_column_privilege('anon', format('%I.%I', c.table_schema, c.table_name)::regclass, c.column_name, 'SELECT') then 'anon' end,
           case when has_column_privilege('authenticated', format('%I.%I', c.table_schema, c.table_name)::regclass, c.column_name, 'SELECT') then 'authenticated' end)
  from information_schema.columns c
  where c.table_schema in (select s::text from api)
    and c.column_name ~* '(secret|token|password|passwd|api_?key|private_?key)'
    and (has_column_privilege('anon', format('%I.%I', c.table_schema, c.table_name)::regclass, c.column_name, 'SELECT')
      or has_column_privilege('authenticated', format('%I.%I', c.table_schema, c.table_name)::regclass, c.column_name, 'SELECT'))

  union all
  -- 12. Storage buckets anyone can read by URL.
  select 'MEDIUM', 'public storage bucket', 'storage.buckets · ' || id::text, 'files are readable by URL without a session'
  from storage.buckets where public

  union all
  -- 13. THIS PROJECT: the four sample companies are the public demo — anyone
  --     who presses "Open the demo" reads them as a shared demo account. A
  --     real (non-demo) account must never leave data in them.
  select 'HIGH', 'real account''s upload in a public demo company', e.name || ' · ' || b.file_name,
         'uploaded by ' || p.email || ' — every demo visitor can see this file'
  from public.ingest_batches b
  join public.entities e on e.id = b.entity_id and e.is_sample
  join public.profiles p on p.id = b.uploaded_by and not p.is_demo and p.email not like '%@demo.local'

  union all
  select 'HIGH', 'real account''s connector in a public demo company', e.name || ' · ' || c.name,
         'owned by ' || p.email || ' — demo managers can see it'
  from public.connectors c
  join public.entities e on e.id = c.entity_id and e.is_sample
  join public.profiles p on p.id = c.owner_id and not p.is_demo and p.email not like '%@demo.local'

  union all
  -- Real accounts that are still members of the demo companies (registered,
  -- not yet set up their own workspace). Read-only there, and hidden from the
  -- demo's user list — listed so you know who they are.
  select 'INFO', 'real account in a public demo company', p.email,
         p.role::text || ' · member of ' || count(*) || ' demo compan' || case when count(*) = 1 then 'y' else 'ies' end
  from public.entity_members m
  join public.entities e on e.id = m.entity_id and e.is_sample
  join public.profiles p on p.id = m.user_id and not p.is_demo and p.email not like '%@demo.local'
  group by p.email, p.role

  union all
  -- 14. Inventory: every policy on API tables and on storage.
  select 'INFO', 'policy', schemaname || '.' || tablename || ' · ' || policyname,
         case when permissive = 'PERMISSIVE' then '' else 'RESTRICTIVE ' end
         || cmd || ' to ' || array_to_string(roles, ', ')
         || coalesce(' using (' || qual || ')', '') || coalesce(' check (' || with_check || ')', '')
  from pol where schemaname in (select s from api) or schemaname = 'storage'

  union all
  -- 15. Inventory: tables whose changes are broadcast over Realtime.
  select 'INFO', 'realtime table', schemaname || '.' || tablename, 'changes are broadcast; subscribers still pass RLS'
  from pg_publication_tables where pubname = 'supabase_realtime'

  union all
  -- 16. Inventory: scheduled jobs.
  select 'INFO', 'cron job', jobname, schedule || ' · ' || left(regexp_replace(command, '\s+', ' ', 'g'), 140)
  from cron.job
)
select sev as severity, chk as "check", obj as object, detail
from findings
order by case sev when 'HIGH' then 1 when 'MEDIUM' then 2 else 3 end, chk, obj;
