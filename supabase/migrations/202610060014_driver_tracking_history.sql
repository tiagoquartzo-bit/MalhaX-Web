-- Histórico diário de posição GPS e gravação segura pelo aplicativo do motorista.
-- A tela de gestão consulta tracking_positions respeitando RLS; o app só grava
-- por esta função, sem receber permissão direta de INSERT na tabela.

create index if not exists tracking_driver_capture_time_idx
  on public.tracking_positions (captured_at_device asc, driver_id);

create or replace function public.record_driver_position(
  p_trip_id uuid,
  p_device_event_id uuid,
  p_captured_at_device timestamptz,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy_meters numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_driver_id uuid := public.current_driver_id();
  v_trip public.trips%rowtype;
  v_existing public.tracking_positions%rowtype;
  v_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if v_driver_id is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_trip_id is null or p_device_event_id is null or p_captured_at_device is null
     or p_latitude is null or p_longitude is null
     or p_latitude not between -90 and 90 or p_longitude not between -180 and 180
     or p_accuracy_meters is not null and (p_accuracy_meters < 0 or p_accuracy_meters > 10000) then
    raise exception 'invalid_tracking_position' using errcode = '22023';
  end if;
  if p_captured_at_device > now() + interval '5 minutes' then
    raise exception 'tracking_timestamp_in_future' using errcode = '22023';
  end if;

  select t.* into v_trip
  from public.trips t
  where t.id = p_trip_id and t.driver_id = v_driver_id
  for share;
  if not found or v_trip.status not in ('in_progress'::public.trip_status, 'completed'::public.trip_status, 'paused'::public.trip_status, 'cancelled'::public.trip_status) then
    raise exception 'trip_not_active_or_not_owned' using errcode = '42501';
  end if;
  -- Permite sincronização posterior de pontos capturados sem sinal, mas limita
  -- cada registro ao intervalo operacional da própria viagem.
  if v_trip.started_at is null
     or p_captured_at_device < v_trip.started_at - interval '5 minutes'
     or v_trip.status = 'completed'::public.trip_status and (v_trip.completed_at is null or p_captured_at_device > v_trip.completed_at)
     or v_trip.status in ('paused'::public.trip_status, 'cancelled'::public.trip_status) and p_captured_at_device > v_trip.updated_at then
    raise exception 'tracking_timestamp_outside_trip' using errcode = '22023';
  end if;

  insert into public.tracking_positions (
    trip_id, driver_id, latitude, longitude, accuracy_meters,
    captured_at_device, device_event_id
  ) values (
    p_trip_id, v_driver_id, p_latitude, p_longitude, p_accuracy_meters,
    p_captured_at_device, p_device_event_id
  ) on conflict (driver_id, device_event_id) do nothing
  returning id into v_id;

  if v_id is null then
    select tp.* into v_existing
    from public.tracking_positions tp
    where tp.driver_id = v_driver_id and tp.device_event_id = p_device_event_id;
    if v_existing.trip_id is distinct from p_trip_id
       or v_existing.latitude is distinct from p_latitude
       or v_existing.longitude is distinct from p_longitude
       or v_existing.accuracy_meters is distinct from p_accuracy_meters
       or v_existing.captured_at_device is distinct from p_captured_at_device then
      raise exception 'tracking_event_id_conflict' using errcode = '22023';
    end if;
    v_id := v_existing.id;
  end if;
  return v_id;
end;
$$;

revoke all on function public.record_driver_position(uuid, uuid, timestamptz, double precision, double precision, numeric) from public, anon;
grant execute on function public.record_driver_position(uuid, uuid, timestamptz, double precision, double precision, numeric) to authenticated;
comment on function public.record_driver_position(uuid, uuid, timestamptz, double precision, double precision, numeric) is
  'Idempotently records a GPS point for the authenticated driver own trip; delayed offline points are bounded by trip timestamps and direct table writes remain revoked.';





