-- Transferência auditável de custódia de volumes entre viagens.
-- QR contém somente token opaco, aleatório, com validade curta e uso único.
alter table public.packages
  add column if not exists custodian_trip_id uuid references public.trips(id) on delete restrict;

create table public.cargo_transfers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  source_trip_id uuid not null references public.trips(id) on delete restrict,
  destination_trip_id uuid not null references public.trips(id) on delete restrict,
  reason text not null check (reason in ('planned_handoff', 'vehicle_breakdown', 'route_change')),
  details text not null check (length(btrim(details)) between 5 and 1000),
  status text not null default 'pending_support' check (status in (
    'pending_support', 'authorized', 'awaiting_source', 'completed', 'rejected', 'expired'
  )),
  requested_by uuid not null references auth.users(id) on delete restrict,
  requested_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  qr_token_hash text unique,
  qr_expires_at timestamptz,
  qr_used_at timestamptz,
  source_confirmed_by uuid references auth.users(id) on delete set null,
  source_confirmed_at timestamptz,
  receiver_confirmed_by uuid references auth.users(id) on delete set null,
  receiver_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (source_trip_id <> destination_trip_id),
  check ((qr_token_hash is null) = (qr_expires_at is null))
);
create index cargo_transfers_org_status_idx on public.cargo_transfers (organization_id, status, requested_at desc);
create index cargo_transfers_source_idx on public.cargo_transfers (source_trip_id, status);
create index cargo_transfers_destination_idx on public.cargo_transfers (destination_trip_id, status);

create table public.cargo_transfer_items (
  transfer_id uuid not null references public.cargo_transfers(id) on delete restrict,
  package_id uuid not null references public.packages(id) on delete restrict,
  primary key (transfer_id, package_id)
);
create index cargo_transfer_items_package_idx on public.cargo_transfer_items(package_id);

create table public.cargo_transfer_events (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid not null references public.cargo_transfers(id) on delete restrict,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  event_type text not null check (event_type in ('requested', 'authorized', 'rejected', 'receiver_confirmed', 'source_confirmed', 'completed')),
  details text,
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  occurred_at timestamptz not null default now()
);
create index cargo_transfer_events_transfer_idx on public.cargo_transfer_events(transfer_id, occurred_at);

alter table public.cargo_transfers enable row level security;
alter table public.cargo_transfer_items enable row level security;
alter table public.cargo_transfer_events enable row level security;
revoke all on public.cargo_transfers, public.cargo_transfer_items, public.cargo_transfer_events from anon, authenticated;
grant select on public.cargo_transfers, public.cargo_transfer_items, public.cargo_transfer_events to authenticated;

create policy cargo_transfers_read_involved on public.cargo_transfers for select to authenticated using (
  organization_id = public.current_organization_id() and (
    public.has_any_role(array['admin'::public.app_role, 'manager'::public.app_role, 'dispatcher'::public.app_role, 'support'::public.app_role])
    or exists (select 1 from public.trips t join public.drivers d on d.id = t.driver_id where t.id in (source_trip_id, destination_trip_id) and d.profile_id = (select auth.uid()))
  )
);
create policy cargo_transfer_items_read_involved on public.cargo_transfer_items for select to authenticated using (
  exists (select 1 from public.cargo_transfers x where x.id = transfer_id and x.organization_id = public.current_organization_id() and (
    public.has_any_role(array['admin'::public.app_role, 'manager'::public.app_role, 'dispatcher'::public.app_role, 'support'::public.app_role])
    or exists (select 1 from public.trips t join public.drivers d on d.id = t.driver_id where t.id in (x.source_trip_id, x.destination_trip_id) and d.profile_id = (select auth.uid()))
  ))
);
create policy cargo_transfer_events_read_involved on public.cargo_transfer_events for select to authenticated using (
  exists (select 1 from public.cargo_transfers x where x.id = transfer_id and x.organization_id = public.current_organization_id() and (
    public.has_any_role(array['admin'::public.app_role, 'manager'::public.app_role, 'dispatcher'::public.app_role, 'support'::public.app_role])
    or exists (select 1 from public.trips t join public.drivers d on d.id = t.driver_id where t.id in (x.source_trip_id, x.destination_trip_id) and d.profile_id = (select auth.uid()))
  ))
);

create or replace function public.request_cargo_transfer(
  p_source_trip_id uuid,
  p_destination_trip_id uuid,
  p_package_ids uuid[],
  p_reason text,
  p_details text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := public.current_organization_id();
  v_id uuid;
  v_count integer;
begin
  if auth.uid() is null or v_org is null then raise exception 'not_authenticated'; end if;
  if p_source_trip_id = p_destination_trip_id then raise exception 'trips_must_differ'; end if;
  if p_reason not in ('planned_handoff', 'vehicle_breakdown', 'route_change') or length(btrim(coalesce(p_details, ''))) not between 5 and 1000 then raise exception 'invalid_transfer_details'; end if;
  if coalesce(array_length(p_package_ids, 1), 0) < 1 or array_length(p_package_ids, 1) > 100 then raise exception 'invalid_package_count'; end if;
  if not (public.has_any_role(array['admin'::public.app_role, 'manager'::public.app_role, 'dispatcher'::public.app_role, 'support'::public.app_role])
    or exists (select 1 from public.trips t join public.drivers d on d.id = t.driver_id where t.id = p_source_trip_id and t.organization_id = v_org and d.profile_id = auth.uid())) then raise exception 'not_allowed'; end if;
  if not exists (select 1 from public.trips t join public.drivers d on d.id = t.driver_id join public.profiles p on p.id = d.profile_id and p.active where t.id = p_source_trip_id and t.organization_id = v_org and t.status in ('assigned'::public.trip_status, 'accepted'::public.trip_status, 'in_progress'::public.trip_status)) then raise exception 'source_trip_unavailable'; end if;
  if not exists (select 1 from public.trips t join public.drivers d on d.id = t.driver_id join public.profiles p on p.id = d.profile_id and p.active where t.id = p_destination_trip_id and t.organization_id = v_org and t.status in ('assigned'::public.trip_status, 'accepted'::public.trip_status, 'in_progress'::public.trip_status)) then raise exception 'destination_trip_unavailable'; end if;
  select count(distinct p.id) into v_count
  from public.packages p
  join public.stop_packages sp on sp.package_id = p.id and sp.expected_action = 'unload'
  join public.trip_stops s on s.id = sp.stop_id and s.trip_id = p_source_trip_id and s.status not in ('completed'::public.stop_status, 'skipped'::public.stop_status)
  where p.id = any(p_package_ids) and p.status in ('picked_up'::public.package_status, 'in_transit'::public.package_status)
    and (p.custodian_trip_id is null or p.custodian_trip_id = p_source_trip_id);
  if v_count <> cardinality(array(select distinct unnest(p_package_ids))) then raise exception 'package_not_on_source_trip'; end if;
  insert into public.cargo_transfers (organization_id, source_trip_id, destination_trip_id, reason, details, requested_by)
  values (v_org, p_source_trip_id, p_destination_trip_id, p_reason, btrim(p_details), auth.uid()) returning id into v_id;
  insert into public.cargo_transfer_items (transfer_id, package_id) select v_id, unnest(p_package_ids);
  insert into public.cargo_transfer_events (transfer_id, actor_user_id, event_type, details) values (v_id, auth.uid(), 'requested', btrim(p_details));
  return v_id;
end; $$;

create or replace function public.approve_cargo_transfer(p_transfer_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_transfer public.cargo_transfers; v_token text;
begin
  if auth.uid() is null or not public.has_any_role(array['admin'::public.app_role, 'manager'::public.app_role, 'support'::public.app_role]) then raise exception 'support_approval_required'; end if;
  select * into v_transfer from public.cargo_transfers where id = p_transfer_id and organization_id = public.current_organization_id() for update;
  if not found or v_transfer.status <> 'pending_support' then raise exception 'transfer_not_pending'; end if;
  v_token := 'MXTR1-' || encode(extensions.gen_random_bytes(32), 'hex');
  update public.cargo_transfers set status = 'authorized', reviewed_by = auth.uid(), reviewed_at = now(), qr_token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex'), qr_expires_at = now() + interval '15 minutes', updated_at = now() where id = p_transfer_id;
  insert into public.cargo_transfer_events (transfer_id, actor_user_id, event_type) values (p_transfer_id, auth.uid(), 'authorized');
  return v_token;
end; $$;

create or replace function public.reject_cargo_transfer(p_transfer_id uuid, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.has_any_role(array['admin'::public.app_role, 'manager'::public.app_role, 'support'::public.app_role]) then raise exception 'support_approval_required'; end if;
  update public.cargo_transfers set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), review_note = left(btrim(p_note), 1000), updated_at = now()
  where id = p_transfer_id and organization_id = public.current_organization_id() and status = 'pending_support';
  if not found then raise exception 'transfer_not_pending'; end if;
  insert into public.cargo_transfer_events (transfer_id, actor_user_id, event_type, details) values (p_transfer_id, auth.uid(), 'rejected', left(btrim(p_note), 1000));
end; $$;

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
    update public.packages p set custodian_trip_id = v_transfer.destination_trip_id
    where p.id in (select package_id from public.cargo_transfer_items where transfer_id = p_transfer_id);
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
    raise exception 'qr_expired';
  end if;
  if not exists (select 1 from public.trips t where t.id = v_transfer.destination_trip_id and t.driver_id = public.current_driver_id()) then raise exception 'destination_driver_required'; end if;
  update public.cargo_transfers set receiver_confirmed_by = auth.uid(), receiver_confirmed_at = now(), qr_used_at = now(), qr_token_hash = null, updated_at = now() where id = v_transfer.id;
  insert into public.cargo_transfer_events (transfer_id, actor_user_id, event_type, details, latitude, longitude) values (v_transfer.id, auth.uid(), 'receiver_confirmed', 'Motorista de destino leu o QR e confirmou o recebimento.', p_latitude, p_longitude);
  select case when source_confirmed_at is not null then 'completed' else 'awaiting_source' end into v_status from public.cargo_transfers where id = v_transfer.id;
  update public.cargo_transfers set status = v_status, updated_at = now() where id = v_transfer.id;
  if v_status = 'completed' then
    update public.packages p set custodian_trip_id = v_transfer.destination_trip_id
    where p.id in (select package_id from public.cargo_transfer_items where transfer_id = v_transfer.id);
    insert into public.cargo_transfer_events (transfer_id, actor_user_id, event_type, details) values (v_transfer.id, auth.uid(), 'completed', 'Custódia transferida para a viagem de destino.');
  end if;
  return v_status;
end; $$;

revoke all on function public.request_cargo_transfer(uuid, uuid, uuid[], text, text) from public, anon;
revoke all on function public.approve_cargo_transfer(uuid) from public, anon;
revoke all on function public.reject_cargo_transfer(uuid, text) from public, anon;
revoke all on function public.confirm_cargo_handoff(uuid, double precision, double precision) from public, anon;
revoke all on function public.accept_cargo_transfer(text, double precision, double precision) from public, anon;
grant execute on function public.request_cargo_transfer(uuid, uuid, uuid[], text, text) to authenticated;
grant execute on function public.approve_cargo_transfer(uuid) to authenticated;
grant execute on function public.reject_cargo_transfer(uuid, text) to authenticated;
grant execute on function public.confirm_cargo_handoff(uuid, double precision, double precision) to authenticated;
grant execute on function public.accept_cargo_transfer(text, double precision, double precision) to authenticated;
