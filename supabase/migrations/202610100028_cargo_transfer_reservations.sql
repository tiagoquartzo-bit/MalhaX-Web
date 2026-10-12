-- Reserve each package while a transfer is awaiting approval/confirmation so it
-- cannot be approved into two destination vehicles at once.
alter table public.packages
  add column active_cargo_transfer_id uuid references public.cargo_transfers(id) on delete restrict;
create index packages_active_cargo_transfer_idx on public.packages(active_cargo_transfer_id) where active_cargo_transfer_id is not null;

create or replace function public.request_cargo_transfer(
  p_source_trip_id uuid, p_destination_trip_id uuid, p_package_ids uuid[], p_reason text, p_details text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_org uuid := public.current_organization_id(); v_id uuid; v_count integer; v_reserved integer;
begin
  if auth.uid() is null or v_org is null then raise exception 'not_authenticated'; end if;
  if p_source_trip_id = p_destination_trip_id then raise exception 'trips_must_differ'; end if;
  if p_reason not in ('planned_handoff', 'vehicle_breakdown', 'route_change') or length(btrim(coalesce(p_details, ''))) not between 5 and 1000 then raise exception 'invalid_transfer_details'; end if;
  if coalesce(array_length(p_package_ids, 1), 0) < 1 or array_length(p_package_ids, 1) > 100 then raise exception 'invalid_package_count'; end if;
  if not (public.has_any_role(array['admin'::public.app_role, 'manager'::public.app_role, 'dispatcher'::public.app_role, 'support'::public.app_role])
    or exists (select 1 from public.trips t join public.drivers d on d.id = t.driver_id where t.id = p_source_trip_id and t.organization_id = v_org and d.profile_id = auth.uid())) then raise exception 'not_allowed'; end if;
  if not exists (select 1 from public.trips t join public.drivers d on d.id = t.driver_id join public.profiles p on p.id = d.profile_id and p.active where t.id = p_source_trip_id and t.organization_id = v_org and t.status in ('assigned'::public.trip_status, 'accepted'::public.trip_status, 'in_progress'::public.trip_status)) then raise exception 'source_trip_unavailable'; end if;
  if not exists (select 1 from public.trips t join public.drivers d on d.id = t.driver_id join public.profiles p on p.id = d.profile_id and p.active where t.id = p_destination_trip_id and t.organization_id = v_org and t.status in ('assigned'::public.trip_status, 'accepted'::public.trip_status, 'in_progress'::public.trip_status)) then raise exception 'destination_trip_unavailable'; end if;
  perform 1 from public.packages p where p.id = any(p_package_ids) order by p.id for update;
  select count(distinct p.id) into v_count
  from public.packages p join public.stop_packages sp on sp.package_id = p.id and sp.expected_action = 'unload'
  join public.trip_stops s on s.id = sp.stop_id and s.trip_id = p_source_trip_id and s.status not in ('completed'::public.stop_status, 'skipped'::public.stop_status)
  where p.id = any(p_package_ids) and p.active_cargo_transfer_id is null
    and p.status in ('picked_up'::public.package_status, 'in_transit'::public.package_status)
    and (p.custodian_trip_id is null or p.custodian_trip_id = p_source_trip_id);
  if v_count <> cardinality(array(select distinct unnest(p_package_ids))) then raise exception 'package_not_available_on_source_trip'; end if;
  insert into public.cargo_transfers (organization_id, source_trip_id, destination_trip_id, reason, details, requested_by)
  values (v_org, p_source_trip_id, p_destination_trip_id, p_reason, btrim(p_details), auth.uid()) returning id into v_id;
  insert into public.cargo_transfer_items (transfer_id, package_id)
    select v_id, distinct_ids.package_id from (select distinct unnest(p_package_ids) as package_id) distinct_ids;
  update public.packages set active_cargo_transfer_id = v_id where id = any(p_package_ids) and active_cargo_transfer_id is null;
  get diagnostics v_reserved = row_count;
  if v_reserved <> cardinality(array(select distinct unnest(p_package_ids))) then raise exception 'package_transfer_race'; end if;
  insert into public.cargo_transfer_events (transfer_id, actor_user_id, event_type, details) values (v_id, auth.uid(), 'requested', btrim(p_details));
  return v_id;
end; $$;

create or replace function public.reject_cargo_transfer(p_transfer_id uuid, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.has_any_role(array['admin'::public.app_role, 'manager'::public.app_role, 'support'::public.app_role]) then raise exception 'support_approval_required'; end if;
  update public.cargo_transfers set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), review_note = left(btrim(p_note), 1000), updated_at = now()
  where id = p_transfer_id and organization_id = public.current_organization_id() and status = 'pending_support';
  if not found then raise exception 'transfer_not_pending'; end if;
  update public.packages set active_cargo_transfer_id = null where active_cargo_transfer_id = p_transfer_id;
  insert into public.cargo_transfer_events (transfer_id, actor_user_id, event_type, details) values (p_transfer_id, auth.uid(), 'rejected', left(btrim(p_note), 1000));
end; $$;

create or replace function public.finalize_cargo_transfer(p_transfer_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_transfer public.cargo_transfers;
begin
  select * into v_transfer from public.cargo_transfers where id = p_transfer_id and status = 'completed';
  if not found then raise exception 'transfer_not_completed'; end if;
  update public.packages set custodian_trip_id = v_transfer.destination_trip_id, active_cargo_transfer_id = null
  where id in (select package_id from public.cargo_transfer_items where transfer_id = p_transfer_id)
    and active_cargo_transfer_id = p_transfer_id;
  if not found then raise exception 'transfer_packages_not_reserved'; end if;
end; $$;
revoke all on function public.finalize_cargo_transfer(uuid) from public, anon, authenticated;

create or replace function public.confirm_cargo_handoff(p_transfer_id uuid, p_latitude double precision default null, p_longitude double precision default null)
returns text language plpgsql security definer set search_path = '' as $$
declare v_transfer public.cargo_transfers; v_driver uuid := public.current_driver_id(); v_status text;
begin
  select * into v_transfer from public.cargo_transfers where id = p_transfer_id and organization_id = public.current_organization_id() for update;
  if not found or v_transfer.status not in ('authorized', 'awaiting_source') then raise exception 'transfer_not_ready'; end if;
  if not exists (select 1 from public.trips t where t.id = v_transfer.source_trip_id and t.driver_id = v_driver) then raise exception 'source_driver_required'; end if;
  if v_transfer.source_confirmed_at is null then
    update public.cargo_transfers set source_confirmed_by = auth.uid(), source_confirmed_at = now(), updated_at = now() where id = p_transfer_id;
    insert into public.cargo_transfer_events (transfer_id, actor_user_id, event_type, details, latitude, longitude) values (p_transfer_id, auth.uid(), 'source_confirmed', 'Motorista de origem confirmou a entrega física.', p_latitude, p_longitude);
  end if;
  select case when receiver_confirmed_at is not null then 'completed' else 'awaiting_source' end into v_status from public.cargo_transfers where id = p_transfer_id;
  update public.cargo_transfers set status = v_status, updated_at = now() where id = p_transfer_id;
  if v_status = 'completed' then
    perform public.finalize_cargo_transfer(p_transfer_id);
    insert into public.cargo_transfer_events (transfer_id, actor_user_id, event_type, details) values (p_transfer_id, auth.uid(), 'completed', 'Custódia transferida para a viagem de destino.');
  end if;
  return v_status;
end; $$;
create or replace function public.accept_cargo_transfer(p_qr_token text, p_latitude double precision default null, p_longitude double precision default null)
returns text language plpgsql security definer set search_path = '' as $$
declare v_transfer public.cargo_transfers; v_status text;
begin
  if length(coalesce(p_qr_token, '')) <> 70 then raise exception 'invalid_qr_token'; end if;
  select * into v_transfer from public.cargo_transfers where organization_id = public.current_organization_id()
    and qr_token_hash = encode(extensions.digest(p_qr_token, 'sha256'), 'hex') for update;
  if not found or v_transfer.status not in ('authorized', 'awaiting_source') or v_transfer.qr_used_at is not null then raise exception 'qr_invalid_or_used'; end if;
  if v_transfer.qr_expires_at <= now() then
    update public.cargo_transfers set status = 'expired', updated_at = now() where id = v_transfer.id;
    update public.packages set active_cargo_transfer_id = null where active_cargo_transfer_id = v_transfer.id;
    return 'expired';
  end if;
  if not exists (select 1 from public.trips t where t.id = v_transfer.destination_trip_id and t.driver_id = public.current_driver_id()) then raise exception 'destination_driver_required'; end if;
  update public.cargo_transfers set receiver_confirmed_by = auth.uid(), receiver_confirmed_at = now(), qr_used_at = now(), qr_token_hash = null, updated_at = now() where id = v_transfer.id;
  insert into public.cargo_transfer_events (transfer_id, actor_user_id, event_type, details, latitude, longitude) values (v_transfer.id, auth.uid(), 'receiver_confirmed', 'Motorista de destino leu o QR e confirmou o recebimento.', p_latitude, p_longitude);
  select case when source_confirmed_at is not null then 'completed' else 'awaiting_source' end into v_status from public.cargo_transfers where id = v_transfer.id;
  update public.cargo_transfers set status = v_status, updated_at = now() where id = v_transfer.id;
  if v_status = 'completed' then
    perform public.finalize_cargo_transfer(v_transfer.id);
    insert into public.cargo_transfer_events (transfer_id, actor_user_id, event_type, details) values (v_transfer.id, auth.uid(), 'completed', 'Custódia transferida para a viagem de destino.');
  end if;
  return v_status;
end; $$;

grant execute on function public.request_cargo_transfer(uuid, uuid, uuid[], text, text) to authenticated;
grant execute on function public.reject_cargo_transfer(uuid, text) to authenticated;
grant execute on function public.accept_cargo_transfer(text, double precision, double precision) to authenticated;

