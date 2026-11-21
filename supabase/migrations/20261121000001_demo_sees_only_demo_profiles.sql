-- ============================================================================
-- Demo identities see only demo identities in the user list.
--
-- The shared demo admin (admin@demo.local) has a public password. As a member
-- of the four sample companies it may list "its company" — and that list used
-- to include every REAL account that had also joined a sample company, e-mail
-- and MFA state included. A demo caller now gets demo profiles (and itself)
-- only; real admins and super admins are unaffected.
--
-- Re-creates list_org_members() from 20260629000001 with one extra predicate.
-- Test: supabase/tests/demo_members_privacy_test.sql
-- ============================================================================

create or replace function public.list_org_members()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_super  boolean := (select private.is_super_admin());
  v_role   public.app_role := (select private.user_role());
  v_demo   boolean := (select private.is_demo_user());
  v_result jsonb;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if not (v_super or v_role = 'admin') then
    raise exception 'admin only' using errcode = '42501';
  end if;

  with visible_entities as (
    -- Entities whose membership the caller may see: all (super) or the caller's own.
    select e.id, e.name
    from public.entities e
    where v_super
       or e.id in (select private.my_entity_ids())
  ),
  visible_users as (
    select p.id from public.profiles p where v_super
    union
    -- Company members: anyone sharing a visible entity with the caller —
    -- except that a shared demo identity only ever sees other demo identities.
    select em.user_id
    from public.entity_members em
    join visible_entities ve on ve.id = em.entity_id
    join public.profiles mp on mp.id = em.user_id
    where not v_demo or mp.is_demo
    union
    select v_uid
  ),
  per_user_entities as (
    select em.user_id,
           jsonb_agg(jsonb_build_object('id', ve.id, 'name', ve.name) order by ve.name) as entities
    from public.entity_members em
    join visible_entities ve on ve.id = em.entity_id
    group by em.user_id
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', p.id,
      'email', p.email,
      'full_name', p.full_name,
      'role', p.role,
      'is_active', p.is_active,
      'is_self', (p.id = v_uid),
      'can_manage', (p.id <> v_uid and (select public.can_manage_user(p.id))),
      'mfa_verified', exists (
        select 1 from auth.mfa_factors f
        where f.user_id = p.id and f.status = 'verified'
      ),
      'entities', coalesce(pue.entities, '[]'::jsonb),
      'created_at', p.created_at
    ) order by p.created_at
  ), '[]'::jsonb)
  into v_result
  from public.profiles p
  join visible_users vu on vu.id = p.id
  left join per_user_entities pue on pue.user_id = p.id;

  return v_result;
end;
$$;

revoke all on function public.list_org_members() from public, anon;
grant execute on function public.list_org_members() to authenticated;

comment on function public.list_org_members() is
  'Admin user list. super_admin → all profiles; admin → company (users sharing an entity); a demo identity → demo profiles only. Carries can_manage + MFA state per row.';
