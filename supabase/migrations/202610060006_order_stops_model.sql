-- Modelo de coleta/entrega anterior ao despacho e tentativas de execução por viagem.
-- Esta migration é aditiva; não altera nem aplica políticas detalhadas de segurança.

create type public.order_stop_status as enum (
  'pending_dispatch', 'assigned', 'completed', 'exception', 'cancelled'
);

alter type public.order_status add value if not exists 'partially_assigned';

create table public.order_stops (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  stop_type public.stop_type not null check (stop_type in ('pickup', 'delivery')),
  status public.order_stop_status not null default 'pending_dispatch',
  address_label text not null,
  address_line text not null,
  address_extra text,
  district text,
  city text,
  state text,
  postal_code text,
  contact_name text,
  contact_phone text,
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  instructions text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, id)
);

create index order_stops_order_status_idx on public.order_stops (order_id, status);
create index order_stops_type_status_idx on public.order_stops (stop_type, status, created_at);

-- Mesmo pedido protege o vínculo entre tarefa e volume por chave estrangeira composta.
alter table public.packages add constraint packages_order_id_id_key unique (order_id, id);

create table public.order_stop_packages (
  order_id uuid not null,
  order_stop_id uuid not null,
  package_id uuid not null,
  expected_action text not null check (expected_action in ('load', 'unload', 'return')),
  created_at timestamptz not null default now(),
  primary key (order_stop_id, package_id),
  foreign key (order_stop_id, order_id)
    references public.order_stops(id, order_id) on delete restrict,
  foreign key (package_id, order_id)
    references public.packages(id, order_id) on delete restrict
);

-- Um volume é coletado uma vez e entregue uma vez no fluxo normal.
create unique index order_stop_packages_one_load_idx
  on public.order_stop_packages (package_id) where expected_action = 'load';
create unique index order_stop_packages_one_unload_idx
  on public.order_stop_packages (package_id) where expected_action = 'unload';
create index order_stop_packages_package_idx on public.order_stop_packages (package_id);

create or replace function public.validate_order_stop_package_action()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type public.stop_type;
begin
  select os.stop_type into v_type
  from public.order_stops os
  where os.id = new.order_stop_id and os.order_id = new.order_id;

  if v_type is null then
    raise exception 'order_stop_not_found' using errcode = '22023';
  end if;
  if (v_type = 'pickup' and new.expected_action <> 'load')
     or (v_type = 'delivery' and new.expected_action not in ('unload', 'return')) then
    raise exception 'package_action_does_not_match_stop_type' using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function public.validate_order_stop_package_action() from public, anon, authenticated;
create trigger order_stop_packages_validate_action
before insert or update on public.order_stop_packages
for each row execute function public.validate_order_stop_package_action();

-- A tarefa solicitada é independente da tentativa executada. Cada nova tentativa
-- ganha uma nova trip_stop e attempt_number, preservando falhas e reentregas.
alter table public.trip_stops
  add column source_order_stop_id uuid references public.order_stops(id) on delete restrict,
  add column attempt_number integer not null default 1 check (attempt_number > 0);

create unique index trip_stops_task_attempt_idx
  on public.trip_stops (source_order_stop_id, attempt_number)
  where source_order_stop_id is not null;
create index trip_stops_source_task_idx on public.trip_stops (source_order_stop_id);

create trigger order_stops_set_updated_at
before update on public.order_stops
for each row execute function public.set_updated_at();

alter table public.order_stops enable row level security;
alter table public.order_stop_packages enable row level security;

comment on table public.order_stops is
  'Tarefas/endereço solicitados antes do despacho. Um pedido aceita qualquer quantidade independente de coletas e entregas.';
comment on table public.order_stop_packages is
  'Volumes esperados em cada tarefa solicitada; vínculo garante que tarefa e volume pertencem ao mesmo pedido.';
comment on column public.trip_stops.source_order_stop_id is
  'Tarefa solicitada de origem; NULL para paradas sem pedido, como retorno à base.';
comment on column public.trip_stops.attempt_number is
  'Número da tentativa desta tarefa na rota; falhas ficam preservadas em tentativas anteriores.';
