-- Controles do gestor para ajustar uma viagem sem apagar trilha operacional.
-- Inclusao usa uma tarefa de pedido ja cadastrada e ainda nao despachada.

create or replace function public.add_order_stop_to_trip(
  p_trip_id uuid,
  p_order_stop_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_org uuid := public.current_organization_id();
  v_trip public.trips%rowtype;
  v_task public.order_stops%rowtype;
  v_trip_stop_id uuid;
  v_attempt integer;
  v_sequence integer;
  v_action text;
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
    v_task.instructions, null, v_task.id, v_attempt
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
$$;

create or replace function public.remove_pending_trip_stop(
  p_trip_id uuid,
  p_trip_stop_id uuid,
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
  v_trip public.trips%rowtype;
  v_stop public.trip_stops%rowtype;
  v_reason text := nullif(btrim(p_reason), '');
  v_order_id uuid;
begin
  if v_actor is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if v_org is null or not public.has_org_role(
    v_org, array['admin'::public.app_role, 'manager'::public.app_role, 'dispatcher'::public.app_role]
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_reason is null or length(v_reason) > 500 then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  -- Match the driver event lock order: stop first, trip second.
  select * into v_trip
  from public.trips t where t.id = p_trip_id and t.organization_id = v_org;
  if not found then
    raise exception 'trip_not_found' using errcode = 'P0002';
  end if;

  select * into v_stop from public.trip_stops ts
  where ts.id = p_trip_stop_id and ts.trip_id = p_trip_id
  for update;
  if not found then
    raise exception 'trip_stop_not_found' using errcode = 'P0002';
  end if;

  select * into v_trip
  from public.trips t where t.id = p_trip_id and t.organization_id = v_org
  for update;
  if not found then
    raise exception 'trip_not_found' using errcode = 'P0002';
  end if;
  if v_trip.status not in ('assigned', 'accepted', 'in_progress') then
    raise exception 'trip_not_editable' using errcode = '22023';
  end if;
  if v_stop.status = 'skipped' then
    return p_trip_stop_id;
  end if;
  if v_stop.status <> 'pending' then
    raise exception 'only_pending_stops_can_be_removed' using errcode = '22023';
  end if;

  update public.trip_stops
  set status = 'skipped', completed_at = now(), failure_reason = v_reason
  where id = p_trip_stop_id;

  insert into public.stop_events (
    stop_id, actor_user_id, event_type, from_status, to_status, reason, device_event_id
  ) values (
    p_trip_stop_id, v_actor, 'manager_removed', 'pending', 'skipped', v_reason, gen_random_uuid()
  );

  -- A parada deixa a viagem, mas a tarefa original volta a ficar disponivel.
  if v_stop.source_order_stop_id is not null then
    update public.order_stops
    set status = 'pending_dispatch'
    where id = v_stop.source_order_stop_id
    returning order_id into v_order_id;
    if v_order_id is not null then
      perform public.refresh_order_status(v_order_id);
    end if;
  end if;

  insert into public.audit_log (actor_user_id, action, entity_table, entity_id, reason, metadata)
  values (
    v_actor, 'trip_stop_removed', 'trips', p_trip_id, v_reason,
    jsonb_build_object('trip_stop_id', p_trip_stop_id,
      'source_order_stop_id', v_stop.source_order_stop_id, 'organization_id', v_org)
  );

  if not exists (
    select 1 from public.trip_stops ts
    where ts.trip_id = p_trip_id and ts.status in ('pending', 'arrived', 'in_progress')
  ) then
    update public.trips set status = 'completed', completed_at = now()
    where id = p_trip_id;
  end if;

  return p_trip_stop_id;
end;
$$;

create or replace function public.reorder_unstarted_trip_stops(
  p_trip_id uuid,
  p_ordered_stop_ids uuid[],
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_org uuid := public.current_organization_id();
  v_trip public.trips%rowtype;
  v_stop_count integer;
  v_index integer;
  v_offset integer;
  v_stop_id uuid;
  v_reason text := nullif(btrim(p_reason), '');
begin
  if v_actor is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if v_org is null or not public.has_org_role(
    v_org, array['admin'::public.app_role, 'manager'::public.app_role, 'dispatcher'::public.app_role]
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_reason is null or length(v_reason) > 500 then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  select * into v_trip from public.trips t
  where t.id = p_trip_id and t.organization_id = v_org;
  if not found then
    raise exception 'trip_not_found' using errcode = 'P0002';
  end if;

  -- Stop rows lock before the trip row, matching record_stop_event.
  perform ts.id from public.trip_stops ts
  where ts.trip_id = p_trip_id
  order by ts.id
  for update;

  select * into v_trip from public.trips t
  where t.id = p_trip_id and t.organization_id = v_org
  for update;
  if not found then
    raise exception 'trip_not_found' using errcode = 'P0002';
  end if;
  if v_trip.status not in ('assigned', 'accepted') then
    raise exception 'trip_already_started' using errcode = '22023';
  end if;

  select count(*) into v_stop_count from public.trip_stops ts where ts.trip_id = p_trip_id;
  if coalesce(cardinality(p_ordered_stop_ids), 0) <> v_stop_count
     or (select count(distinct x) from unnest(p_ordered_stop_ids) as u(x)) <> v_stop_count
     or exists (
       select 1 from public.trip_stops ts
       where ts.trip_id = p_trip_id and ts.status <> 'pending'
     )
     or exists (
       select 1 from unnest(p_ordered_stop_ids) as u(id)
       where not exists (select 1 from public.trip_stops ts where ts.id = u.id and ts.trip_id = p_trip_id)
     ) then
    raise exception 'ordered_stops_must_match_unstarted_trip' using errcode = '22023';
  end if;

  -- Preserve a pickup-before-delivery dependency when both are on this trip.
  if exists (
    select 1
    from unnest(p_ordered_stop_ids) with ordinality as delivery(stop_id, sequence_number)
    join public.stop_packages delivery_package
      on delivery_package.stop_id = delivery.stop_id
     and delivery_package.expected_action = 'unload'
    join public.stop_packages pickup_package
      on pickup_package.package_id = delivery_package.package_id
     and pickup_package.expected_action = 'load'
    join unnest(p_ordered_stop_ids) with ordinality as pickup(stop_id, sequence_number)
      on pickup.stop_id = pickup_package.stop_id
     and pickup.sequence_number > delivery.sequence_number
  ) then
    raise exception 'pickup_must_precede_delivery' using errcode = '22023';
  end if;

  select coalesce(max(ts.sequence_number), 0) + v_stop_count + 1 into v_offset
  from public.trip_stops ts where ts.trip_id = p_trip_id;
  update public.trip_stops ts
  set sequence_number = ts.sequence_number + v_offset
  where ts.trip_id = p_trip_id;

  for v_stop_id, v_index in
    select u.id, u.ordinality::integer
    from unnest(p_ordered_stop_ids) with ordinality as u(id, ordinality)
  loop
    update public.trip_stops set sequence_number = v_index
    where id = v_stop_id and trip_id = p_trip_id;
  end loop;

  insert into public.audit_log (actor_user_id, action, entity_table, entity_id, reason, metadata)
  values (
    v_actor, 'trip_stops_reordered', 'trips', p_trip_id, v_reason,
    jsonb_build_object('ordered_stop_ids', to_jsonb(p_ordered_stop_ids), 'organization_id', v_org)
  );
end;
$$;

revoke all on function public.add_order_stop_to_trip(uuid, uuid) from public, anon;
revoke all on function public.remove_pending_trip_stop(uuid, uuid, text) from public, anon;
revoke all on function public.reorder_unstarted_trip_stops(uuid, uuid[], text) from public, anon;
grant execute on function public.add_order_stop_to_trip(uuid, uuid) to authenticated;
grant execute on function public.remove_pending_trip_stop(uuid, uuid, text) to authenticated;
grant execute on function public.reorder_unstarted_trip_stops(uuid, uuid[], text) to authenticated;

comment on function public.add_order_stop_to_trip(uuid, uuid) is
  'Adds an existing undispatched order task to an active trip; manager/dispatcher only, tenant-scoped and audited.';
comment on function public.remove_pending_trip_stop(uuid, uuid, text) is
  'Removes a pending stop from a trip without deleting history and returns its source task to dispatch queue.';
comment on function public.reorder_unstarted_trip_stops(uuid, uuid[], text) is
  'Reorders every pending stop before trip execution begins; requires a reason and writes audit history.';




