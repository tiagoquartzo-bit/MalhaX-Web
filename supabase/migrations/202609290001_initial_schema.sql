-- Activia Logistica: schema inicial.
-- RLS fica habilitado desde a criação; políticas específicas serão adicionadas
-- após fechar o modelo de organização e validar os papéis operacionais.
create extension if not exists pgcrypto with schema extensions;

create type public.app_role as enum ('admin', 'manager', 'dispatcher', 'support', 'driver', 'finance');
create type public.driver_status as enum ('draft', 'invited', 'pending_review', 'active', 'rejected', 'suspended', 'inactive');
create type public.order_status as enum ('draft', 'pending_dispatch', 'planned', 'in_progress', 'completed', 'exception', 'cancelled');
create type public.trip_status as enum ('draft', 'assigned', 'accepted', 'in_progress', 'completed', 'paused', 'cancelled');
create type public.stop_type as enum ('pickup', 'delivery', 'return_to_base');
create type public.stop_status as enum ('pending', 'arrived', 'in_progress', 'completed', 'failed', 'skipped');
create type public.package_status as enum ('expected', 'picked_up', 'in_transit', 'delivered', 'returned', 'exception');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  full_name text not null,
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  user_id uuid not null references public.profiles(id) on delete restrict,
  role public.app_role not null,
  granted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table public.drivers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references public.profiles(id) on delete restrict,
  status public.driver_status not null default 'draft',
  pix_key text,
  notes text,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  plate text not null unique,
  make_model text,
  capacity_description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.driver_documents (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(id) on delete restrict,
  document_type text not null,
  storage_path text not null unique,
  expires_at date,
  review_status text not null default 'pending' check (review_status in ('pending', 'approved', 'rejected', 'expired')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_name text,
  phone text,
  email text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number bigint generated always as identity unique,
  client_id uuid references public.clients(id) on delete restrict,
  external_reference text,
  status public.order_status not null default 'draft',
  freight_value numeric(12,2) not null default 0 check (freight_value >= 0),
  driver_payout numeric(12,2) check (driver_payout is null or driver_payout >= 0),
  currency char(3) not null default 'BRL',
  instructions text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.packages (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  package_code text not null unique default encode(extensions.gen_random_bytes(12), 'hex'),
  description text,
  quantity integer not null default 1 check (quantity > 0),
  weight_kg numeric(10,3) check (weight_kg is null or weight_kg >= 0),
  status public.package_status not null default 'expected',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  trip_number bigint generated always as identity unique,
  driver_id uuid not null references public.drivers(id) on delete restrict,
  vehicle_id uuid references public.vehicles(id) on delete restrict,
  status public.trip_status not null default 'draft',
  planned_start_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  assigned_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.trip_stops (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete restrict,
  sequence_number integer not null check (sequence_number > 0),
  stop_type public.stop_type not null,
  status public.stop_status not null default 'pending',
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
  planned_at timestamptz,
  arrived_at timestamptz,
  completed_at timestamptz,
  failure_reason text,
  unique (trip_id, sequence_number)
);

create table public.stop_orders (
  stop_id uuid not null references public.trip_stops(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete restrict,
  primary key (stop_id, order_id)
);

create table public.stop_packages (
  stop_id uuid not null references public.trip_stops(id) on delete restrict,
  package_id uuid not null references public.packages(id) on delete restrict,
  expected_action text not null check (expected_action in ('load', 'unload', 'return')),
  primary key (stop_id, package_id)
);

create table public.stop_events (
  id uuid primary key default gen_random_uuid(),
  stop_id uuid not null references public.trip_stops(id) on delete restrict,
  actor_user_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  from_status public.stop_status,
  to_status public.stop_status,
  reason text,
  device_event_id uuid not null,
  device_captured_at timestamptz,
  server_received_at timestamptz not null default now(),
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  location_accuracy_meters numeric(9,2) check (location_accuracy_meters is null or location_accuracy_meters >= 0),
  unique (actor_user_id, device_event_id)
);

create table public.delivery_proofs (
  id uuid primary key default gen_random_uuid(),
  stop_id uuid not null references public.trip_stops(id) on delete restrict,
  package_id uuid references public.packages(id) on delete restrict,
  uploaded_by uuid references public.profiles(id) on delete set null,
  storage_path text not null unique,
  recipient_name text,
  captured_at_device timestamptz,
  received_at_server timestamptz not null default now(),
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  location_accuracy_meters numeric(9,2) check (location_accuracy_meters is null or location_accuracy_meters >= 0),
  created_at timestamptz not null default now()
);

create table public.tracking_positions (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete restrict,
  driver_id uuid not null references public.drivers(id) on delete restrict,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy_meters numeric(9,2) check (accuracy_meters is null or accuracy_meters >= 0),
  captured_at_device timestamptz not null,
  received_at_server timestamptz not null default now(),
  device_event_id uuid not null,
  unique (driver_id, device_event_id)
);

create table public.incidents (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete restrict,
  stop_id uuid references public.trip_stops(id) on delete restrict,
  reported_by uuid references public.profiles(id) on delete set null,
  category text not null,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  description text not null,
  resolution text,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_table text not null,
  entity_id uuid,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index orders_status_created_idx on public.orders (status, created_at desc);
create index orders_client_idx on public.orders (client_id, created_at desc);
create index packages_order_idx on public.packages (order_id);
create index trips_driver_status_idx on public.trips (driver_id, status);
create index trip_stops_trip_status_idx on public.trip_stops (trip_id, status, sequence_number);
create index stop_events_stop_server_time_idx on public.stop_events (stop_id, server_received_at desc);
create index proofs_stop_idx on public.delivery_proofs (stop_id, received_at_server desc);
create index tracking_trip_server_time_idx on public.tracking_positions (trip_id, received_at_server desc);
create index incidents_open_idx on public.incidents (created_at desc) where resolved_at is null;
create index audit_entity_idx on public.audit_log (entity_table, entity_id, created_at desc);

-- Enable RLS on every table exposed through the Supabase Data API.
-- With no permissive policies, access is denied until the reviewed policy migration is applied.
do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'user_roles', 'drivers', 'vehicles', 'driver_documents', 'clients',
    'orders', 'packages', 'trips', 'trip_stops', 'stop_orders', 'stop_packages',
    'stop_events', 'delivery_proofs', 'tracking_positions', 'incidents', 'audit_log'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
