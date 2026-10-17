-- 032: garantias de regra de negócio no banco (auditoria de 17/10/2026)
-- 1. Coleta antes da entrega no despacho e na execução.
-- 2. Viagem precisa ser aceita antes da execução; nova RPC start_trip libera o GPS a caminho da 1ª parada.
-- 3. Previsão (planned_at) por parada gravada no despacho.
-- 4. Conferência dos códigos dos volumes obrigatória para concluir coleta/entrega.
-- 5. Capacidade do veículo em kg validada no despacho.
-- 6. Pedido exige peso, coordenadas e exatamente uma coleta e uma entrega por volume.
-- 7. Pausar, retomar, cancelar e reatribuir viagem; cancelar pedido. Tudo com motivo e auditoria.

alter table public.vehicles add column if not exists capacity_kg numeric(10,2);
alter table public.vehicles drop constraint if exists vehicles_capacity_kg_check;
alter table public.vehicles add constraint vehicles_capacity_kg_check check (capacity_kg is null or (capacity_kg > 0 and capacity_kg <= 100000));

alter table public.stop_packages add column if not exists confirmed_at timestamptz;
alter table public.stop_packages add column if not exists confirmed_by uuid references auth.users(id);

drop function if exists public.create_vehicle(uuid, text, text, text, text);
CREATE OR REPLACE FUNCTION public.create_vehicle(p_request_id uuid, p_plate text, p_vehicle_type text, p_make_model text DEFAULT NULL::text, p_capacity_description text DEFAULT NULL::text, p_capacity_kg numeric DEFAULT NULL::numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
     or length(coalesce(v_capacity, '')) > 160
     or (p_capacity_kg is not null and (p_capacity_kg <= 0 or p_capacity_kg > 100000)) then
    raise exception 'invalid_vehicle_data' using errcode = '22023';
  end if;

  v_fingerprint := encode(extensions.digest(jsonb_build_object(
    'plate', v_plate, 'vehicle_type', p_vehicle_type,
    'make_model', v_make_model, 'capacity_description', v_capacity, 'capacity_kg', p_capacity_kg
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
    organization_id, plate, vehicle_type, make_model, capacity_description, capacity_kg,
    active, creation_request_id, creation_request_fingerprint
  ) values (
    v_org_id, v_plate, p_vehicle_type, v_make_model, v_capacity, p_capacity_kg,
    true, p_request_id, v_fingerprint
  ) returning id into v_vehicle_id;

  insert into public.audit_log (actor_user_id, action, entity_table, entity_id, metadata)
  values (v_uid, 'create_vehicle', 'vehicles', v_vehicle_id,
    jsonb_build_object('organization_id', v_org_id, 'vehicle_type', p_vehicle_type));

  return v_vehicle_id;
end;
$function$;
revoke all on function public.create_vehicle(uuid, text, text, text, text, numeric) from public, anon;
grant execute on function public.create_vehicle(uuid, text, text, text, text, numeric) to authenticated;

CREATE OR REPLACE FUNCTION public.create_order_with_stops(p_request_id uuid, p_client_id uuid, p_packages jsonb, p_order_stops jsonb, p_external_reference text DEFAULT NULL::text, p_instructions text DEFAULT NULL::text, p_freight_value numeric DEFAULT NULL::numeric, p_driver_payout numeric DEFAULT NULL::numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_org_id uuid := public.current_organization_id();
  v_fingerprint text;
  v_order_id uuid;
  v_existing_fingerprint text;
  v_client_org uuid;
  v_pkg jsonb;
  v_stop jsonb;
  v_package_id uuid;
  v_stop_id uuid;
  v_package_ids uuid[] := array[]::uuid[];
  v_package_index integer;
  v_package_count integer;
  v_stop_type public.stop_type;
  v_action text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if v_org_id is null then
    raise exception 'organization_required' using errcode = '42501';
  end if;
  if not public.has_any_role(array['admin', 'manager', 'dispatcher']::public.app_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if (p_freight_value is not null or p_driver_payout is not null)
     and not public.has_any_role(array['admin', 'manager']::public.app_role[]) then
    raise exception 'forbidden_financial_values' using errcode = '42501';
  end if;
  if p_request_id is null then
    raise exception 'request_id_required' using errcode = '22023';
  end if;
  if jsonb_typeof(p_packages) is distinct from 'array'
     or jsonb_typeof(p_order_stops) is distinct from 'array' then
    raise exception 'packages_and_stops_must_be_arrays' using errcode = '22023';
  end if;
  if jsonb_array_length(p_packages) = 0 or jsonb_array_length(p_order_stops) = 0 then
    raise exception 'packages_and_stops_required' using errcode = '22023';
  end if;

  v_fingerprint := encode(extensions.digest(
    jsonb_build_object(
      'client_id', p_client_id,
      'packages', p_packages,
      'order_stops', p_order_stops,
      'external_reference', p_external_reference,
      'instructions', p_instructions,
      'freight_value', p_freight_value,
      'driver_payout', p_driver_payout
    )::text, 'sha256'
  ), 'hex');

  select o.id, o.creation_request_fingerprint into v_order_id, v_existing_fingerprint
  from public.orders o where o.creation_request_id = p_request_id;
  if found then
    if v_existing_fingerprint is distinct from v_fingerprint then
      raise exception 'request_id_conflict' using errcode = '23505';
    end if;
    return v_order_id;
  end if;

  select c.organization_id into v_client_org
  from public.clients c where c.id = p_client_id and c.active;
  if v_client_org is distinct from v_org_id then
    raise exception 'client_unavailable' using errcode = '22023';
  end if;

  insert into public.orders (
    client_id, external_reference, status, freight_value, driver_payout,
    instructions, created_by, creation_request_id, creation_request_fingerprint
  ) values (
    p_client_id, nullif(btrim(p_external_reference), ''), 'pending_dispatch',
    coalesce(p_freight_value, 0), p_driver_payout,
    nullif(btrim(p_instructions), ''), v_uid, p_request_id, v_fingerprint
  ) returning id into v_order_id;

  -- Cada item do array representa um volume físico e recebe seu próprio código.
  for v_pkg in select e.value from jsonb_array_elements(p_packages) as e loop
    if coalesce((v_pkg ->> 'quantity')::integer, 1) <> 1 then
      raise exception 'one_package_record_per_physical_unit' using errcode = '22023';
    end if;
    if (v_pkg ->> 'weight_kg') is null or (v_pkg ->> 'weight_kg')::numeric <= 0 then
      raise exception 'package_weight_required' using errcode = '22023';
    end if;
    insert into public.packages (order_id, description, quantity, weight_kg)
    values (
      v_order_id,
      nullif(btrim(v_pkg ->> 'description'), ''),
      1,
      (v_pkg ->> 'weight_kg')::numeric
    ) returning id into v_package_id;
    v_package_ids := array_append(v_package_ids, v_package_id);
  end loop;

  v_package_count := cardinality(v_package_ids);
  for v_stop in select e.value from jsonb_array_elements(p_order_stops) as e loop
    v_stop_type := (v_stop ->> 'stop_type')::public.stop_type;
    if v_stop_type is null or v_stop_type not in ('pickup', 'delivery') then
      raise exception 'invalid_order_stop_type' using errcode = '22023';
    end if;
    if nullif(btrim(v_stop ->> 'address_label'), '') is null
       or nullif(btrim(v_stop ->> 'address_line'), '') is null then
      raise exception 'stop_address_required' using errcode = '22023';
    end if;
    if (v_stop ->> 'latitude') is null or (v_stop ->> 'longitude') is null
       or (v_stop ->> 'latitude')::double precision not between -90 and 90
       or (v_stop ->> 'longitude')::double precision not between -180 and 180 then
      raise exception 'stop_coordinates_required' using errcode = '22023';
    end if;
    if jsonb_typeof(v_stop -> 'package_indexes') is distinct from 'array' then
      raise exception 'package_indexes_must_be_array' using errcode = '22023';
    end if;
    if jsonb_array_length(v_stop -> 'package_indexes') = 0 then
      raise exception 'stop_packages_required' using errcode = '22023';
    end if;

    insert into public.order_stops (
      order_id, stop_type, status, address_label, address_line, address_extra,
      district, city, state, postal_code, contact_name, contact_phone,
      latitude, longitude, instructions
    ) values (
      v_order_id, v_stop_type, 'pending_dispatch',
      btrim(v_stop ->> 'address_label'), btrim(v_stop ->> 'address_line'),
      nullif(btrim(v_stop ->> 'address_extra'), ''), nullif(btrim(v_stop ->> 'district'), ''),
      nullif(btrim(v_stop ->> 'city'), ''), nullif(btrim(v_stop ->> 'state'), ''),
      nullif(btrim(v_stop ->> 'postal_code'), ''), nullif(btrim(v_stop ->> 'contact_name'), ''),
      nullif(btrim(v_stop ->> 'contact_phone'), ''), (v_stop ->> 'latitude')::double precision,
      (v_stop ->> 'longitude')::double precision, nullif(btrim(v_stop ->> 'instructions'), '')
    ) returning id into v_stop_id;

    v_action := case when v_stop_type = 'pickup' then 'load' else 'unload' end;
    for v_package_index in
      select e.value::integer from jsonb_array_elements_text(v_stop -> 'package_indexes') as e(value)
    loop
      if v_package_index < 1 or v_package_index > v_package_count then
        raise exception 'package_index_out_of_range' using errcode = '22023';
      end if;
      insert into public.order_stop_packages (order_id, order_stop_id, package_id, expected_action)
      values (v_order_id, v_stop_id, v_package_ids[v_package_index], v_action);
    end loop;
  end loop;

  if exists (
    select 1 from unnest(v_package_ids) as p(id)
    where not exists (
      select 1 from public.order_stop_packages osp where osp.package_id = p.id
    )
  ) then
    raise exception 'package_without_order_task' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(v_package_ids) as p(id)
    where (select count(*) from public.order_stop_packages osp where osp.package_id = p.id and osp.expected_action = 'load') <> 1
       or (select count(*) from public.order_stop_packages osp where osp.package_id = p.id and osp.expected_action = 'unload') <> 1
  ) then
    raise exception 'package_requires_one_pickup_and_one_delivery' using errcode = '22023';
  end if;

  insert into public.audit_log (actor_user_id, action, entity_table, entity_id, metadata)
  values (
    v_uid, 'create_order', 'orders', v_order_id,
    jsonb_build_object('client_id', p_client_id, 'packages', v_package_count, 'tasks', jsonb_array_length(p_order_stops))
  );
  return v_order_id;
end;
$function$;

drop function if exists public.dispatch_trip_from_order_stops(uuid, uuid, uuid, timestamp with time zone, uuid[]);
CREATE OR REPLACE FUNCTION public.dispatch_trip_from_order_stops(p_request_id uuid, p_driver_id uuid, p_vehicle_id uuid, p_planned_start_at timestamp with time zone, p_order_stop_ids uuid[], p_planned_at timestamp with time zone[] DEFAULT NULL::timestamp with time zone[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_org_id uuid := public.current_organization_id();
  v_fingerprint text;
  v_trip_id uuid;
  v_existing public.trips%rowtype;
  v_driver_org uuid;
  v_vehicle_org uuid;
  v_stop_id uuid;
  v_stop_seq bigint;
  v_attempt integer;
  v_task public.order_stops%rowtype;
  v_trip_stop_id uuid;
  v_order_id uuid;
  v_capacity numeric;
  v_load numeric;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if v_org_id is null then
    raise exception 'organization_required' using errcode = '42501';
  end if;
  if not public.has_any_role(array['admin', 'manager', 'dispatcher']::public.app_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_request_id is null or p_driver_id is null then
    raise exception 'request_id_and_driver_required' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_order_stop_ids), 0) = 0 then
    raise exception 'order_stops_required' using errcode = '22023';
  end if;
  if (select count(*) from unnest(p_order_stop_ids)) <>
     (select count(distinct x) from unnest(p_order_stop_ids) as u(x)) then
    raise exception 'duplicate_order_stop_ids' using errcode = '22023';
  end if;

  if p_planned_at is not null and coalesce(cardinality(p_planned_at), 0) <> cardinality(p_order_stop_ids) then
    raise exception 'planned_at_must_match_stops' using errcode = '22023';
  end if;
  if p_planned_at is not null and exists (
    select 1 from unnest(p_planned_at) with ordinality a(t, i)
    join unnest(p_planned_at) with ordinality b(t, i) on b.i = a.i + 1
    where a.t is not null and b.t is not null and b.t < a.t
  ) then
    raise exception 'planned_at_out_of_order' using errcode = '22023';
  end if;

  v_fingerprint := encode(extensions.digest(
    jsonb_build_object(
      'driver_id', p_driver_id, 'vehicle_id', p_vehicle_id,
      'planned_start_at', p_planned_start_at, 'order_stop_ids', p_order_stop_ids, 'planned_at', p_planned_at
    )::text, 'sha256'
  ), 'hex');
  select * into v_existing from public.trips t where t.dispatch_request_id = p_request_id;
  if found then
    if v_existing.assigned_by <> v_uid or v_existing.driver_id <> p_driver_id
       or v_existing.dispatch_request_fingerprint is distinct from v_fingerprint then
      raise exception 'request_id_conflict' using errcode = '23505';
    end if;
    return v_existing.id;
  end if;

  select d.organization_id into v_driver_org
  from public.drivers d join public.profiles p on p.id = d.profile_id
  where d.id = p_driver_id and d.status = 'active'::public.driver_status and p.active;
  if v_driver_org is distinct from v_org_id then
    raise exception 'driver_unavailable' using errcode = '22023';
  end if;

  if p_vehicle_id is not null then
    select v.organization_id, v.capacity_kg into v_vehicle_org, v_capacity
    from public.vehicles v where v.id = p_vehicle_id and v.active;
    if v_vehicle_org is distinct from v_org_id then
      raise exception 'vehicle_unavailable' using errcode = '22023';
    end if;
  end if;

  perform os.id
  from public.order_stops os join public.orders o on o.id = os.order_id
  where os.id = any (p_order_stop_ids) and o.organization_id = v_org_id
  order by os.id for update of os, o;

  if (
    select count(*) from public.order_stops os join public.orders o on o.id = os.order_id
    where os.id = any (p_order_stop_ids) and o.organization_id = v_org_id
      and os.status in ('pending_dispatch'::public.order_stop_status, 'exception'::public.order_stop_status)
  ) <> cardinality(p_order_stop_ids) then
    raise exception 'order_stop_not_dispatchable' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.order_stops os where os.id = any (p_order_stop_ids)
      and (os.latitude is null or os.longitude is null)
  ) then
    raise exception 'stop_coordinates_required' using errcode = '22023';
  end if;

  -- Coleta antes da entrega: se a coleta do volume está nesta viagem, precisa vir antes;
  -- se não está, precisa já ter sido concluída em outra viagem.
  if exists (
    select 1
    from unnest(p_order_stop_ids) with ordinality as d(stop_id, seq)
    join public.order_stop_packages dp on dp.order_stop_id = d.stop_id and dp.expected_action = 'unload'
    join public.order_stop_packages pp on pp.package_id = dp.package_id and pp.expected_action = 'load'
    join public.order_stops pickup_task on pickup_task.id = pp.order_stop_id
    left join unnest(p_order_stop_ids) with ordinality as p(stop_id, seq) on p.stop_id = pp.order_stop_id
    where (p.stop_id is not null and p.seq > d.seq)
       or (p.stop_id is null and pickup_task.status <> 'completed')
  ) then
    raise exception 'pickup_must_precede_delivery' using errcode = '22023';
  end if;

  if v_capacity is not null then
    select coalesce(sum(pk.weight_kg), 0) into v_load
    from public.packages pk
    where pk.id in (select osp.package_id from public.order_stop_packages osp where osp.order_stop_id = any (p_order_stop_ids));
    if v_load > v_capacity then
      raise exception 'vehicle_capacity_exceeded: % kg > % kg', v_load, v_capacity using errcode = '22023';
    end if;
  end if;

  insert into public.trips (
    driver_id, vehicle_id, status, planned_start_at, assigned_by,
    dispatch_request_id, dispatch_request_fingerprint
  ) values (
    p_driver_id, p_vehicle_id, 'assigned', p_planned_start_at, v_uid,
    p_request_id, v_fingerprint
  ) returning id into v_trip_id;

  for v_stop_id, v_stop_seq in
    select u.stop_id, u.ordinality from unnest(p_order_stop_ids) with ordinality as u(stop_id, ordinality)
  loop
    select * into v_task from public.order_stops os where os.id = v_stop_id;
    select coalesce(max(ts.attempt_number), 0) + 1 into v_attempt
    from public.trip_stops ts where ts.source_order_stop_id = v_stop_id;

    insert into public.trip_stops (
      trip_id, sequence_number, stop_type, address_label, address_line, address_extra,
      district, city, state, postal_code, contact_name, contact_phone,
      latitude, longitude, instructions, planned_at, source_order_stop_id, attempt_number
    ) values (
      v_trip_id, v_stop_seq::integer, v_task.stop_type, v_task.address_label, v_task.address_line,
      v_task.address_extra, v_task.district, v_task.city, v_task.state, v_task.postal_code,
      v_task.contact_name, v_task.contact_phone, v_task.latitude, v_task.longitude,
      v_task.instructions, case when p_planned_at is null then null else p_planned_at[v_stop_seq] end, v_task.id, v_attempt
    ) returning id into v_trip_stop_id;

    insert into public.stop_orders (stop_id, order_id) values (v_trip_stop_id, v_task.order_id);
    insert into public.stop_packages (stop_id, package_id, expected_action)
    select v_trip_stop_id, osp.package_id, osp.expected_action
    from public.order_stop_packages osp where osp.order_stop_id = v_task.id;

    update public.order_stops set status = 'assigned' where id = v_task.id;
  end loop;

  for v_order_id in
    select distinct os.order_id
    from public.order_stops os where os.id = any (p_order_stop_ids)
  loop
    perform public.refresh_order_status(v_order_id);
  end loop;

  insert into public.audit_log (actor_user_id, action, entity_table, entity_id, metadata)
  values (
    v_uid, 'dispatch_trip', 'trips', v_trip_id,
    jsonb_build_object('driver_id', p_driver_id, 'vehicle_id', p_vehicle_id, 'stops', cardinality(p_order_stop_ids))
  );
  return v_trip_id;
end;
$function$;
revoke all on function public.dispatch_trip_from_order_stops(uuid, uuid, uuid, timestamp with time zone, uuid[], timestamp with time zone[]) from public, anon;
grant execute on function public.dispatch_trip_from_order_stops(uuid, uuid, uuid, timestamp with time zone, uuid[], timestamp with time zone[]) to authenticated;

CREATE OR REPLACE FUNCTION public.record_stop_event(p_stop_id uuid, p_device_event_id uuid, p_to_status stop_status, p_reason text DEFAULT NULL::text, p_device_captured_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_latitude double precision DEFAULT NULL::double precision, p_longitude double precision DEFAULT NULL::double precision, p_location_accuracy_meters numeric DEFAULT NULL::numeric)
 RETURNS stop_status
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_driver_id uuid;
  v_stop public.trip_stops%rowtype;
  v_trip public.trips%rowtype;
  v_existing public.stop_events%rowtype;
  v_now timestamptz := now();
  v_reason text := nullif(btrim(p_reason), '');
  v_open integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  v_driver_id := public.current_driver_id();
  if v_driver_id is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Lock stop, then trip, so concurrent retries serialize here.
  select * into v_stop from public.trip_stops s where s.id = p_stop_id for update;
  if not found then
    raise exception 'stop_not_found' using errcode = 'P0002';
  end if;

  select * into v_trip from public.trips t where t.id = v_stop.trip_id for update;
  if v_trip.driver_id <> v_driver_id then
    raise exception 'stop_not_found' using errcode = 'P0002'; -- do not reveal other drivers' stops
  end if;

  -- Idempotent replay: same device event already applied.
  select * into v_existing
  from public.stop_events e
  where e.actor_user_id = v_uid and e.device_event_id = p_device_event_id;

  if found then
    if v_existing.stop_id <> p_stop_id then
      raise exception 'device_event_id_conflict' using errcode = '23505';
    end if;
    return v_existing.to_status;
  end if;

  if v_trip.status = 'assigned' then
    raise exception 'trip_not_accepted' using errcode = '22023';
  end if;
  if v_trip.status not in ('accepted', 'in_progress') then
    raise exception 'trip_not_active: %', v_trip.status using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.stop_status_transitions x
    where x.from_status = v_stop.status and x.to_status = p_to_status
  ) then
    raise exception 'invalid_transition: % -> %', v_stop.status, p_to_status using errcode = '22023';
  end if;

  if p_to_status in ('failed', 'skipped') and v_reason is null then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  update public.trip_stops
  set status = p_to_status,
      arrived_at = case when p_to_status = 'arrived' then v_now else arrived_at end,
      completed_at = case when p_to_status in ('completed', 'failed', 'skipped') then v_now else completed_at end,
      failure_reason = case when p_to_status in ('failed', 'skipped') then v_reason else failure_reason end
  where id = p_stop_id;

  insert into public.stop_events (
    stop_id, actor_user_id, event_type, from_status, to_status, reason,
    device_event_id, device_captured_at, latitude, longitude, location_accuracy_meters
  ) values (
    p_stop_id, v_uid, 'status_change', v_stop.status, p_to_status, v_reason,
    p_device_event_id, p_device_captured_at, p_latitude, p_longitude, p_location_accuracy_meters
  );

  if v_trip.status = 'accepted' then
    update public.trips
    set status = 'in_progress', started_at = coalesce(started_at, v_now)
    where id = v_trip.id;
  end if;

  -- Propagate to packages and orders.
  if p_to_status = 'completed' then
    update public.packages pk
    set status = case sp.expected_action
      when 'load' then 'picked_up'::public.package_status
      when 'unload' then 'delivered'::public.package_status
      else 'returned'::public.package_status
    end
    from public.stop_packages sp
    where sp.stop_id = p_stop_id and sp.package_id = pk.id;

    if v_stop.stop_type = 'pickup' then
      update public.orders o
      set status = 'in_progress'
      where o.id in (select so.order_id from public.stop_orders so where so.stop_id = p_stop_id)
        and o.status = 'planned';
    elsif v_stop.stop_type = 'delivery' then
      update public.orders o
      set status = 'completed'
      where o.id in (select so.order_id from public.stop_orders so where so.stop_id = p_stop_id)
        and o.status in ('planned', 'in_progress')
        and not exists (
          select 1 from public.packages pk
          where pk.order_id = o.id and pk.status <> 'delivered'
        );
    end if;
  elsif p_to_status = 'failed' then
    update public.packages pk
    set status = 'exception'
    from public.stop_packages sp
    where sp.stop_id = p_stop_id
      and sp.package_id = pk.id
      and pk.status not in ('delivered', 'returned');

    update public.orders o
    set status = 'exception'
    where o.id in (select so.order_id from public.stop_orders so where so.stop_id = p_stop_id)
      and o.status in ('planned', 'in_progress');
  end if;

  -- Close the trip when no stop is still open.
  select count(*) into v_open
  from public.trip_stops s
  where s.trip_id = v_stop.trip_id and s.status in ('pending', 'arrived', 'in_progress');

  if v_open = 0 then
    update public.trips
    set status = 'completed', completed_at = v_now
    where id = v_stop.trip_id;
  end if;

  return p_to_status;
end;
$function$;

-- ---------- Regras na conclusão de qualquer parada ----------
create or replace function public.enforce_stop_completion_rules()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if new.status = 'completed'::public.stop_status and old.status is distinct from new.status then
    -- Todos os volumes esperados nesta parada (e ainda sob custódia desta viagem) precisam ter o código conferido.
    if exists (
      select 1 from public.stop_packages sp
      join public.packages pk on pk.id = sp.package_id
      where sp.stop_id = new.id
        and (pk.custodian_trip_id is null or pk.custodian_trip_id = new.trip_id)
        and sp.confirmed_at is null
    ) then
      raise exception 'package_check_required' using errcode = '23514';
    end if;
    -- Entrega só depois da coleta do mesmo volume.
    if new.stop_type = 'delivery'::public.stop_type and exists (
      select 1 from public.stop_packages sp
      join public.packages pk on pk.id = sp.package_id
      where sp.stop_id = new.id and sp.expected_action = 'unload'
        and exists (
          select 1 from public.order_stop_packages osp
          join public.order_stops pickup_task on pickup_task.id = osp.order_stop_id
          where osp.package_id = pk.id and osp.expected_action = 'load'
            and pickup_task.status <> 'completed'::public.order_stop_status
        )
    ) then
      raise exception 'pickup_required_before_delivery' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$function$;
revoke all on function public.enforce_stop_completion_rules() from public, anon, authenticated;
drop trigger if exists trip_stops_enforce_completion_rules on public.trip_stops;
create trigger trip_stops_enforce_completion_rules
  before update of status on public.trip_stops
  for each row execute function public.enforce_stop_completion_rules();

-- ---------- Conferência dos códigos pelo motorista ----------
create or replace function public.confirm_stop_packages(p_stop_id uuid, p_package_codes text[])
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_driver_id uuid := public.current_driver_id();
  v_stop public.trip_stops%rowtype;
  v_trip public.trips%rowtype;
  v_code text;
  v_package_id uuid;
  v_confirmed integer := 0;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if v_driver_id is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if coalesce(cardinality(p_package_codes), 0) = 0 or cardinality(p_package_codes) > 200 then
    raise exception 'package_codes_required' using errcode = '22023';
  end if;

  select * into v_stop from public.trip_stops s where s.id = p_stop_id for update;
  if not found then raise exception 'stop_not_found' using errcode = 'P0002'; end if;
  select * into v_trip from public.trips t where t.id = v_stop.trip_id;
  if v_trip.driver_id <> v_driver_id then raise exception 'stop_not_found' using errcode = 'P0002'; end if;
  if v_trip.status not in ('accepted', 'in_progress') then
    raise exception 'trip_not_active: %', v_trip.status using errcode = '22023';
  end if;
  if v_stop.status not in ('arrived', 'in_progress') then
    raise exception 'stop_not_ready_for_package_check' using errcode = '22023';
  end if;

  foreach v_code in array p_package_codes loop
    v_code := lower(btrim(v_code));
    select sp.package_id into v_package_id
    from public.stop_packages sp join public.packages pk on pk.id = sp.package_id
    where sp.stop_id = p_stop_id and lower(pk.package_code) = v_code;
    if not found then
      raise exception 'package_not_expected_at_stop: %', v_code using errcode = '22023';
    end if;
    update public.stop_packages
    set confirmed_at = coalesce(confirmed_at, now()), confirmed_by = coalesce(confirmed_by, v_uid)
    where stop_id = p_stop_id and package_id = v_package_id;
    v_confirmed := v_confirmed + 1;
  end loop;

  insert into public.stop_events (stop_id, actor_user_id, event_type, from_status, to_status, reason, device_event_id)
  values (p_stop_id, v_uid, 'package_check', v_stop.status, v_stop.status, v_confirmed || ' volume(s) conferido(s)', gen_random_uuid());
  return v_confirmed;
end;
$function$;
revoke all on function public.confirm_stop_packages(uuid, text[]) from public, anon;
grant execute on function public.confirm_stop_packages(uuid, text[]) to authenticated;

-- ---------- Motorista inicia a viagem (libera o GPS até a 1ª parada) ----------
create or replace function public.start_trip(p_trip_id uuid)
returns public.trip_status
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_driver_id uuid := public.current_driver_id();
  v_trip public.trips%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if v_driver_id is null then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into v_trip from public.trips t where t.id = p_trip_id for update;
  if not found or v_trip.driver_id <> v_driver_id then raise exception 'trip_not_found' using errcode = 'P0002'; end if;
  if v_trip.status = 'in_progress' then return v_trip.status; end if;
  if v_trip.status = 'assigned' then raise exception 'trip_not_accepted' using errcode = '22023'; end if;
  if v_trip.status <> 'accepted' then raise exception 'invalid_trip_state: %', v_trip.status using errcode = '22023'; end if;
  update public.trips set status = 'in_progress', started_at = coalesce(started_at, now()) where id = p_trip_id;
  insert into public.audit_log (actor_user_id, action, entity_table, entity_id)
  values (v_uid, 'start_trip', 'trips', p_trip_id);
  return 'in_progress'::public.trip_status;
end;
$function$;
revoke all on function public.start_trip(uuid) from public, anon;
grant execute on function public.start_trip(uuid) to authenticated;

-- ---------- Controles do gestor sobre a viagem ----------
create or replace function public.manage_trip(p_trip_id uuid, p_action text, p_reason text, p_driver_id uuid default null, p_vehicle_id uuid default null)
returns public.trip_status
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_org uuid := public.current_organization_id();
  v_trip public.trips%rowtype;
  v_reason text := nullif(btrim(p_reason), '');
  v_new public.trip_status;
  v_started boolean;
  v_driver_org uuid;
  v_vehicle_org uuid;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if v_org is null or not public.has_org_role(v_org, array['admin', 'manager', 'dispatcher']::public.app_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_action not in ('pause', 'resume', 'cancel', 'reassign') then raise exception 'invalid_action' using errcode = '22023'; end if;
  if p_action <> 'resume' and (v_reason is null or length(v_reason) > 500) then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  select * into v_trip from public.trips t where t.id = p_trip_id and t.organization_id = v_org for update;
  if not found then raise exception 'trip_not_found' using errcode = 'P0002'; end if;
  v_started := exists (select 1 from public.trip_stops s where s.trip_id = p_trip_id and s.status <> 'pending');

  if p_action = 'pause' then
    if v_trip.status not in ('accepted', 'in_progress') then raise exception 'invalid_trip_state: %', v_trip.status using errcode = '22023'; end if;
    if exists (select 1 from public.trip_stops s where s.trip_id = p_trip_id and s.status in ('arrived', 'in_progress')) then
      raise exception 'stop_in_service' using errcode = '22023';
    end if;
    v_new := 'paused';
    update public.trips set status = v_new where id = p_trip_id;
  elsif p_action = 'resume' then
    if v_trip.status <> 'paused' then raise exception 'invalid_trip_state: %', v_trip.status using errcode = '22023'; end if;
    v_new := case when v_trip.started_at is null then 'accepted' else 'in_progress' end;
    update public.trips set status = v_new where id = p_trip_id;
  elsif p_action = 'cancel' then
    if v_trip.status not in ('assigned', 'accepted', 'paused', 'in_progress') then raise exception 'invalid_trip_state: %', v_trip.status using errcode = '22023'; end if;
    if v_started then raise exception 'trip_already_started' using errcode = '22023'; end if;
    -- Paradas pendentes voltam para a fila de despacho (o gatilho atualiza tarefas e pedidos).
    update public.trip_stops set status = 'skipped', completed_at = now(), failure_reason = 'Viagem cancelada: ' || v_reason
    where trip_id = p_trip_id and status = 'pending';
    v_new := 'cancelled';
    update public.trips set status = v_new, completed_at = now() where id = p_trip_id;
  else -- reassign
    if v_trip.status not in ('assigned', 'accepted', 'paused') then raise exception 'invalid_trip_state: %', v_trip.status using errcode = '22023'; end if;
    if v_started then raise exception 'trip_already_started' using errcode = '22023'; end if;
    if p_driver_id is null then raise exception 'driver_required' using errcode = '22023'; end if;
    select d.organization_id into v_driver_org
    from public.drivers d join public.profiles p on p.id = d.profile_id
    where d.id = p_driver_id and d.status = 'active' and p.active;
    if v_driver_org is distinct from v_org then raise exception 'driver_unavailable' using errcode = '22023'; end if;
    if p_vehicle_id is not null then
      select v.organization_id into v_vehicle_org from public.vehicles v where v.id = p_vehicle_id and v.active;
      if v_vehicle_org is distinct from v_org then raise exception 'vehicle_unavailable' using errcode = '22023'; end if;
    end if;
    v_new := 'assigned';
    update public.trips
    set driver_id = p_driver_id, vehicle_id = coalesce(p_vehicle_id, vehicle_id), status = v_new, started_at = null
    where id = p_trip_id;
  end if;

  insert into public.audit_log (actor_user_id, action, entity_table, entity_id, reason, metadata)
  values (v_uid, 'trip_' || p_action, 'trips', p_trip_id, v_reason,
    jsonb_build_object('from_status', v_trip.status, 'to_status', v_new, 'organization_id', v_org,
      'previous_driver_id', v_trip.driver_id, 'driver_id', coalesce(p_driver_id, v_trip.driver_id)));
  return v_new;
end;
$function$;
revoke all on function public.manage_trip(uuid, text, text, uuid, uuid) from public, anon;
grant execute on function public.manage_trip(uuid, text, text, uuid, uuid) to authenticated;

-- ---------- Cancelar pedido que ainda não entrou em execução ----------
create or replace function public.cancel_order(p_order_id uuid, p_reason text)
returns public.order_status
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_org uuid := public.current_organization_id();
  v_order public.orders%rowtype;
  v_reason text := nullif(btrim(p_reason), '');
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if v_org is null or not public.has_org_role(v_org, array['admin', 'manager', 'dispatcher']::public.app_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_reason is null or length(v_reason) > 500 then raise exception 'reason_required' using errcode = '22023'; end if;
  select * into v_order from public.orders o where o.id = p_order_id and o.organization_id = v_org for update;
  if not found then raise exception 'order_not_found' using errcode = 'P0002'; end if;
  if v_order.status = 'cancelled' then return v_order.status; end if;
  if exists (select 1 from public.order_stops s where s.order_id = p_order_id and s.status in ('assigned', 'completed'))
     or exists (select 1 from public.packages pk where pk.order_id = p_order_id and pk.status not in ('expected', 'exception')) then
    raise exception 'order_already_in_execution' using errcode = '22023';
  end if;
  update public.order_stops set status = 'cancelled' where order_id = p_order_id;
  update public.orders set status = 'cancelled' where id = p_order_id;
  insert into public.audit_log (actor_user_id, action, entity_table, entity_id, reason, metadata)
  values (v_uid, 'cancel_order', 'orders', p_order_id, v_reason, jsonb_build_object('from_status', v_order.status, 'organization_id', v_org));
  return 'cancelled'::public.order_status;
end;
$function$;
revoke all on function public.cancel_order(uuid, text) from public, anon;
grant execute on function public.cancel_order(uuid, text) to authenticated;
