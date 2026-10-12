-- Move unstarted delivery stops with the cargo custody transfer.
-- Started stops stay auditable and are flagged for manual dispatch review.
alter table public.cargo_transfer_events
  drop constraint if exists cargo_transfer_events_event_type_check;
alter table public.cargo_transfer_events
  add constraint cargo_transfer_events_event_type_check check (event_type in (
    'requested', 'authorized', 'rejected', 'receiver_confirmed',
    'source_confirmed', 'completed', 'route_updated', 'manual_route_adjustment'
  ));

create or replace function public.finalize_cargo_transfer(p_transfer_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transfer public.cargo_transfers%rowtype;
  v_destination public.trips%rowtype;
  v_stop public.trip_stops%rowtype;
  v_actor uuid := auth.uid();
  v_total integer;
  v_finalized integer;
  v_moved integer := 0;
  v_manual integer := 0;
  v_sequence integer;
  v_attempt integer;
  v_new_stop_id uuid;
  v_package_ids uuid[] := array[]::uuid[];
  v_moved_package_ids uuid[] := array[]::uuid[];
  v_manual_package_ids uuid[] := array[]::uuid[];
  v_source_stop_ids uuid[] := array[]::uuid[];
  v_manifest jsonb := '[]'::jsonb;
  v_reason text;
begin
  select * into v_transfer
  from public.cargo_transfers
  where id = p_transfer_id and status = 'completed'
  for update;
  if not found then raise exception 'transfer_not_completed'; end if;

  select count(*), count(*) filter (
    where p.custodian_trip_id = v_transfer.destination_trip_id
      and p.active_cargo_transfer_id is null
  )
  into v_total, v_finalized
  from public.cargo_transfer_items i
  join public.packages p on p.id = i.package_id
  where i.transfer_id = p_transfer_id;
  if v_total = 0 then raise exception 'transfer_has_no_packages'; end if;
  if v_finalized = v_total then return; end if;
  if exists (
    select 1 from public.cargo_transfer_items i
    join public.packages p on p.id = i.package_id
    where i.transfer_id = p_transfer_id
      and (p.active_cargo_transfer_id is distinct from p_transfer_id
        or p.status not in ('picked_up'::public.package_status, 'in_transit'::public.package_status)
        or (p.custodian_trip_id is not null and p.custodian_trip_id <> v_transfer.source_trip_id))
  ) then
    raise exception 'transfer_package_state_changed';
  end if;

  -- Match record_stop_event lock order: stop rows before trip rows.
  perform s.id
  from public.trip_stops s
  where s.trip_id = v_transfer.source_trip_id
    and s.status in ('pending'::public.stop_status, 'arrived'::public.stop_status, 'in_progress'::public.stop_status)
    and exists (
      select 1 from public.stop_packages sp
      join public.cargo_transfer_items i on i.package_id = sp.package_id
      where i.transfer_id = p_transfer_id and sp.stop_id = s.id and sp.expected_action = 'unload'
    )
  order by s.id
  for update;

  perform t.id
  from public.trips t
  where t.id in (v_transfer.source_trip_id, v_transfer.destination_trip_id)
  order by t.id
  for update;
  select * into v_destination from public.trips where id = v_transfer.destination_trip_id;

  update public.packages p
  set custodian_trip_id = v_transfer.destination_trip_id,
      active_cargo_transfer_id = null
  from public.cargo_transfer_items i
  where i.transfer_id = p_transfer_id
    and i.package_id = p.id
    and p.active_cargo_transfer_id = p_transfer_id;
  get diagnostics v_finalized = row_count;
  if v_finalized <> v_total then raise exception 'transfer_packages_not_reserved'; end if;

  for v_stop in
    select s.*
    from public.trip_stops s
    where s.trip_id = v_transfer.source_trip_id
      and s.status in ('pending'::public.stop_status, 'arrived'::public.stop_status, 'in_progress'::public.stop_status)
      and exists (
        select 1 from public.stop_packages sp
        join public.cargo_transfer_items i on i.package_id = sp.package_id
        where i.transfer_id = p_transfer_id and sp.stop_id = s.id and sp.expected_action = 'unload'
      )
    order by s.sequence_number, s.id
  loop
    v_source_stop_ids := array_append(v_source_stop_ids, v_stop.id);
    select coalesce(array_agg(distinct sp.package_id order by sp.package_id), array[]::uuid[])
    into v_package_ids
    from public.stop_packages sp
    join public.cargo_transfer_items i on i.package_id = sp.package_id
    where i.transfer_id = p_transfer_id
      and sp.stop_id = v_stop.id
      and sp.expected_action = 'unload'
      and not (sp.package_id = any(v_moved_package_ids));

    if cardinality(v_package_ids) = 0 then continue; end if;

    -- Only pending delivery stops on an editable destination trip can be
    -- reassigned automatically. A stop that already started remains manual.
    if v_stop.status = 'pending'::public.stop_status
      and v_stop.stop_type = 'delivery'::public.stop_type
      and v_destination.status in ('assigned'::public.trip_status, 'accepted'::public.trip_status, 'in_progress'::public.trip_status)
      and not exists (
        select 1 from public.stop_packages started_sp
        join public.trip_stops started_stop on started_stop.id = started_sp.stop_id
        where started_sp.package_id = any(v_package_ids)
          and started_stop.trip_id = v_transfer.source_trip_id
          and started_stop.status in ('arrived'::public.stop_status, 'in_progress'::public.stop_status)
      )
    then
      select coalesce(max(s.sequence_number), 0) + 1 into v_sequence
      from public.trip_stops s where s.trip_id = v_transfer.destination_trip_id;
      if v_stop.source_order_stop_id is null then
        v_attempt := 1;
      else
        select coalesce(max(s.attempt_number), 0) + 1 into v_attempt
        from public.trip_stops s where s.source_order_stop_id = v_stop.source_order_stop_id;
      end if;

      insert into public.trip_stops (
        trip_id, sequence_number, stop_type, status, address_label, address_line,
        address_extra, district, city, state, postal_code, contact_name,
        contact_phone, latitude, longitude, instructions, planned_at,
        source_order_stop_id, attempt_number
      ) values (
        v_transfer.destination_trip_id, v_sequence, v_stop.stop_type, 'pending',
        v_stop.address_label, v_stop.address_line, v_stop.address_extra,
        v_stop.district, v_stop.city, v_stop.state, v_stop.postal_code,
        v_stop.contact_name, v_stop.contact_phone, v_stop.latitude,
        v_stop.longitude, v_stop.instructions, null,
        v_stop.source_order_stop_id, v_attempt
      ) returning id into v_new_stop_id;

      insert into public.stop_orders (stop_id, order_id)
      select v_new_stop_id, so.order_id
      from public.stop_orders so
      where so.stop_id = v_stop.id;

      insert into public.stop_packages (stop_id, package_id, expected_action)
      select v_new_stop_id, sp.package_id, sp.expected_action
      from public.stop_packages sp
      where sp.stop_id = v_stop.id and sp.package_id = any(v_package_ids);

      v_moved := v_moved + cardinality(v_package_ids);
      v_moved_package_ids := v_moved_package_ids || v_package_ids;
      v_manifest := v_manifest || jsonb_build_array(jsonb_build_object(
        'action', 'moved_to_destination',
        'source_stop_id', v_stop.id,
        'destination_stop_id', v_new_stop_id,
        'package_ids', to_jsonb(v_package_ids)
      ));
    else
      v_manual_package_ids := v_manual_package_ids || v_package_ids;
      v_manifest := v_manifest || jsonb_build_array(jsonb_build_object(
        'action', 'manual_route_review',
        'source_stop_id', v_stop.id,
        'destination_stop_id', null,
        'package_ids', to_jsonb(v_package_ids),
        'source_stop_status', v_stop.status
      ));
    end if;
  end loop;

  -- Remove transferred volumes from active source stops only; their old task,
  -- stop events and transfer manifest remain available for audit.
  if cardinality(v_moved_package_ids) > 0 then
    delete from public.stop_packages sp
    using public.trip_stops s
    where sp.stop_id = s.id
      and s.trip_id = v_transfer.source_trip_id
      and s.status in ('pending'::public.stop_status, 'arrived'::public.stop_status, 'in_progress'::public.stop_status)
      and sp.package_id = any(v_moved_package_ids);
  end if;
  if cardinality(v_manual_package_ids) > 0 then
    delete from public.stop_packages sp
    using public.trip_stops s
    where sp.stop_id = s.id
      and s.trip_id = v_transfer.source_trip_id
      and s.status in ('pending'::public.stop_status, 'arrived'::public.stop_status, 'in_progress'::public.stop_status)
      and sp.package_id = any(v_manual_package_ids);
  end if;

  -- Close an emptied, unstarted source stop as skipped; started stops stay
  -- open for an operator to resolve without rewriting their execution history.
  for v_stop in
    select s.* from public.trip_stops s
    where s.id = any(v_source_stop_ids)
      and s.status = 'pending'::public.stop_status
    order by s.sequence_number, s.id
    for update
  loop
    if not exists (
      select 1 from public.stop_packages sp
      join public.packages p on p.id = sp.package_id
      where sp.stop_id = v_stop.id
        and (p.custodian_trip_id is null or p.custodian_trip_id = v_transfer.source_trip_id)
    ) then
      v_reason := 'Volume(s) transferido(s) para a viagem #' || v_destination.trip_number::text || ' via MalhaX.';
      update public.trip_stops
      set status = 'skipped', completed_at = now(), failure_reason = v_reason
      where id = v_stop.id;
      insert into public.stop_events (stop_id, actor_user_id, event_type, from_status, to_status, reason, device_event_id)
      values (v_stop.id, v_actor, 'cargo_transfer', 'pending', 'skipped', v_reason, gen_random_uuid());
    end if;
  end loop;

  select coalesce(array_agg(distinct i.package_id order by i.package_id), array[]::uuid[])
  into v_manual_package_ids
  from public.cargo_transfer_items i
  where i.transfer_id = p_transfer_id
    and not (i.package_id = any(v_moved_package_ids));
  v_manual := cardinality(v_manual_package_ids);

  if v_moved > 0 then
    insert into public.cargo_transfer_events (transfer_id, actor_user_id, event_type, details)
    values (p_transfer_id, v_actor, 'route_updated',
      v_moved::text || ' volume(s) adicionado(s) à viagem #' || v_destination.trip_number::text || ' em paradas pendentes.');
  end if;
  if v_manual > 0 then
    insert into public.cargo_transfer_events (transfer_id, actor_user_id, event_type, details)
    values (p_transfer_id, v_actor, 'manual_route_adjustment',
      v_manual::text || ' volume(s) exigem revisão manual da rota porque a parada já foi iniciada ou a viagem de destino não está editável.');
  end if;

  insert into public.audit_log (actor_user_id, action, entity_table, entity_id, reason, metadata)
  values (
    v_actor,
    'cargo_transfer_routes_updated',
    'trips',
    v_transfer.destination_trip_id,
    v_transfer.reason,
    jsonb_build_object(
      'transfer_id', p_transfer_id,
      'source_trip_id', v_transfer.source_trip_id,
      'destination_trip_id', v_transfer.destination_trip_id,
      'automatically_moved_package_ids', to_jsonb(v_moved_package_ids),
      'manual_review_package_ids', to_jsonb(v_manual_package_ids),
      'route_manifest', v_manifest
    )
  );
end;
$$;

revoke all on function public.finalize_cargo_transfer(uuid) from public, anon, authenticated;
