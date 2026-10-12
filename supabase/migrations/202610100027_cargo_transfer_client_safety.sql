-- Expose only safe fields to clients and notify assigned drivers about custody changes.
revoke select on public.cargo_transfers from authenticated;
grant select (id, organization_id, source_trip_id, destination_trip_id, reason, details, status, requested_at, reviewed_at, review_note, source_confirmed_at, receiver_confirmed_at, created_at, updated_at)
  on public.cargo_transfers to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'cargo_transfers') then
      alter publication supabase_realtime add table public.cargo_transfers;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'packages') then
      alter publication supabase_realtime add table public.packages;
    end if;
  end if;
end;
$$;
