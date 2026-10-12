-- Publica novas posições GPS para o acompanhamento do backoffice.
-- A leitura continua protegida por RLS; só clientes autorizados recebem os eventos.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'tracking_positions'
     ) then
    alter publication supabase_realtime add table public.tracking_positions;
  end if;
end;
$$;
