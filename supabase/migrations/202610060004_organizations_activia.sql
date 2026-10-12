-- Organização inicial Activia e isolamento de dados por empresa.
-- Nova migration: preserve as migrations anteriores e aplique esta somente após revisão.

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  status text not null default 'active' check (status in ('active', 'suspended', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.organizations (name, slug)
values ('Activia', 'activia')
on conflict (slug) do nothing;

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'suspended', 'inactive')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id),
  -- MVP: uma conta pertence a uma empresa; isso evita papéis ambíguos entre tenants.
  unique (user_id)
);

create table public.organization_member_roles (
  organization_id uuid not null,
  user_id uuid not null,
  role public.app_role not null,
  granted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id, role),
  foreign key (organization_id, user_id)
    references public.organization_members(organization_id, user_id) on delete restrict
);

-- Migra contas já existentes para Activia e preserva seus papéis.
insert into public.organization_members (organization_id, user_id)
select o.id, p.id
from public.organizations o cross join public.profiles p
where o.slug = 'activia'
on conflict (user_id) do nothing;

insert into public.organization_member_roles (organization_id, user_id, role, granted_by, created_at)
select m.organization_id, ur.user_id, ur.role, ur.granted_by, ur.created_at
from public.user_roles ur
join public.organization_members m on m.user_id = ur.user_id
on conflict do nothing;

create or replace function public.current_organization_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.organization_id
  from public.organization_members m
  join public.profiles p on p.id = m.user_id and p.active
  join public.organizations o on o.id = m.organization_id and o.status = 'active'
  where m.user_id = (select auth.uid()) and m.status = 'active'
  limit 1;
$$;

create or replace function public.is_organization_member(_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members m
    join public.profiles p on p.id = m.user_id and p.active
    join public.organizations o on o.id = m.organization_id and o.status = 'active'
    where m.organization_id = _organization_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  );
$$;

create or replace function public.has_org_role(_organization_id uuid, _roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_member_roles r
    join public.organization_members m
      on m.organization_id = r.organization_id and m.user_id = r.user_id and m.status = 'active'
    join public.profiles p on p.id = r.user_id and p.active
    where r.organization_id = _organization_id
      and r.user_id = (select auth.uid())
      and r.role = any (_roles)
  );
$$;

create or replace function public.has_any_role(_roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_org_role(public.current_organization_id(), _roles);
$$;

revoke all on function public.current_organization_id() from public, anon;
revoke all on function public.is_organization_member(uuid) from public, anon;
revoke all on function public.has_org_role(uuid, public.app_role[]) from public, anon;
revoke all on function public.has_any_role(public.app_role[]) from public, anon;
grant execute on function public.current_organization_id() to authenticated;
grant execute on function public.is_organization_member(uuid) to authenticated;
grant execute on function public.has_org_role(uuid, public.app_role[]) to authenticated;
grant execute on function public.has_any_role(public.app_role[]) to authenticated;

-- Entidades raiz recebem o tenant; triggers preenchem e validam a organização
-- a partir do usuário autenticado e das relações que já existem nas RPCs.
alter table public.drivers add column organization_id uuid references public.organizations(id) on delete restrict;
alter table public.vehicles add column organization_id uuid references public.organizations(id) on delete restrict;
alter table public.clients add column organization_id uuid references public.organizations(id) on delete restrict;
alter table public.orders add column organization_id uuid references public.organizations(id) on delete restrict;
alter table public.trips add column organization_id uuid references public.organizations(id) on delete restrict;

update public.drivers d set organization_id = o.id from public.organizations o where o.slug = 'activia';
update public.vehicles v set organization_id = o.id from public.organizations o where o.slug = 'activia';
update public.clients c set organization_id = o.id from public.organizations o where o.slug = 'activia';
update public.orders x set organization_id = o.id from public.organizations o where o.slug = 'activia';
update public.trips t set organization_id = o.id from public.organizations o where o.slug = 'activia';

alter table public.drivers alter column organization_id set not null;
alter table public.vehicles alter column organization_id set not null;
alter table public.clients alter column organization_id set not null;
alter table public.orders alter column organization_id set not null;
alter table public.trips alter column organization_id set not null;

-- Compatibilidade com as RPCs existentes. O vínculo único usuário/empresa
-- torna o papel resultante inequívoco; as políticas abaixo também conferem org_id.
create or replace function public.current_driver_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select d.id
  from public.drivers d
  join public.profiles p on p.id = d.profile_id and p.active
  where d.profile_id = (select auth.uid())
    and d.status = 'active'::public.driver_status
    and d.organization_id = public.current_organization_id()
  limit 1;
$$;

create or replace function public.can_access_trip(_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.trips t
    where t.id = _trip_id
      and t.driver_id = public.current_driver_id()
      and t.organization_id = public.current_organization_id()
  );
$$;


create index drivers_org_status_idx on public.drivers (organization_id, status);
create index vehicles_org_active_idx on public.vehicles (organization_id, active);
create index clients_org_active_idx on public.clients (organization_id, active);
create index orders_org_status_created_idx on public.orders (organization_id, status, created_at desc);
create index trips_org_status_created_idx on public.trips (organization_id, status, created_at desc);

create or replace function public.assign_driver_organization()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_org uuid := public.current_organization_id();
begin
  if tg_op = 'INSERT' then
    if v_org is null then raise exception 'organization_required' using errcode = '42501'; end if;
    new.organization_id := v_org;
  elsif new.organization_id is distinct from old.organization_id then
    raise exception 'organization_immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.assign_vehicle_organization()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_org uuid := public.current_organization_id();
begin
  if tg_op = 'INSERT' then
    if v_org is null then raise exception 'organization_required' using errcode = '42501'; end if;
    new.organization_id := v_org;
  elsif new.organization_id is distinct from old.organization_id then
    raise exception 'organization_immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.assign_client_organization()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_org uuid := public.current_organization_id();
begin
  if tg_op = 'INSERT' then
    if v_org is null then raise exception 'organization_required' using errcode = '42501'; end if;
    new.organization_id := v_org;
  elsif new.organization_id is distinct from old.organization_id then
    raise exception 'organization_immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.assign_order_organization()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_user_org uuid := public.current_organization_id();
begin
  select c.organization_id into v_org from public.clients c where c.id = new.client_id;
  if v_org is null or (v_user_org is not null and v_org <> v_user_org) then
    raise exception 'client_outside_organization' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then new.organization_id := v_org;
  elsif new.organization_id is distinct from old.organization_id or new.organization_id <> v_org then
    raise exception 'organization_immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.assign_trip_organization()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_vehicle_org uuid; v_user_org uuid := public.current_organization_id();
begin
  select d.organization_id into v_org from public.drivers d where d.id = new.driver_id;
  if new.vehicle_id is not null then
    select v.organization_id into v_vehicle_org from public.vehicles v where v.id = new.vehicle_id;
  end if;
  if v_org is null or (v_user_org is not null and v_org <> v_user_org)
     or (new.vehicle_id is not null and v_vehicle_org is distinct from v_org) then
    raise exception 'driver_or_vehicle_outside_organization' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then new.organization_id := v_org;
  elsif new.organization_id is distinct from old.organization_id or new.organization_id <> v_org then
    raise exception 'organization_immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger drivers_set_organization before insert or update of organization_id on public.drivers
  for each row execute function public.assign_driver_organization();
create trigger vehicles_set_organization before insert or update of organization_id on public.vehicles
  for each row execute function public.assign_vehicle_organization();
create trigger clients_set_organization before insert or update of organization_id on public.clients
  for each row execute function public.assign_client_organization();
create trigger orders_set_organization before insert or update of organization_id, client_id on public.orders
  for each row execute function public.assign_order_organization();
create trigger trips_set_organization before insert or update of organization_id, driver_id, vehicle_id on public.trips
  for each row execute function public.assign_trip_organization();

-- Não permitir que uma parada conecte dados de organizações diferentes.
create or replace function public.validate_stop_order_organization()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_trip_org uuid; v_order_org uuid; v_user_org uuid := public.current_organization_id();
begin
  select t.organization_id into v_trip_org from public.trip_stops s join public.trips t on t.id = s.trip_id where s.id = new.stop_id;
  select o.organization_id into v_order_org from public.orders o where o.id = new.order_id;
  if v_trip_org is null or v_trip_org is distinct from v_order_org
     or (v_user_org is not null and v_trip_org <> v_user_org) then
    raise exception 'stop_order_organization_mismatch' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger stop_orders_validate_organization before insert or update on public.stop_orders
  for each row execute function public.validate_stop_order_organization();

create or replace function public.validate_stop_package_organization()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_trip_org uuid; v_package_org uuid; v_user_org uuid := public.current_organization_id();
begin
  select t.organization_id into v_trip_org from public.trip_stops s join public.trips t on t.id = s.trip_id where s.id = new.stop_id;
  select o.organization_id into v_package_org from public.packages p join public.orders o on o.id = p.order_id where p.id = new.package_id;
  if v_trip_org is null or v_trip_org is distinct from v_package_org
     or (v_user_org is not null and v_trip_org <> v_user_org) then
    raise exception 'stop_package_organization_mismatch' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger stop_packages_validate_organization before insert or update on public.stop_packages
  for each row execute function public.validate_stop_package_organization();

revoke all on function public.assign_driver_organization() from public, anon, authenticated;
revoke all on function public.assign_vehicle_organization() from public, anon, authenticated;
revoke all on function public.assign_client_organization() from public, anon, authenticated;
revoke all on function public.assign_order_organization() from public, anon, authenticated;
revoke all on function public.assign_trip_organization() from public, anon, authenticated;
revoke all on function public.validate_stop_order_organization() from public, anon, authenticated;
revoke all on function public.validate_stop_package_organization() from public, anon, authenticated;

-- RLS nas tabelas raiz sempre compara organização e papel. Dados relacionados
-- seguem o tenant por suas relações, com consulta limitada ao trip/order da empresa.
create policy organizations_read_member on public.organizations
  for select to authenticated using (public.is_organization_member(id));
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.organization_member_roles enable row level security;
revoke all on public.organizations, public.organization_members, public.organization_member_roles from anon, authenticated;
grant select on public.organizations, public.organization_members, public.organization_member_roles to authenticated;
create policy organization_members_read_self_or_ops on public.organization_members
  for select to authenticated using (
    user_id = (select auth.uid()) or public.has_org_role(organization_id, array['admin'::public.app_role, 'manager'::public.app_role, 'support'::public.app_role])
  );
create policy organization_roles_read_self_or_ops on public.organization_member_roles
  for select to authenticated using (
    user_id = (select auth.uid()) or public.has_org_role(organization_id, array['admin'::public.app_role, 'manager'::public.app_role, 'support'::public.app_role])
  );

-- A tabela antiga fica sem acesso pela API; organization_member_roles passa a ser a fonte oficial.
drop policy if exists user_roles_read_self_or_admin on public.user_roles;
revoke all on public.user_roles from anon, authenticated;

-- Substitui as políticas existentes (permissive policies se combinariam com OR).
drop policy if exists profiles_read_self_or_ops on public.profiles;
drop policy if exists drivers_read_self_or_ops on public.drivers;
drop policy if exists vehicles_read_ops_or_assigned on public.vehicles;
drop policy if exists driver_documents_read_owner_or_reviewers on public.driver_documents;
drop policy if exists clients_read_ops_or_assigned on public.clients;
drop policy if exists orders_read_ops_or_assigned on public.orders;
drop policy if exists packages_read_ops_or_assigned on public.packages;
drop policy if exists trips_read_ops_or_assigned on public.trips;
drop policy if exists trip_stops_read_ops_or_assigned on public.trip_stops;
drop policy if exists stop_orders_read_ops_or_assigned on public.stop_orders;
drop policy if exists stop_packages_read_ops_or_assigned on public.stop_packages;
drop policy if exists stop_events_read_ops_or_assigned on public.stop_events;
drop policy if exists proofs_read_ops_or_assigned on public.delivery_proofs;
drop policy if exists tracking_read_ops_or_owner on public.tracking_positions;
drop policy if exists incidents_read_ops_or_assigned on public.incidents;
drop policy if exists audit_log_read_admin_manager on public.audit_log;

create policy profiles_read_self_or_ops on public.profiles for select to authenticated using (
  id = (select auth.uid()) or exists (
    select 1 from public.drivers d
    where d.profile_id = profiles.id and d.organization_id = public.current_organization_id()
  ) and public.has_any_role(array['admin'::public.app_role, 'manager'::public.app_role, 'dispatcher'::public.app_role, 'support'::public.app_role, 'finance'::public.app_role])
  or exists (
    select 1 from public.organization_members m
    where m.user_id = profiles.id and m.organization_id = public.current_organization_id()
  ) and public.has_any_role(array['admin'::public.app_role, 'manager'::public.app_role, 'dispatcher'::public.app_role, 'support'::public.app_role, 'finance'::public.app_role])
);

create policy drivers_read_self_or_ops on public.drivers for select to authenticated using (
  organization_id = public.current_organization_id() and
  (profile_id = (select auth.uid()) or public.has_org_role(organization_id, array['admin'::public.app_role, 'manager'::public.app_role, 'dispatcher'::public.app_role, 'support'::public.app_role]))
);
create policy vehicles_read_ops_or_assigned on public.vehicles for select to authenticated using (
  organization_id = public.current_organization_id() and (
    public.has_org_role(organization_id, array['admin'::public.app_role, 'manager'::public.app_role, 'dispatcher'::public.app_role, 'support'::public.app_role])
    or exists (select 1 from public.trips t where t.vehicle_id = vehicles.id and t.driver_id = public.current_driver_id() and t.organization_id = vehicles.organization_id)
  )
);
create policy driver_documents_read_owner_or_reviewers on public.driver_documents for select to authenticated using (
  exists (select 1 from public.drivers d where d.id = driver_documents.driver_id and d.organization_id = public.current_organization_id() and (
    d.profile_id = (select auth.uid()) or public.has_org_role(d.organization_id, array['admin'::public.app_role, 'manager'::public.app_role])
  ))
);
create policy clients_read_ops_or_assigned on public.clients for select to authenticated using (
  organization_id = public.current_organization_id() and (
    public.has_org_role(organization_id, array['admin'::public.app_role, 'manager'::public.app_role, 'dispatcher'::public.app_role, 'support'::public.app_role])
    or public.can_access_client(id)
  )
);
create policy orders_read_ops_or_assigned on public.orders for select to authenticated using (
  organization_id = public.current_organization_id() and (
    public.has_org_role(organization_id, array['admin'::public.app_role, 'manager'::public.app_role, 'dispatcher'::public.app_role, 'support'::public.app_role])
    or public.can_access_order(id)
  )
);
create policy packages_read_ops_or_assigned on public.packages for select to authenticated using (
  exists (select 1 from public.orders o where o.id = packages.order_id and o.organization_id = public.current_organization_id() and (
    public.has_org_role(o.organization_id, array['admin'::public.app_role, 'manager'::public.app_role, 'dispatcher'::public.app_role, 'support'::public.app_role])
    or public.can_access_order(o.id)
  ))
);
create policy trips_read_ops_or_assigned on public.trips for select to authenticated using (
  organization_id = public.current_organization_id() and (
    public.has_org_role(organization_id, array['admin'::public.app_role, 'manager'::public.app_role, 'dispatcher'::public.app_role, 'support'::public.app_role, 'finance'::public.app_role])
    or driver_id = public.current_driver_id()
  )
);
create policy trip_stops_read_ops_or_assigned on public.trip_stops for select to authenticated using (
  exists (select 1 from public.trips t where t.id = trip_stops.trip_id and t.organization_id = public.current_organization_id() and (
    public.has_org_role(t.organization_id, array['admin'::public.app_role, 'manager'::public.app_role, 'dispatcher'::public.app_role, 'support'::public.app_role])
    or public.can_access_trip(t.id)
  ))
);
create policy stop_orders_read_ops_or_assigned on public.stop_orders for select to authenticated using (
  exists (select 1 from public.trip_stops s join public.trips t on t.id = s.trip_id where s.id = stop_orders.stop_id and t.organization_id = public.current_organization_id() and (
    public.has_org_role(t.organization_id, array['admin'::public.app_role, 'manager'::public.app_role, 'dispatcher'::public.app_role, 'support'::public.app_role]) or public.can_access_trip(t.id)
  ))
);
create policy stop_packages_read_ops_or_assigned on public.stop_packages for select to authenticated using (
  exists (select 1 from public.trip_stops s join public.trips t on t.id = s.trip_id where s.id = stop_packages.stop_id and t.organization_id = public.current_organization_id() and (
    public.has_org_role(t.organization_id, array['admin'::public.app_role, 'manager'::public.app_role, 'dispatcher'::public.app_role, 'support'::public.app_role]) or public.can_access_trip(t.id)
  ))
);
create policy stop_events_read_ops_or_assigned on public.stop_events for select to authenticated using (
  exists (select 1 from public.trip_stops s join public.trips t on t.id = s.trip_id where s.id = stop_events.stop_id and t.organization_id = public.current_organization_id() and (
    public.has_org_role(t.organization_id, array['admin'::public.app_role, 'manager'::public.app_role, 'dispatcher'::public.app_role, 'support'::public.app_role]) or public.can_access_trip(t.id)
  ))
);
create policy proofs_read_ops_or_assigned on public.delivery_proofs for select to authenticated using (
  exists (select 1 from public.trip_stops s join public.trips t on t.id = s.trip_id where s.id = delivery_proofs.stop_id and t.organization_id = public.current_organization_id() and (
    public.has_org_role(t.organization_id, array['admin'::public.app_role, 'manager'::public.app_role, 'dispatcher'::public.app_role, 'support'::public.app_role]) or public.can_access_trip(t.id)
  ))
);
create policy tracking_read_ops_or_owner on public.tracking_positions for select to authenticated using (
  exists (select 1 from public.trips t where t.id = tracking_positions.trip_id and t.organization_id = public.current_organization_id() and (
    public.has_org_role(t.organization_id, array['admin'::public.app_role, 'manager'::public.app_role, 'dispatcher'::public.app_role, 'support'::public.app_role]) or tracking_positions.driver_id = public.current_driver_id()
  ))
);
create policy incidents_read_ops_or_assigned on public.incidents for select to authenticated using (
  exists (select 1 from public.trips t where t.id = incidents.trip_id and t.organization_id = public.current_organization_id() and (
    public.has_org_role(t.organization_id, array['admin'::public.app_role, 'manager'::public.app_role, 'dispatcher'::public.app_role, 'support'::public.app_role]) or public.can_access_trip(t.id)
  ))
);
create policy audit_log_read_admin_manager on public.audit_log for select to authenticated using (
  public.has_any_role(array['admin'::public.app_role, 'manager'::public.app_role]) and (
    (entity_table = 'orders' and exists (select 1 from public.orders o where o.id = audit_log.entity_id and o.organization_id = public.current_organization_id()))
    or (entity_table = 'trips' and exists (select 1 from public.trips t where t.id = audit_log.entity_id and t.organization_id = public.current_organization_id()))
  )
);

-- Parada e ordem permanecem consistentes também se uma RPC tentar misturar tenants.
comment on table public.organizations is 'Empresas/tenants do sistema; Activia é a organização inicial.';
comment on table public.organization_members is 'Vínculo de usuário com organização; no MVP cada usuário pertence a uma única empresa.';
comment on table public.organization_member_roles is 'Papéis operacionais vinculados ao tenant.';

