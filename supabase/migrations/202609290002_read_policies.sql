-- Baseline of least-privilege read access.
-- No client writes are granted in this migration. Mutations must be implemented
-- as validated, transactional server functions before the apps can write data.

create or replace function public.has_any_role(_roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and ur.role = any (_roles)
  );
$$;

create or replace function public.current_driver_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select d.id
  from public.drivers d
  where d.profile_id = (select auth.uid())
    and d.status = 'active'::public.driver_status
  limit 1;
$$;

create or replace function public.can_access_trip(_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.trips t
    where t.id = _trip_id
      and t.driver_id = public.current_driver_id()
  );
$$;

create or replace function public.can_access_stop(_stop_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.trip_stops s
    where s.id = _stop_id
      and public.can_access_trip(s.trip_id)
  );
$$;

create or replace function public.can_access_order(_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.stop_orders so
    join public.trip_stops s on s.id = so.stop_id
    where so.order_id = _order_id
      and public.can_access_trip(s.trip_id)
  );
$$;

create or replace function public.can_access_client(_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.orders o
    where o.client_id = _client_id
      and public.can_access_order(o.id)
  );
$$;

revoke all on function public.has_any_role(public.app_role[]) from public, anon;
revoke all on function public.current_driver_id() from public, anon;
revoke all on function public.can_access_trip(uuid) from public, anon;
revoke all on function public.can_access_stop(uuid) from public, anon;
revoke all on function public.can_access_order(uuid) from public, anon;
revoke all on function public.can_access_client(uuid) from public, anon;
grant execute on function public.has_any_role(public.app_role[]) to authenticated;
grant execute on function public.current_driver_id() to authenticated;
grant execute on function public.can_access_trip(uuid) to authenticated;
grant execute on function public.can_access_stop(uuid) to authenticated;
grant execute on function public.can_access_order(uuid) to authenticated;
grant execute on function public.can_access_client(uuid) to authenticated;

-- Supabase API: authenticated users get read only, scoped again by RLS.
-- Financial amounts are deliberately not granted on `orders`; expose them later
-- through a separately authorized finance RPC/view.
revoke all on public.profiles, public.user_roles, public.drivers,
  public.vehicles, public.driver_documents, public.clients, public.orders,
  public.packages, public.trips, public.trip_stops, public.stop_orders,
  public.stop_packages, public.stop_events, public.delivery_proofs,
  public.tracking_positions, public.incidents, public.audit_log from anon, authenticated;
grant select on public.profiles, public.user_roles,
  public.vehicles, public.driver_documents, public.clients,
  public.packages, public.trips, public.trip_stops, public.stop_orders,
  public.stop_packages, public.stop_events, public.delivery_proofs,
  public.tracking_positions, public.incidents, public.audit_log to authenticated;
grant select (id, profile_id, status, approved_by, approved_at, created_at, updated_at)
  on public.drivers to authenticated;
grant select (id, order_number, client_id, external_reference, status,
  currency, instructions, created_by, created_at, updated_at)
  on public.orders to authenticated;

-- Profiles and role assignments.
create policy profiles_read_self_or_ops on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.has_any_role(array[
    'admin'::public.app_role, 'manager'::public.app_role,
    'dispatcher'::public.app_role, 'support'::public.app_role,
    'finance'::public.app_role
  ]));

create policy user_roles_read_self_or_admin on public.user_roles
  for select to authenticated
  using (user_id = (select auth.uid()) or public.has_any_role(array['admin'::public.app_role]));

create policy drivers_read_self_or_ops on public.drivers
  for select to authenticated
  using (profile_id = (select auth.uid()) or public.has_any_role(array[
    'admin'::public.app_role, 'manager'::public.app_role,
    'dispatcher'::public.app_role, 'support'::public.app_role
  ]));

create policy vehicles_read_ops_or_assigned on public.vehicles
  for select to authenticated
  using (
    public.has_any_role(array[
      'admin'::public.app_role, 'manager'::public.app_role,
      'dispatcher'::public.app_role, 'support'::public.app_role
    ])
    or exists (
      select 1 from public.trips t
      where t.vehicle_id = vehicles.id
        and t.driver_id = public.current_driver_id()
    )
  );

create policy driver_documents_read_owner_or_reviewers on public.driver_documents
  for select to authenticated
  using (
    exists (select 1 from public.drivers d
      where d.id = driver_documents.driver_id and d.profile_id = (select auth.uid()))
    or public.has_any_role(array['admin'::public.app_role, 'manager'::public.app_role])
  );

create policy clients_read_ops_or_assigned on public.clients
  for select to authenticated
  using (
    public.has_any_role(array[
      'admin'::public.app_role, 'manager'::public.app_role,
      'dispatcher'::public.app_role, 'support'::public.app_role
    ]) or public.can_access_client(id)
  );

-- Orders: operations can read all non-financial fields; drivers only assigned work.
create policy orders_read_ops_or_assigned on public.orders
  for select to authenticated
  using (
    public.has_any_role(array[
      'admin'::public.app_role, 'manager'::public.app_role,
      'dispatcher'::public.app_role, 'support'::public.app_role
    ]) or public.can_access_order(id)
  );

create policy packages_read_ops_or_assigned on public.packages
  for select to authenticated
  using (
    public.has_any_role(array[
      'admin'::public.app_role, 'manager'::public.app_role,
      'dispatcher'::public.app_role, 'support'::public.app_role
    ]) or public.can_access_order(order_id)
  );

create policy trips_read_ops_or_assigned on public.trips
  for select to authenticated
  using (
    public.has_any_role(array[
      'admin'::public.app_role, 'manager'::public.app_role,
      'dispatcher'::public.app_role, 'support'::public.app_role,
      'finance'::public.app_role
    ]) or driver_id = public.current_driver_id()
  );

create policy trip_stops_read_ops_or_assigned on public.trip_stops
  for select to authenticated
  using (
    public.has_any_role(array[
      'admin'::public.app_role, 'manager'::public.app_role,
      'dispatcher'::public.app_role, 'support'::public.app_role
    ]) or public.can_access_trip(trip_id)
  );

create policy stop_orders_read_ops_or_assigned on public.stop_orders
  for select to authenticated
  using (
    public.has_any_role(array[
      'admin'::public.app_role, 'manager'::public.app_role,
      'dispatcher'::public.app_role, 'support'::public.app_role
    ]) or public.can_access_stop(stop_id)
  );

create policy stop_packages_read_ops_or_assigned on public.stop_packages
  for select to authenticated
  using (
    public.has_any_role(array[
      'admin'::public.app_role, 'manager'::public.app_role,
      'dispatcher'::public.app_role, 'support'::public.app_role
    ]) or public.can_access_stop(stop_id)
  );

create policy stop_events_read_ops_or_assigned on public.stop_events
  for select to authenticated
  using (
    public.has_any_role(array[
      'admin'::public.app_role, 'manager'::public.app_role,
      'dispatcher'::public.app_role, 'support'::public.app_role
    ]) or public.can_access_stop(stop_id)
  );

create policy proofs_read_ops_or_assigned on public.delivery_proofs
  for select to authenticated
  using (
    public.has_any_role(array[
      'admin'::public.app_role, 'manager'::public.app_role,
      'dispatcher'::public.app_role, 'support'::public.app_role
    ]) or public.can_access_stop(stop_id)
  );

create policy tracking_read_ops_or_owner on public.tracking_positions
  for select to authenticated
  using (
    public.has_any_role(array[
      'admin'::public.app_role, 'manager'::public.app_role,
      'dispatcher'::public.app_role, 'support'::public.app_role
    ]) or driver_id = public.current_driver_id()
  );

create policy incidents_read_ops_or_assigned on public.incidents
  for select to authenticated
  using (
    public.has_any_role(array[
      'admin'::public.app_role, 'manager'::public.app_role,
      'dispatcher'::public.app_role, 'support'::public.app_role
    ]) or public.can_access_trip(trip_id)
  );

create policy audit_log_read_admin_manager on public.audit_log
  for select to authenticated
  using (public.has_any_role(array['admin'::public.app_role, 'manager'::public.app_role]));

comment on function public.can_access_trip(uuid) is
  'RLS helper: true only when the authenticated user is the active driver assigned to this trip.';
comment on table public.orders is
  'Direct client reads exclude freight_value and driver_payout; financial access must use separately authorized server operations.';
