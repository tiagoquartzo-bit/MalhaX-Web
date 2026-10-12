-- Staff invitations are scoped to one active organization and cannot elevate the inviter.
create or replace function public.provision_invited_staff(
  p_organization_id uuid,
  p_user_id uuid,
  p_actor_user_id uuid,
  p_role public.app_role
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_admin boolean;
  v_is_manager boolean;
  v_existing_org uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_organization_id is null or p_user_id is null or p_actor_user_id is null then
    raise exception 'invitation_data_required' using errcode = '22023';
  end if;
  if p_role not in ('manager'::public.app_role, 'dispatcher'::public.app_role, 'support'::public.app_role, 'finance'::public.app_role) then
    raise exception 'staff_role_not_invitable' using errcode = '22023';
  end if;
  if not exists (select 1 from public.organizations o where o.id = p_organization_id and o.status = 'active') then
    raise exception 'organization_unavailable' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_user_id) then
    raise exception 'profile_not_found' using errcode = 'P0002';
  end if;

  select exists (
    select 1 from public.organization_members m
    join public.organization_member_roles r on r.organization_id = m.organization_id and r.user_id = m.user_id
    join public.profiles p on p.id = m.user_id and p.active
    where m.organization_id = p_organization_id and m.user_id = p_actor_user_id and m.status = 'active'
      and r.role = 'admin'::public.app_role
  ), exists (
    select 1 from public.organization_members m
    join public.organization_member_roles r on r.organization_id = m.organization_id and r.user_id = m.user_id
    join public.profiles p on p.id = m.user_id and p.active
    where m.organization_id = p_organization_id and m.user_id = p_actor_user_id and m.status = 'active'
      and r.role = 'manager'::public.app_role
  ) into v_is_admin, v_is_manager;

  if not v_is_admin and not v_is_manager then
    raise exception 'invitation_actor_not_allowed' using errcode = '42501';
  end if;
  if not v_is_admin and p_role not in ('dispatcher'::public.app_role, 'support'::public.app_role) then
    raise exception 'role_escalation_denied' using errcode = '42501';
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
  values (p_organization_id, p_user_id, p_role, p_actor_user_id)
  on conflict (organization_id, user_id, role) do nothing;

  insert into public.audit_log (actor_user_id, action, entity_table, entity_id, metadata)
  values (
    p_actor_user_id, 'invite_staff_role', 'organization_member_roles', p_user_id,
    jsonb_build_object('organization_id', p_organization_id, 'role', p_role)
  );
end;
$$;

revoke all on function public.provision_invited_staff(uuid, uuid, uuid, public.app_role) from public, anon, authenticated;
grant execute on function public.provision_invited_staff(uuid, uuid, uuid, public.app_role) to service_role;

create policy audit_log_read_member_role_events on public.audit_log
for select to authenticated using (
  entity_table = 'organization_member_roles'
  and public.has_org_role(
    public.current_organization_id(),
    array['admin'::public.app_role, 'manager'::public.app_role]
  )
  and exists (
    select 1 from public.organization_member_roles r
    where r.organization_id = public.current_organization_id() and r.user_id = audit_log.entity_id
  )
);

comment on function public.provision_invited_staff(uuid, uuid, uuid, public.app_role) is
  'Service-role only. Provisions backoffice roles within one active organization; managers may grant dispatcher or support only, admins may additionally grant manager or finance.';

notify pgrst, 'reload schema';
