-- Controlled driver lifecycle: status changes are audited and never delete history.
create or replace function public.set_driver_status(
  p_driver_id uuid,
  p_new_status public.driver_status,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_org uuid := public.current_organization_id();
  v_old_status public.driver_status;
  v_profile_id uuid;
  v_reason text := nullif(btrim(p_reason), '');
begin
  if v_actor is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if v_org is null or not public.has_org_role(
    v_org, array['admin'::public.app_role, 'manager'::public.app_role, 'support'::public.app_role]
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_reason is null or length(v_reason) > 500 then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  if p_new_status not in (
    'active'::public.driver_status,
    'suspended'::public.driver_status,
    'inactive'::public.driver_status,
    'rejected'::public.driver_status
  ) then
    raise exception 'driver_status_not_managed_here' using errcode = '22023';
  end if;

  select d.status, d.profile_id into v_old_status, v_profile_id
  from public.drivers d
  where d.id = p_driver_id and d.organization_id = v_org
  for update;
  if not found then
    raise exception 'driver_not_found' using errcode = 'P0002';
  end if;

  -- Safe retry: a repeated request that already reached its target is a no-op.
  if v_old_status = p_new_status then
    return p_driver_id;
  end if;

  if not (
    (v_old_status in ('draft'::public.driver_status, 'invited'::public.driver_status, 'pending_review'::public.driver_status)
      and p_new_status in ('active'::public.driver_status, 'rejected'::public.driver_status, 'inactive'::public.driver_status))
    or (v_old_status = 'active'::public.driver_status
      and p_new_status in ('suspended'::public.driver_status, 'inactive'::public.driver_status))
    or (v_old_status in ('suspended'::public.driver_status, 'inactive'::public.driver_status)
      and p_new_status = 'active'::public.driver_status)
  ) then
    raise exception 'invalid_driver_status_transition' using errcode = '22023';
  end if;

  if p_new_status = 'active'::public.driver_status and not exists (
    select 1 from auth.users u where u.id = v_profile_id and u.email_confirmed_at is not null
  ) then
    raise exception 'driver_email_not_confirmed' using errcode = '22023';
  end if;

  if p_new_status in ('suspended'::public.driver_status, 'inactive'::public.driver_status, 'rejected'::public.driver_status)
     and exists (
       select 1 from public.trips t
       where t.driver_id = p_driver_id
         and t.organization_id = v_org
         and t.status in (
           'assigned'::public.trip_status, 'accepted'::public.trip_status,
           'in_progress'::public.trip_status, 'paused'::public.trip_status
         )
     ) then
    raise exception 'driver_has_active_trip' using errcode = '22023';
  end if;

  update public.drivers
  set status = p_new_status,
      approved_by = case when p_new_status = 'active'::public.driver_status then v_actor else approved_by end,
      approved_at = case when p_new_status = 'active'::public.driver_status then now() else approved_at end,
      updated_at = now()
  where id = p_driver_id;

  update public.profiles
  set active = (p_new_status = 'active'::public.driver_status),
      updated_at = now()
  where id = v_profile_id;

  insert into public.audit_log (actor_user_id, action, entity_table, entity_id, reason, metadata)
  values (
    v_actor, 'driver_status_changed', 'drivers', p_driver_id, v_reason,
    jsonb_build_object('organization_id', v_org, 'from_status', v_old_status, 'to_status', p_new_status)
  );

  return p_driver_id;
end;
$$;

revoke all on function public.set_driver_status(uuid, public.driver_status, text) from public, anon;
grant execute on function public.set_driver_status(uuid, public.driver_status, text) to authenticated;

comment on function public.set_driver_status(uuid, public.driver_status, text) is
  'Admin/manager/support lifecycle operation. Requires a reason, confirmed email for activation, no active trip for deactivation, and writes an audit event.';
