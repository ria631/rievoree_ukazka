-- ============================================================================
-- Migration 35 — tour_feedback (soft feedback capture from the guided tour)
--
-- Same integrity stance as leads (migration 19): writes allowed, reads not.
--   * INSERT: anyone (anon or signed-in) may leave feedback — no gate.
--   * SELECT/UPDATE/DELETE: nobody via the API (no SELECT policy → unreadable
--     through PostgREST). The owner reads it via service_role / the dashboard.
-- ============================================================================
create table public.tour_feedback (
  id         bigint generated always as identity primary key,
  helpful    boolean,                                  -- 👍 true / 👎 false / null
  note       text check (note is null or length(note) <= 2000),
  step       text,                                     -- where they left it
  created_at timestamptz not null default now()
);

alter table public.tour_feedback enable row level security;

create policy tour_feedback_insert on public.tour_feedback
  for insert to anon, authenticated
  with check (true);

revoke all on public.tour_feedback from anon, authenticated;
grant insert on public.tour_feedback to anon, authenticated;

comment on table public.tour_feedback is
  'Soft guided-tour feedback. INSERT-only for anon/authenticated; no SELECT policy so it is never API-readable. Owner reads via service_role.';
