-- Private proof storage and server-side evidence enforcement for delivery completion.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'delivery-proofs', 'delivery-proofs', false, 20971520,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- The object path is <trip UUID>/<trip-stop UUID>/<filename>.
-- Drivers can upload/read only evidence for their assigned trip; operations can read
-- proofs for trips inside their organization. No client-side update/delete is granted.
drop policy if exists delivery_proofs_storage_insert_driver on storage.objects;
create policy delivery_proofs_storage_insert_driver on storage.objects
  for insert to authenticated with check (
    bucket_id = 'delivery-proofs'
    and cardinality(storage.foldername(name)) = 2
    and exists (
      select 1
      from public.trip_stops ts
      join public.trips t on t.id = ts.trip_id
      where t.id::text = (storage.foldername(name))[1]
        and ts.id::text = (storage.foldername(name))[2]
        and public.can_access_trip(t.id)
    )
  );

drop policy if exists delivery_proofs_storage_read_ops_or_assigned on storage.objects;
create policy delivery_proofs_storage_read_ops_or_assigned on storage.objects
  for select to authenticated using (
    bucket_id = 'delivery-proofs'
    and cardinality(storage.foldername(name)) = 2
    and exists (
      select 1
      from public.trip_stops ts
      join public.trips t on t.id = ts.trip_id
      where t.id::text = (storage.foldername(name))[1]
        and ts.id::text = (storage.foldername(name))[2]
        and t.organization_id = public.current_organization_id()
        and (
          public.has_org_role(t.organization_id, array['admin'::public.app_role, 'manager'::public.app_role, 'dispatcher'::public.app_role, 'support'::public.app_role])
          or public.can_access_trip(t.id)
        )
    )
  );

create or replace function public.register_delivery_proof(
  p_stop_id uuid,
  p_storage_path text,
  p_recipient_name text,
  p_captured_at_device timestamptz,
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
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  v_driver_id := public.current_driver_id();
  if v_driver_id is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select ts.trip_id, ts.stop_type, ts.status
    into v_trip_id, v_stop_type, v_stop_status
  from public.trip_stops ts
  join public.trips t on t.id = ts.trip_id
  where ts.id = p_stop_id and t.driver_id = v_driver_id
  for update of ts;
  if not found then
    raise exception 'stop_not_found' using errcode = 'P0002';
  end if;
  if v_stop_type <> 'delivery'::public.stop_type then
    raise exception 'delivery_stop_required' using errcode = '22023';
  end if;
  if v_stop_status not in ('arrived'::public.stop_status, 'in_progress'::public.stop_status) then
    raise exception 'stop_not_ready_for_proof' using errcode = '22023';
  end if;
  if nullif(btrim(p_recipient_name), '') is null then
    raise exception 'recipient_name_required' using errcode = '22023';
  end if;
  if p_captured_at_device is null or p_latitude is null or p_longitude is null
     or p_location_accuracy_meters is null or p_location_accuracy_meters < 0 then
    raise exception 'proof_gps_and_capture_time_required' using errcode = '22023';
  end if;
  if p_package_id is not null and not exists (
    select 1 from public.stop_packages sp
    where sp.stop_id = p_stop_id and sp.package_id = p_package_id
      and sp.expected_action = 'unload'
  ) then
    raise exception 'package_not_expected_at_delivery_stop' using errcode = '22023';
  end if;

  v_folders := storage.foldername(p_storage_path);
  if p_storage_path is null or cardinality(v_folders) <> 2
     or v_folders[1] is distinct from v_trip_id::text
     or v_folders[2] is distinct from p_stop_id::text then
    raise exception 'proof_storage_path_invalid' using errcode = '22023';
  end if;
  if not exists (
    select 1 from storage.objects so
    where so.bucket_id = 'delivery-proofs' and so.name = p_storage_path
  ) then
    raise exception 'proof_file_not_uploaded' using errcode = '22023';
  end if;

  insert into public.delivery_proofs (
    stop_id, package_id, uploaded_by, storage_path, recipient_name,
    captured_at_device, latitude, longitude, location_accuracy_meters
  ) values (
    p_stop_id, p_package_id, v_uid, p_storage_path, btrim(p_recipient_name),
    p_captured_at_device, p_latitude, p_longitude, p_location_accuracy_meters
  ) returning id into v_proof_id;

  return v_proof_id;
end;
$$;

revoke all on function public.register_delivery_proof(uuid, text, text, timestamptz, double precision, double precision, numeric, uuid)
  from public, anon;
grant execute on function public.register_delivery_proof(uuid, text, text, timestamptz, double precision, double precision, numeric, uuid)
  to authenticated;

create or replace function public.enforce_delivery_proof_before_completion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'completed'::public.stop_status
     and old.status is distinct from new.status
     and new.stop_type = 'delivery'::public.stop_type then
    if not exists (
      select 1 from public.stop_packages sp
      where sp.stop_id = new.id and sp.expected_action = 'unload'
    ) then
      raise exception 'delivery_packages_required' using errcode = '23514';
    end if;

    if not exists (
      select 1 from public.delivery_proofs p
      where p.stop_id = new.id and p.package_id is null
        and nullif(btrim(p.recipient_name), '') is not null
        and p.captured_at_device is not null
        and p.latitude is not null and p.longitude is not null
        and p.location_accuracy_meters is not null
    ) and exists (
      select 1 from public.stop_packages sp
      where sp.stop_id = new.id and sp.expected_action = 'unload'
        and not exists (
          select 1 from public.delivery_proofs p
          where p.stop_id = new.id and p.package_id = sp.package_id
            and nullif(btrim(p.recipient_name), '') is not null
            and p.captured_at_device is not null
            and p.latitude is not null and p.longitude is not null
            and p.location_accuracy_meters is not null
        )
    ) then
      raise exception 'delivery_proof_required' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_delivery_proof_before_completion() from public, anon, authenticated;
create trigger trip_stops_require_delivery_proof
  before update of status on public.trip_stops
  for each row execute function public.enforce_delivery_proof_before_completion();
