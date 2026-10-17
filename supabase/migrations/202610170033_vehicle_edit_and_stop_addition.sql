-- 033: edição de veículo e validações ao incluir parada em viagem já despachada.

CREATE OR REPLACE FUNCTION public.add_order_stop_to_trip(p_trip_id uuid, p_order_stop_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := (select auth.uid());
  v_org uuid := public.current_organization_id();
  v_trip public.trips%rowtype;
  v_task public.order_stops%rowtype;
  v_trip_stop_id uuid;
  v_attempt integer;
  v_sequence integer;
  v_action text;
  v_capacity numeric;
  v_load numeric;
  v_planned timestamptz;
begin
  if v_actor is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if v_org is null then
    raise exception 'organization_required' using errcode = '42501';
  end if;
  if not public.has_org_role(
    v_org, array['admin'::public.app_role, 'manager'::public.app_role, 'dispatcher'::public.app_role]
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_trip
  from public.trips t
  where t.id = p_trip_id and t.organization_id = v_org
  for update;
  if not found then
    raise exception 'trip_not_found' using errcode = 'P0002';
  end if;
  if v_trip.status not in ('assigned', 'accepted', 'in_progress') then
    raise exception 'trip_not_editable' using errcode = '22023';
  end if;

  select os.* into v_task
  from public.order_stops os
  join public.orders o on o.id = os.order_id
  where os.id = p_order_stop_id and o.organization_id = v_org
  for update of os;
  if not found then
    raise exception 'order_stop_not_found' using errcode = 'P0002';
  end if;

  -- Retentativa da mesma acao retorna a parada ja criada nesta viagem.
  if v_task.status = 'assigned' then
    select ts.id into v_trip_stop_id
    from public.trip_stops ts
    where ts.trip_id = p_trip_id and ts.source_order_stop_id = p_order_stop_id
      and ts.status in ('pending', 'arrived', 'in_progress');
    if v_trip_stop_id is not null then
      return v_trip_stop_id;
    end if;
    raise exception 'order_stop_not_dispatchable' using errcode = '22023';
  end if;
  if v_task.status not in ('pending_dispatch', 'exception') then
    raise exception 'order_stop_not_dispatchable' using errcode = '22023';
  end if;

  -- A coleta precisa estar nesta rota antes da entrega do mesmo volume.
  if v_task.stop_type = 'delivery' and exists (
    select 1
    from public.order_stop_packages delivery_link
    join public.order_stop_packages pickup_link
      on pickup_link.package_id = delivery_link.package_id
     and pickup_link.expected_action = 'load'
    join public.order_stops pickup_task on pickup_task.id = pickup_link.order_stop_id
    where delivery_link.order_stop_id = p_order_stop_id
      and pickup_task.status <> 'completed'
      and not exists (
        select 1 from public.trip_stops pickup_trip_stop
        where pickup_trip_stop.source_order_stop_id = pickup_task.id
          and pickup_trip_stop.trip_id = p_trip_id
          and pickup_trip_stop.status = 'completed'
      )
  ) then
    raise exception 'package_pickup_must_be_completed_first' using errcode = '22023';
  end if;

  if v_task.latitude is null or v_task.longitude is null then
    raise exception 'stop_coordinates_required' using errcode = '22023';
  end if;

  if v_trip.vehicle_id is not null then
    select v.capacity_kg into v_capacity from public.vehicles v where v.id = v_trip.vehicle_id;
  end if;
  if v_capacity is not null then
    select coalesce(sum(pk.weight_kg), 0) into v_load
    from public.packages pk
    where pk.status <> 'delivered'::public.package_status
      and pk.id in (
        select sp.package_id from public.stop_packages sp
        join public.trip_stops ts on ts.id = sp.stop_id
        where ts.trip_id = p_trip_id and ts.status not in ('failed', 'skipped')
        union
        select osp.package_id from public.order_stop_packages osp where osp.order_stop_id = p_order_stop_id
      );
    if v_load > v_capacity then
      raise exception 'vehicle_capacity_exceeded: % kg > % kg', v_load, v_capacity using errcode = '22023';
    end if;
  end if;

  -- Nova parada entra no fim da rota com previsão de 20 minutos após a última.
  select max(ts.planned_at) + interval '20 minutes' into v_planned
  from public.trip_stops ts where ts.trip_id = p_trip_id and ts.status not in ('failed', 'skipped');

  select coalesce(max(ts.sequence_number), 0) + 1 into v_sequence
  from public.trip_stops ts where ts.trip_id = p_trip_id;
  select coalesce(max(ts.attempt_number), 0) + 1 into v_attempt
  from public.trip_stops ts where ts.source_order_stop_id = p_order_stop_id;

  insert into public.trip_stops (
    trip_id, sequence_number, stop_type, address_label, address_line, address_extra,
    district, city, state, postal_code, contact_name, contact_phone,
    latitude, longitude, instructions, planned_at, source_order_stop_id, attempt_number
  ) values (
    p_trip_id, v_sequence, v_task.stop_type, v_task.address_label, v_task.address_line,
    v_task.address_extra, v_task.district, v_task.city, v_task.state, v_task.postal_code,
    v_task.contact_name, v_task.contact_phone, v_task.latitude, v_task.longitude,
    v_task.instructions, v_planned, v_task.id, v_attempt
  ) returning id into v_trip_stop_id;

  insert into public.stop_orders (stop_id, order_id)
  values (v_trip_stop_id, v_task.order_id);
  insert into public.stop_packages (stop_id, package_id, expected_action)
  select v_trip_stop_id, osp.package_id, osp.expected_action
  from public.order_stop_packages osp where osp.order_stop_id = p_order_stop_id;

  update public.order_stops set status = 'assigned' where id = p_order_stop_id;
  perform public.refresh_order_status(v_task.order_id);

  insert into public.audit_log (actor_user_id, action, entity_table, entity_id, reason, metadata)
  values (
    v_actor, 'trip_stop_added', 'trips', p_trip_id, 'manager_dispatch_update',
    jsonb_build_object('trip_stop_id', v_trip_stop_id, 'order_stop_id', p_order_stop_id,
      'sequence_number', v_sequence, 'organization_id', v_org)
  );

  return v_trip_stop_id;
end;
$function$;

create or replace function public.update_vehicle(
  p_vehicle_id uuid, p_make_model text, p_capacity_kg numeric, p_capacity_description text, p_active boolean, p_reason text
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_org uuid := public.current_organization_id();
  v_vehicle public.vehicles%rowtype;
  v_reason text := nullif(btrim(p_reason), '');
  v_make_model text := nullif(btrim(p_make_model), '');
  v_capacity text := nullif(btrim(p_capacity_description), '');
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if v_org is null or not public.has_org_role(v_org, array['admin', 'manager', 'support']::public.app_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_reason is null or length(v_reason) > 500 then raise exception 'reason_required' using errcode = '22023'; end if;
  if p_capacity_kg is null or p_capacity_kg <= 0 or p_capacity_kg > 100000
     or length(coalesce(v_make_model, '')) > 120 or length(coalesce(v_capacity, '')) > 160 or p_active is null then
    raise exception 'invalid_vehicle_data' using errcode = '22023';
  end if;
  select * into v_vehicle from public.vehicles v where v.id = p_vehicle_id and v.organization_id = v_org for update;
  if not found then raise exception 'vehicle_not_found' using errcode = 'P0002'; end if;
  if not p_active and exists (
    select 1 from public.trips t where t.vehicle_id = p_vehicle_id
      and t.status in ('assigned', 'accepted', 'in_progress', 'paused')
  ) then
    raise exception 'vehicle_has_active_trip' using errcode = '22023';
  end if;
  update public.vehicles
  set make_model = v_make_model, capacity_kg = p_capacity_kg, capacity_description = v_capacity, active = p_active
  where id = p_vehicle_id;
  insert into public.audit_log (actor_user_id, action, entity_table, entity_id, reason, metadata)
  values (v_uid, 'update_vehicle', 'vehicles', p_vehicle_id, v_reason, jsonb_build_object(
    'organization_id', v_org,
    'before', jsonb_build_object('make_model', v_vehicle.make_model, 'capacity_kg', v_vehicle.capacity_kg, 'capacity_description', v_vehicle.capacity_description, 'active', v_vehicle.active),
    'after', jsonb_build_object('make_model', v_make_model, 'capacity_kg', p_capacity_kg, 'capacity_description', v_capacity, 'active', p_active)));
  return p_vehicle_id;
end;
$function$;
revoke all on function public.update_vehicle(uuid, text, numeric, text, boolean, text) from public, anon;
grant execute on function public.update_vehicle(uuid, text, numeric, text, boolean, text) to authenticated;
