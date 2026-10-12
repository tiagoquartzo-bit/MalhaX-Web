-- Keep the driver's assigned route current while the app is open.
-- Row visibility remains governed by the existing table RLS policies.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'trips'
    ) then
      alter publication supabase_realtime add table public.trips;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'trip_stops'
    ) then
      alter publication supabase_realtime add table public.trip_stops;
    end if;
  end if;
end;
$$;
