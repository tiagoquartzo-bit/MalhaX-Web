-- Activia Logistica: transactional server operations (write path).
-- Clients have no direct write grants (see 202609290002). Every mutation goes through
-- the SECURITY DEFINER functions below, which validate role, ownership, state
-- transitions and idempotency before touching data.
-- NOT YET APPLIED OR TESTED against a database: review and run the pgTAP tests first.

-- ---------------------------------------------------------------------------
-- 1. Hardening: deactivated profiles must lose their roles and driver identity.
-- ---------------------------------------------------------------------------
create or replace function public.has_any_role(_roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.profiles p on p.id = ur.user_id
    where ur.user_id = (select auth.uid())
      and p.active
      and ur.role = any (_roles)
  );
$$;

create or replace function public.current_driver_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select d.id
  from public.drivers d
  join public.profiles p on p.id = d.profile_id
  where d.profile_id = (select auth.uid())
    and d.status = 'active'::public.driver_status
    and p.active
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- 2. updated_at maintained by the database, not by clients.
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'drivers', 'vehicles', 'clients', 'orders', 'packages', 'trips'
  ] loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      t || '_set_updated_at', t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Stop state machine: allowed transitions live in data, enforced server-side.
-- ---------------------------------------------------------------------------
create table public.stop_status_transitions (
  from_status public.stop_status not null,
  to_status public.stop_status not null,
  primary key (from_status, to_status)
);

alter table public.stop_status_transitions enable row level security;
revoke all on public.stop_status_transitions from anon, authenticated;

insert into public.stop_status_transitions (from_status, to_status) values
  ('pending',     'arrived'),
  ('pending',     'skipped'),
  ('pending',     'failed'),
  ('arrived',     'in_progress'),
  ('arrived',     'completed'),
  ('arrived',     'failed'),
  ('arrived',     'skipped'),
  ('in_progress', 'completed'),
  ('in_progress', 'failed');

-- ---------------------------------------------------------------------------
-- 4. create_order: order + packages in one transaction.
--    Roles: admin, manager, dispatcher. Financial values: admin, manager only.
--    p_packages: [{"description": text, "quantity": int, "weight_kg": number}, ...]
-- ---------------------------------------------------------------------------
create or replace function public.create_order(
  p_client_id uuid,
  p_external_reference text default null,
  p_instructions text default null,
  p_packages jsonb default '[]'::jsonb,
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
  v_order_id uuid;
  v_pkg jsonb;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if not public.has_any_role(array['admin', 'manager', 'dispatcher']::public.app_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if (p_freight_value is not null or p_driver_payout is not null)
     and not public.has_any_role(array['admin', 'manager']::public.app_role[]) then
    raise exception 'forbidden_financial_values' using errcode = '42501';
  end if;

  if not exists (select 1 from public.clients c where c.id = p_client_id and c.active) then
    raise exception 'client_unavailable' using errcode = '22023';
  end if;

  if jsonb_typeof(p_packages) is distinct from 'array' or jsonb_array_length(p_packages) = 0 then
    raise exception 'packages_required' using errcode = '22023';
  end if;

  insert into public.orders (
    client_id, external_reference, status, freight_value, driver_payout, instructions, created_by
  ) values (
    p_client_id,
    nullif(btrim(p_external_reference), ''),
    'pending_dispatch',
    coalesce(p_freight_value, 0),
    p_driver_payout,
    nullif(btrim(p_instructions), ''),
    v_uid
  )
  returning id into v_order_id;

  for v_pkg in select e.value from jsonb_array_elements(p_packages) as e loop
    insert into public.packages (order_id, description, quantity, weight_kg)
    values (
      v_order_id,
      nullif(btrim(v_pkg ->> 'description'), ''),
      coalesce((v_pkg ->> 'quantity')::integer, 1),
      (v_pkg ->> 'weight_kg')::numeric
    );
  end loop;

  insert into public.audit_log (actor_user_id, action, entity_table, entity_id, metadata)
  values (
    v_uid, 'create_order', 'orders', v_order_id,
    jsonb_build_object('client_id', p_client_id, 'packages', jsonb_array_length(p_packages))
  );

  return v_order_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. dispatch_trip: trip + ordered stops + order/package links, atomically.
--    Roles: admin, manager, dispatcher.
--    p_stops (array order = stop sequence):
--      [{"stop_type": "pickup|delivery|return_to_base",
--        "address_label": text, "address_line": text, "address_extra": text,
--        "district": text, "city": text, "state": text, "postal_code": text,
--        "contact_name": text, "contact_phone": text,
--        "latitude": number, "longitude": number, "instructions": text,
--        "planned_at": timestamptz,
--        "order_ids": [uuid, ...], "package_ids": [uuid, ...]}, ...]
--    Every referenced order must be 'pending_dispatch'; it becomes 'planned'.
-- ---------------------------------------------------------------------------
create or replace function public.dispatch_trip(
  p_driver_id uuid,
  p_vehicle_id uuid,
  p_planned_start_at timestamptz,
  p_stops jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_trip_id uuid;
  v_stop_id uuid;
  v_stop jsonb;
  v_seq bigint;
  v_type public.stop_type;
  v_order_ids uuid[];
  v_cnt integer;
  v_ord uuid;
  v_pk uuid;
  v_action text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if not public.has_any_role(array['admin', 'manager', 'dispatcher']::public.app_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.drivers d
    join public.profiles p on p.id = d.profile_id
    where d.id = p_driver_id and d.status = 'active'::public.driver_status and p.active
  ) then
    raise exception 'driver_unavailable' using errcode = '22023';
  end if;

  if p_vehicle_id is not null
     and not exists (select 1 from public.vehicles v where v.id = p_vehicle_id and v.active) then
    raise exception 'vehicle_unavailable' using errcode = '22023';
  end if;

  if jsonb_typeof(p_stops) is distinct from 'array' or jsonb_array_length(p_stops) = 0 then
    raise exception 'stops_required' using errcode = '22023';
  end if;

  select array_agg(distinct o.val::uuid)
    into v_order_ids
  from jsonb_array_elements(p_stops) as s(stop)
  cross join lateral jsonb_array_elements_text(coalesce(s.stop -> 'order_ids', '[]'::jsonb)) as o(val);

  if coalesce(cardinality(v_order_ids), 0) = 0 then
    raise exception 'orders_required' using errcode = '22023';
  end if;

  -- Lock in a stable order to avoid deadlocks between concurrent dispatches.
  perform o.id from public.orders o where o.id = any (v_order_ids) order by o.id for update;

  select count(*) into v_cnt
  from public.orders o
  where o.id = any (v_order_ids) and o.status = 'pending_dispatch'::public.order_status;

  if v_cnt <> cardinality(v_order_ids) then
    raise exception 'order_not_dispatchable' using errcode = '22023';
  end if;

  insert into public.trips (driver_id, vehicle_id, status, planned_start_at, assigned_by)
  values (p_driver_id, p_vehicle_id, 'assigned', p_planned_start_at, v_uid)
  returning id into v_trip_id;

  for v_stop, v_seq in
    select s.value, s.ordinality
    from jsonb_array_elements(p_stops) with ordinality as s(value, ordinality)
  loop
    v_type := (v_stop ->> 'stop_type')::public.stop_type;

    if nullif(btrim(v_stop ->> 'address_label'), '') is null
       or nullif(btrim(v_stop ->> 'address_line'), '') is null then
      raise exception 'stop_address_required' using errcode = '22023';
    end if;

    if v_type in ('pickup', 'delivery')
       and jsonb_array_length(coalesce(v_stop -> 'order_ids', '[]'::jsonb)) = 0 then
      raise exception 'stop_requires_order' using errcode = '22023';
    end if;

    insert into public.trip_stops (
      trip_id, sequence_number, stop_type, address_label, address_line, address_extra,
      district, city, state, postal_code, contact_name, contact_phone,
      latitude, longitude, instructions, planned_at
    ) values (
      v_trip_id, v_seq::integer, v_type,
      btrim(v_stop ->> 'address_label'), btrim(v_stop ->> 'address_line'),
      nullif(btrim(v_stop ->> 'address_extra'), ''),
      nullif(btrim(v_stop ->> 'district'), ''), nullif(btrim(v_stop ->> 'city'), ''),
      nullif(btrim(v_stop ->> 'state'), ''), nullif(btrim(v_stop ->> 'postal_code'), ''),
      nullif(btrim(v_stop ->> 'contact_name'), ''), nullif(btrim(v_stop ->> 'contact_phone'), ''),
      (v_stop ->> 'latitude')::double precision, (v_stop ->> 'longitude')::double precision,
      nullif(btrim(v_stop ->> 'instructions'), ''),
      (v_stop ->> 'planned_at')::timestamptz
    )
    returning id into v_stop_id;

    for v_ord in
      select e.val::uuid
      from jsonb_array_elements_text(coalesce(v_stop -> 'order_ids', '[]'::jsonb)) as e(val)
    loop
      insert into public.stop_orders (stop_id, order_id) values (v_stop_id, v_ord);
    end loop;

    v_action := case v_type
      when 'pickup' then 'load'
      when 'delivery' then 'unload'
      else 'return'
    end;

    for v_pk in
      select e.val::uuid
      from jsonb_array_elements_text(coalesce(v_stop -> 'package_ids', '[]'::jsonb)) as e(val)
    loop
      -- A package may only be attached to a stop that carries its own order.
      if not exists (
        select 1
        from public.stop_orders so
        join public.packages pk on pk.order_id = so.order_id
        where so.stop_id = v_stop_id and pk.id = v_pk
      ) then
        raise exception 'package_not_in_stop_orders' using errcode = '22023';
      end if;

      insert into public.stop_packages (stop_id, package_id, expected_action)
      values (v_stop_id, v_pk, v_action);
    end loop;
  end loop;

  update public.orders set status = 'planned' where id = any (v_order_ids);

  insert into public.audit_log (actor_user_id, action, entity_table, entity_id, metadata)
  values (
    v_uid, 'dispatch_trip', 'trips', v_trip_id,
    jsonb_build_object(
      'driver_id', p_driver_id,
      'vehicle_id', p_vehicle_id,
      'stops', jsonb_array_length(p_stops),
      'orders', to_jsonb(v_order_ids)
    )
  );

  return v_trip_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. accept_trip: the assigned driver acknowledges the trip.
-- ---------------------------------------------------------------------------
create or replace function public.accept_trip(p_trip_id uuid)
returns public.trip_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_driver_id uuid;
  v_trip public.trips%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  v_driver_id := public.current_driver_id();
  if v_driver_id is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_trip from public.trips t where t.id = p_trip_id for update;
  if not found or v_trip.driver_id <> v_driver_id then
    raise exception 'trip_not_found' using errcode = 'P0002';
  end if;

  if v_trip.status = 'accepted'::public.trip_status then
    return v_trip.status; -- idempotent replay
  end if;

  if v_trip.status <> 'assigned'::public.trip_status then
    raise exception 'invalid_trip_state: %', v_trip.status using errcode = '22023';
  end if;

  update public.trips set status = 'accepted' where id = p_trip_id;

  insert into public.audit_log (actor_user_id, action, entity_table, entity_id)
  values (v_uid, 'accept_trip', 'trips', p_trip_id);

  return 'accepted'::public.trip_status;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. record_stop_event: the driver app's only write path for stop progress.
--    Idempotent per (user, device_event_id): safe to retry after flaky connections.
--    Validates ownership, trip state and the transition table, then propagates the
--    result to packages, orders and the trip.
-- ---------------------------------------------------------------------------
create or replace function public.record_stop_event(
  p_stop_id uuid,
  p_device_event_id uuid,
  p_to_status public.stop_status,
  p_reason text default null,
  p_device_captured_at timestamptz default null,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_location_accuracy_meters numeric default null
)
returns public.stop_status
language plpgsql
security definer
set search_path = ''
as $$
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

  if v_trip.status not in ('assigned', 'accepted', 'in_progress') then
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

  if v_trip.status in ('assigned', 'accepted') then
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
$$;

-- ---------------------------------------------------------------------------
-- 8. Privileges: only authenticated callers; every function re-checks role/ownership.
-- ---------------------------------------------------------------------------
revoke all on function public.create_order(uuid, text, text, jsonb, numeric, numeric) from public, anon;
revoke all on function public.dispatch_trip(uuid, uuid, timestamptz, jsonb) from public, anon;
revoke all on function public.accept_trip(uuid) from public, anon;
revoke all on function public.record_stop_event(
  uuid, uuid, public.stop_status, text, timestamptz, double precision, double precision, numeric
) from public, anon;

grant execute on function public.create_order(uuid, text, text, jsonb, numeric, numeric) to authenticated;
grant execute on function public.dispatch_trip(uuid, uuid, timestamptz, jsonb) to authenticated;
grant execute on function public.accept_trip(uuid) to authenticated;
grant execute on function public.record_stop_event(
  uuid, uuid, public.stop_status, text, timestamptz, double precision, double precision, numeric
) to authenticated;

comment on function public.record_stop_event(
  uuid, uuid, public.stop_status, text, timestamptz, double precision, double precision, numeric
) is 'Driver write path for stop progress. Idempotent per (user, device_event_id); validates ownership, trip state and stop_status_transitions.';
comment on table public.stop_status_transitions is
  'Allowed stop status transitions. Internal: no client grants, read only by SECURITY DEFINER functions.';
