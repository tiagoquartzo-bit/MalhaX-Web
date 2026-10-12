-- Provisionamento seguro de contas de motorista por convite Supabase Auth.

-- Toda conta Auth recebe um perfil mínimo; dados extras vêm do fluxo administrativo
-- de convite e o próprio motorista poderá complementar o cadastro depois.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), nullif(new.email, ''), 'Usuário'),
    nullif(btrim(new.raw_user_meta_data ->> 'phone'), '')
  );
  return new;
end;
$$;

revoke all on function public.handle_new_auth_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert on auth.users
for each row execute function public.handle_new_auth_user();

-- Convites são criados exclusivamente por uma Supabase Edge Function autenticada
-- que mantém a service_role fora do navegador e confirma admin/support antes.
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

  if not exists (
    select 1 from public.organizations o
    where o.id = p_organization_id and o.slug = 'activia' and o.status = 'active'
  ) then
    raise exception 'organization_unavailable' using errcode = '22023';
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
    where d.id = v_driver_id
      and d.organization_id = p_organization_id
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

-- Permite que a função confiável de provisionamento defina o tenant do novo motorista.
-- Chamadas normais de usuários seguem derivando o tenant do membership autenticado.
create or replace function public.assign_driver_organization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := coalesce(
    public.current_organization_id(),
    nullif(current_setting('app.trusted_org_id', true), '')::uuid
  );
begin
  if tg_op = 'INSERT' then
    if v_org is null or (new.organization_id is not null and new.organization_id <> v_org) then
      raise exception 'organization_required' using errcode = '42501';
    end if;
    new.organization_id := v_org;
  elsif new.organization_id is distinct from old.organization_id then
    raise exception 'organization_immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.assign_driver_organization() from public, anon, authenticated;

-- Torna os eventos de convite visíveis somente para admin/gestor da mesma organização.
drop policy if exists audit_log_read_admin_manager on public.audit_log;
create policy audit_log_read_admin_manager on public.audit_log for select to authenticated using (
  public.has_org_role(public.current_organization_id(), array['admin'::public.app_role, 'manager'::public.app_role, 'support'::public.app_role]) and (
    (entity_table = 'orders' and exists (select 1 from public.orders o where o.id = audit_log.entity_id and o.organization_id = public.current_organization_id()))
    or (entity_table = 'trips' and exists (select 1 from public.trips t where t.id = audit_log.entity_id and t.organization_id = public.current_organization_id()))
    or (entity_table = 'drivers' and exists (select 1 from public.drivers d where d.id = audit_log.entity_id and d.organization_id = public.current_organization_id()))
  )
);

comment on function public.provision_invited_driver(uuid, uuid, uuid) is
  'Service-role only. Creates Activia membership, driver role and invited driver profile after Auth invite.';

