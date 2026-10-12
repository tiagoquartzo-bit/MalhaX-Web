-- RPCs do MVP que criam pedidos com tarefas/endereço e despacham tarefas existentes.
-- Idempotência evita duplicar pedido/viagem em retries de rede.

alter table public.orders
  add column creation_request_id uuid unique,
  add column creation_request_fingerprint text;
alter table public.trips
  add column dispatch_request_id uuid unique,
  add column dispatch_request_fingerprint text;

create or replace function public.refresh_order_status(p_order_id uuid)
returns public.order_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total integer;
  v_pending integer;
  v_assigned integer;
  v_completed integer;
  v_exception integer;
  v_cancelled integer;
  v_status public.order_status;
begin
  select count(*),
    count(*) filter (where s.status = 'pending_dispatch'),
    count(*) filter (where s.status = 'assigned'),
    count(*) filter (where s.status = 'completed'),
    count(*) filter (where s.status = 'exception'),
    count(*) filter (where s.status = 'cancelled')
  into v_total, v_pending, v_assigned, v_completed, v_exception, v_cancelled
  from public.order_stops s where s.order_id = p_order_id;

  if v_total = 0 then
    select o.status into v_status from public.orders o where o.id = p_order_id;
    return v_status;
  elsif v_exception > 0 then
    v_status := 'exception'::public.order_status;
  elsif v_pending > 0 and v_assigned > 0 then
    v_status := 'partially_assigned'::public.order_status;
  elsif v_pending > 0 and v_completed > 0 then
    v_status := 'in_progress'::public.order_status;
  elsif v_pending > 0 then
    v_status := 'pending_dispatch'::public.order_status;
  elsif v_assigned > 0 and v_completed > 0 then
    v_status := 'in_progress'::public.order_status;
  elsif v_assigned > 0 then
    v_status := 'planned'::public.order_status;
  elsif v_completed > 0 then
    v_status := 'completed'::public.order_status;
  elsif v_cancelled = v_total then
    v_status := 'cancelled'::public.order_status;
  else
    v_status := 'pending_dispatch'::public.order_status;
  end if;

  update public.orders set status = v_status where id = p_order_id;
  return v_status;
end;
$$;
revoke all on function public.refresh_order_status(uuid) from public, anon, authenticated;

create or replace function public.sync_order_task_from_trip_stop()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task_status public.order_stop_status;
  v_order_id uuid;
begin
  if new.source_order_stop_id is null or new.status is not distinct from old.status then
    return new;
  end if;

  if new.status = 'completed'::public.stop_status then
    v_task_status := 'completed'::public.order_stop_status;
  elsif new.status = 'failed'::public.stop_status then
    v_task_status := 'exception'::public.order_stop_status;
  elsif new.status = 'skipped'::public.stop_status then
    v_task_status := 'pending_dispatch'::public.order_stop_status;
  else
    return new;
  end if;

  update public.order_stops
  set status = v_task_status
  where id = new.source_order_stop_id
  returning order_id into v_order_id;

  if v_order_id is not null then
    perform public.refresh_order_status(v_order_id);
  end if;
  return new;
end;
$$;
revoke all on function public.sync_order_task_from_trip_stop() from public, anon, authenticated;
create trigger trip_stops_sync_order_task
  after update of status on public.trip_stops
  for each row execute function public.sync_order_task_from_trip_stop();

create or replace function public.create_order_with_stops(
  p_request_id uuid,
  p_client_id uuid,
  p_packages jsonb,
  p_order_stops jsonb,
  p_external_reference text default null,
  p_instructions text default null,
  p_freight_value numeric default null,
  p_driver_payout numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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

  insert into public.audit_log (actor_user_id, action, entity_table, entity_id, metadata)
  values (
    v_uid, 'create_order', 'orders', v_order_id,
    jsonb_build_object('client_id', p_client_id, 'packages', v_package_count, 'tasks', jsonb_array_length(p_order_stops))
  );
  return v_order_id;
end;
$$;

create or replace function public.dispatch_trip_from_order_stops(
  p_request_id uuid,
  p_driver_id uuid,
  p_vehicle_id uuid,
  p_planned_start_at timestamptz,
  p_order_stop_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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

  v_fingerprint := encode(extensions.digest(
    jsonb_build_object(
      'driver_id', p_driver_id, 'vehicle_id', p_vehicle_id,
      'planned_start_at', p_planned_start_at, 'order_stop_ids', p_order_stop_ids
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
    select v.organization_id into v_vehicle_org
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
      v_task.instructions, null, v_task.id, v_attempt
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
$$;

-- Os caminhos antigos permitiam criar pedido sem tarefas/endereço e despacho sem
-- uma tarefa de origem. A interface passa a usar as RPCs acima.
revoke all on function public.create_order(uuid, text, text, jsonb, numeric, numeric) from public, anon, authenticated;
revoke all on function public.dispatch_trip(uuid, uuid, timestamptz, jsonb) from public, anon, authenticated;
revoke all on function public.create_order_with_stops(uuid, uuid, jsonb, jsonb, text, text, numeric, numeric) from public, anon;
revoke all on function public.dispatch_trip_from_order_stops(uuid, uuid, uuid, timestamptz, uuid[]) from public, anon;
grant execute on function public.create_order_with_stops(uuid, uuid, jsonb, jsonb, text, text, numeric, numeric) to authenticated;
grant execute on function public.dispatch_trip_from_order_stops(uuid, uuid, uuid, timestamptz, uuid[]) to authenticated;


