-- ============================================================================
-- Migration 36 — demo accounts can VIEW the ingest pipeline but not WRITE it
--
-- The guided tour signs in as the manager demo account to SHOW the Ingest page
-- (the flagged batch, the upload form) — so uploads and approvals must be
-- blocked for ANY demo account at the data layer, or a visitor could pollute
-- the shared showcase books. Enforced with BEFORE INSERT triggers rather than
-- by editing the big submit_batch / approve_batch functions:
--   * ingest_batches  → blocks uploads (submit_batch)
--   * journal_entries → blocks loads    (approve_batch → load_batch)
--
-- Legit paths are unaffected: provision_account / create_my_entity insert as the
-- (non-demo) registered user, and the seed runs as postgres (auth.uid() null).
-- ============================================================================
create or replace function private.block_demo_writes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select private.is_demo_user()) then
    raise exception 'the shared demo account is read-only — register to upload and approve'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists ingest_batches_block_demo on public.ingest_batches;
create trigger ingest_batches_block_demo
  before insert on public.ingest_batches
  for each row execute function private.block_demo_writes();

drop trigger if exists journal_entries_block_demo on public.journal_entries;
create trigger journal_entries_block_demo
  before insert on public.journal_entries
  for each row execute function private.block_demo_writes();
