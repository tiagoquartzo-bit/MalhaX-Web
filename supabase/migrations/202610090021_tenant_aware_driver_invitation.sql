-- Driver invitations use the authenticated user's active organization, not a fixed tenant slug.
create or replace function public.provision_invited_driver(
  p_organization_id uuid,
  p_user_id uuid,
  p_actor_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_driver_id uuid;
  v_existing_org uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_organization_id is null or p_user_id is null or p_actor_user_id is null then
    raise exception 'invitation_data_required' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.organizations o
    where o.id = p_organization_id and o.status = 'active'
  ) then
    raise exception 'organization_unavailable' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.organization_members m
    join public.organization_member_roles r
      on r.organization_id = m.organization_id and r.user_id = m.user_id
    join public.profiles p on p.id = m.user_id and p.active
    where m.organization_id = p_organization_id
      and m.user_id = p_actor_user_id and m.status = 'active'
      and r.role = any (array['admin'::public.app_role, 'manager'::public.app_role, 'support'::public.app_role])
  ) then
    raise exception 'invitation_actor_not_allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_user_id) then
    raise exception 'profile_not_found' using errcode = 'P0002';
  end if;

  select m.organization_id into v_existing_org
  from public.organization_members m where m.user_id = p_user_id;
  if v_existing_org is not null and v_existing_org <> p_organization_id then
    raise exception 'user_belongs_to_another_organization' using errcode = '23505';
  end if;

  insert into public.organization_members (organization_id, user_id, status)
  values (p_organization_id, p_user_id, 'active')
  on conflict (organization_id, user_id) do nothing;

  insert into public.organization_member_roles (organization_id, user_id, role, granted_by)
  values (p_organization_id, p_user_id, 'driver'::public.app_role, p_actor_user_id)
  on conflict (organization_id, user_id, role) do nothing;

  select d.id into v_driver_id from public.drivers d where d.profile_id = p_user_id;
  if v_driver_id is null then
    perform set_config('app.trusted_org_id', p_organization_id::text, true);
    insert into public.drivers (profile_id, status, organization_id)
    values (p_user_id, 'invited'::public.driver_status, p_organization_id)
    returning id into v_driver_id;
  elsif not exists (
    select 1 from public.drivers d
    where d.id = v_driver_id and d.organization_id = p_organization_id
      and d.status in ('draft'::public.driver_status, 'invited'::public.driver_status, 'pending_review'::public.driver_status)
  ) then
    raise exception 'driver_already_provisioned' using errcode = '23505';
  end if;

  insert into public.audit_log (actor_user_id, action, entity_table, entity_id, metadata)
  values (
    p_actor_user_id, 'invite_driver', 'drivers', v_driver_id,
    jsonb_build_object('organization_id', p_organization_id, 'role', 'driver')
  );
  return v_driver_id;
end;
$$;

revoke all on function public.provision_invited_driver(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.provision_invited_driver(uuid, uuid, uuid) to service_role;
comment on function public.provision_invited_driver(uuid, uuid, uuid) is
  'Service-role only. Provisions a driver for an active organization after validating the invitation actor membership and role.';

notify pgrst, 'reload schema';
