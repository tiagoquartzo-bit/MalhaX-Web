-- Cadastro seguro de frota por organização, com categoria operacional e idempotência.
alter table public.vehicles
  add column vehicle_type text not null default 'car',
  add column creation_request_id uuid,
  add column creation_request_fingerprint text,
  add constraint vehicles_type_check check (vehicle_type in ('car', 'motorcycle', 'truck')),
  add constraint vehicles_creation_request_pair_check
    check ((creation_request_id is null) = (creation_request_fingerprint is null));

-- Placas são únicas dentro da empresa, e não globalmente entre tenants.
alter table public.vehicles drop constraint if exists vehicles_plate_key;
create unique index vehicles_org_plate_uidx
  on public.vehicles (organization_id, upper(plate));
create unique index vehicles_org_creation_request_uidx
  on public.vehicles (organization_id, creation_request_id)
  where creation_request_id is not null;

-- Permite consultar a auditoria de frota a administradores e gestores da empresa.
drop policy if exists audit_log_read_admin_manager on public.audit_log;
create policy audit_log_read_admin_manager on public.audit_log for select to authenticated using (
  public.has_any_role(array['admin'::public.app_role, 'manager'::public.app_role]) and (
    (entity_table = 'orders' and exists (
      select 1 from public.orders o where o.id = audit_log.entity_id and o.organization_id = public.current_organization_id()
    ))
    or (entity_table = 'trips' and exists (
      select 1 from public.trips t where t.id = audit_log.entity_id and t.organization_id = public.current_organization_id()
    ))
    or (entity_table = 'drivers' and exists (
      select 1 from public.drivers d where d.id = audit_log.entity_id and d.organization_id = public.current_organization_id()
    ))
    or (entity_table = 'clients' and exists (
      select 1 from public.clients c where c.id = audit_log.entity_id and c.organization_id = public.current_organization_id()
    ))
    or (entity_table = 'vehicles' and exists (
      select 1 from public.vehicles v where v.id = audit_log.entity_id and v.organization_id = public.current_organization_id()
    ))
  )
);

create or replace function public.create_vehicle(
  p_request_id uuid,
  p_plate text,
  p_vehicle_type text,
  p_make_model text default null,
  p_capacity_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_org_id uuid := public.current_organization_id();
  v_plate text := regexp_replace(upper(btrim(coalesce(p_plate, ''))), '[^A-Z0-9]', '', 'g');
  v_make_model text := nullif(btrim(p_make_model), '');
  v_capacity text := nullif(btrim(p_capacity_description), '');
  v_fingerprint text;
  v_vehicle_id uuid;
  v_existing_fingerprint text;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if v_org_id is null then raise exception 'organization_required' using errcode = '42501'; end if;
  if not public.has_any_role(array['admin', 'manager', 'support']::public.app_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_request_id is null then raise exception 'request_id_required' using errcode = '22023'; end if;
  if v_plate !~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$'
     or p_vehicle_type not in ('car', 'motorcycle', 'truck')
     or length(coalesce(v_make_model, '')) > 120
     or length(coalesce(v_capacity, '')) > 160 then
    raise exception 'invalid_vehicle_data' using errcode = '22023';
  end if;

  v_fingerprint := encode(extensions.digest(jsonb_build_object(
    'plate', v_plate, 'vehicle_type', p_vehicle_type,
    'make_model', v_make_model, 'capacity_description', v_capacity
  )::text, 'sha256'), 'hex');

  select v.id, v.creation_request_fingerprint into v_vehicle_id, v_existing_fingerprint
  from public.vehicles v
  where v.organization_id = v_org_id and v.creation_request_id = p_request_id;
  if found then
    if v_existing_fingerprint is distinct from v_fingerprint then
      raise exception 'request_id_conflict' using errcode = '23505';
    end if;
    return v_vehicle_id;
  end if;

  if exists (select 1 from public.vehicles v where v.organization_id = v_org_id and upper(v.plate) = v_plate) then
    raise exception 'vehicle_plate_already_exists' using errcode = '23505';
  end if;

  insert into public.vehicles (
    organization_id, plate, vehicle_type, make_model, capacity_description,
    active, creation_request_id, creation_request_fingerprint
  ) values (
    v_org_id, v_plate, p_vehicle_type, v_make_model, v_capacity,
    true, p_request_id, v_fingerprint
  ) returning id into v_vehicle_id;

  insert into public.audit_log (actor_user_id, action, entity_table, entity_id, metadata)
  values (v_uid, 'create_vehicle', 'vehicles', v_vehicle_id,
    jsonb_build_object('organization_id', v_org_id, 'vehicle_type', p_vehicle_type));

  return v_vehicle_id;
end;
$$;

revoke all on function public.create_vehicle(uuid, text, text, text, text) from public, anon;
grant execute on function public.create_vehicle(uuid, text, text, text, text) to authenticated;
comment on function public.create_vehicle(uuid, text, text, text, text) is
  'Creates an organization-scoped vehicle with validated plate/category, idempotent retries, and audit logging.';

