-- Keep the evidence time separate from the timestamp of the GPS fix. A cached
-- Android location may predate the photo and must never appear as its capture time.
alter table public.delivery_proofs
  add column if not exists location_captured_at_device timestamptz;

revoke all on function public.register_delivery_proof(uuid, text, text, text, timestamptz, double precision, double precision, numeric, uuid)
  from public, anon, authenticated;

create or replace function public.register_delivery_proof(
  p_stop_id uuid,
  p_storage_path text,
  p_location_storage_path text,
  p_recipient_name text,
  p_captured_at_device timestamptz,
  p_location_captured_at_device timestamptz,
  p_latitude double precision,
  p_longitude double precision,
  p_location_accuracy_meters numeric,
  p_package_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_driver_id uuid;
  v_trip_id uuid;
  v_stop_type public.stop_type;
  v_stop_status public.stop_status;
  v_folders text[];
  v_proof_id uuid;
  v_existing public.delivery_proofs%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  v_driver_id := public.current_driver_id();
  if v_driver_id is null then raise exception 'forbidden' using errcode = '42501'; end if;

  select ts.trip_id, ts.stop_type, ts.status into v_trip_id, v_stop_type, v_stop_status
  from public.trip_stops ts join public.trips t on t.id = ts.trip_id
  where ts.id = p_stop_id and t.driver_id = v_driver_id for update of ts;
  if not found then raise exception 'stop_not_found' using errcode = 'P0002'; end if;
  if v_stop_type <> 'delivery'::public.stop_type then raise exception 'delivery_stop_required' using errcode = '22023'; end if;
  if v_stop_status not in ('arrived'::public.stop_status, 'in_progress'::public.stop_status) then
    raise exception 'stop_not_ready_for_proof' using errcode = '22023';
  end if;
  if nullif(btrim(p_recipient_name), '') is null then raise exception 'recipient_name_required' using errcode = '22023'; end if;
  if p_captured_at_device is null then raise exception 'proof_capture_time_required' using errcode = '22023'; end if;
  if (p_latitude is null) <> (p_longitude is null)
     or (p_latitude is null) <> (p_location_accuracy_meters is null)
     or (p_latitude is null) <> (p_location_captured_at_device is null) then
    raise exception 'proof_gps_fields_incomplete' using errcode = '22023';
  end if;
  if p_latitude is not null and (
    p_latitude not between -90 and 90 or p_longitude not between -180 and 180
    or p_location_accuracy_meters < 0
  ) then raise exception 'proof_gps_invalid' using errcode = '22023'; end if;
  if p_package_id is not null and not exists (
    select 1 from public.stop_packages sp where sp.stop_id = p_stop_id
      and sp.package_id = p_package_id and sp.expected_action = 'unload'
  ) then raise exception 'package_not_expected_at_delivery_stop' using errcode = '22023'; end if;

  v_folders := storage.foldername(p_storage_path);
  if p_storage_path is null or cardinality(v_folders) <> 2
     or v_folders[1] is distinct from v_trip_id::text
     or v_folders[2] is distinct from p_stop_id::text then
    raise exception 'proof_storage_path_invalid' using errcode = '22023';
  end if;
  if not exists (select 1 from storage.objects so where so.bucket_id = 'delivery-proofs' and so.name = p_storage_path) then
    raise exception 'proof_file_not_uploaded' using errcode = '22023';
  end if;

  v_folders := storage.foldername(p_location_storage_path);
  if p_location_storage_path is null or cardinality(v_folders) <> 2
     or v_folders[1] is distinct from v_trip_id::text
     or v_folders[2] is distinct from p_stop_id::text
     or p_location_storage_path = p_storage_path then
    raise exception 'location_photo_storage_path_invalid' using errcode = '22023';
  end if;
  if not exists (select 1 from storage.objects so where so.bucket_id = 'delivery-proofs' and so.name = p_location_storage_path) then
    raise exception 'location_photo_not_uploaded' using errcode = '22023';
  end if;

  insert into public.delivery_proofs (
    stop_id, package_id, uploaded_by, storage_path, location_photo_path,
    recipient_name, captured_at_device, location_captured_at_device,
    latitude, longitude, location_accuracy_meters
  ) values (
    p_stop_id, p_package_id, v_uid, p_storage_path, p_location_storage_path,
    btrim(p_recipient_name), p_captured_at_device, p_location_captured_at_device,
    p_latitude, p_longitude, p_location_accuracy_meters
  ) on conflict (storage_path) do nothing returning id into v_proof_id;

  if v_proof_id is null then
    select * into v_existing from public.delivery_proofs p where p.storage_path = p_storage_path;
    if v_existing.stop_id is distinct from p_stop_id
       or v_existing.package_id is distinct from p_package_id
       or v_existing.uploaded_by is distinct from v_uid
       or v_existing.location_photo_path is distinct from p_location_storage_path
       or v_existing.recipient_name is distinct from btrim(p_recipient_name)
       or v_existing.captured_at_device is distinct from p_captured_at_device
       or v_existing.location_captured_at_device is distinct from p_location_captured_at_device
       or v_existing.latitude is distinct from p_latitude
       or v_existing.longitude is distinct from p_longitude
       or v_existing.location_accuracy_meters is distinct from p_location_accuracy_meters then
      raise exception 'proof_path_conflict' using errcode = '23505';
    end if;
    return v_existing.id;
  end if;
  return v_proof_id;
end;
$$;

revoke all on function public.register_delivery_proof(uuid, text, text, text, timestamptz, timestamptz, double precision, double precision, numeric, uuid)
  from public, anon;
grant execute on function public.register_delivery_proof(uuid, text, text, text, timestamptz, timestamptz, double precision, double precision, numeric, uuid)
  to authenticated;

notify pgrst, 'reload schema';
