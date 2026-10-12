-- Consuming or expiring the QR clears both coupled token fields.
create or replace function public.accept_cargo_transfer(p_qr_token text, p_latitude double precision default null, p_longitude double precision default null)
returns text language plpgsql security definer set search_path = '' as $$
declare v_transfer public.cargo_transfers; v_status text;
begin
  if length(coalesce(p_qr_token, '')) <> 70 then raise exception 'invalid_qr_token'; end if;
  select * into v_transfer from public.cargo_transfers where organization_id = public.current_organization_id()
    and qr_token_hash = encode(extensions.digest(p_qr_token, 'sha256'), 'hex') for update;
  if not found or v_transfer.status not in ('authorized', 'awaiting_source') or v_transfer.qr_used_at is not null then raise exception 'qr_invalid_or_used'; end if;
  if v_transfer.qr_expires_at <= now() then
    update public.cargo_transfers set status = 'expired', qr_token_hash = null, qr_expires_at = null, updated_at = now() where id = v_transfer.id;
    update public.packages set active_cargo_transfer_id = null where active_cargo_transfer_id = v_transfer.id;
    return 'expired';
  end if;
  if not exists (select 1 from public.trips t where t.id = v_transfer.destination_trip_id and t.driver_id = public.current_driver_id()) then raise exception 'destination_driver_required'; end if;
  update public.cargo_transfers set receiver_confirmed_by = auth.uid(), receiver_confirmed_at = now(), qr_used_at = now(), qr_token_hash = null, qr_expires_at = null, updated_at = now() where id = v_transfer.id;
  insert into public.cargo_transfer_events (transfer_id, actor_user_id, event_type, details, latitude, longitude) values (v_transfer.id, auth.uid(), 'receiver_confirmed', 'Motorista de destino leu o QR e confirmou o recebimento.', p_latitude, p_longitude);
  select case when source_confirmed_at is not null then 'completed' else 'awaiting_source' end into v_status from public.cargo_transfers where id = v_transfer.id;
  update public.cargo_transfers set status = v_status, updated_at = now() where id = v_transfer.id;
  if v_status = 'completed' then
    perform public.finalize_cargo_transfer(v_transfer.id);
    insert into public.cargo_transfer_events (transfer_id, actor_user_id, event_type, details) values (v_transfer.id, auth.uid(), 'completed', 'Custódia transferida para a viagem de destino.');
  end if;
  return v_status;
end; $$;
revoke all on function public.accept_cargo_transfer(text, double precision, double precision) from public, anon;
grant execute on function public.accept_cargo_transfer(text, double precision, double precision) to authenticated;
