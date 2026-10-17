-- 034: Faturamento de clientes (frete negociado por pedido) e pagamento de motoristas (diária ou valor por viagem).
-- Valores financeiros só são lidos e gravados por funções que exigem papel admin, manager ou finance.

create or replace function public.can_manage_finance()
returns boolean language sql stable security definer set search_path to '' as $$
  select public.has_any_role(array['admin', 'manager', 'finance']::public.app_role[]);
$$;
revoke all on function public.can_manage_finance() from public, anon;
grant execute on function public.can_manage_finance() to authenticated;

-- Momento em que o pedido foi concluído (última parada concluída).
create or replace function public.order_completed_at(p_order_id uuid)
returns timestamptz language sql stable security definer set search_path to '' as $$
  select max(ts.completed_at)
  from public.trip_stops ts join public.order_stops os on os.id = ts.source_order_stop_id
  where os.order_id = p_order_id and ts.status = 'completed';
$$;
revoke all on function public.order_completed_at(uuid) from public, anon, authenticated;

-- ---------- Tabelas ----------
create table public.driver_pay_settings (
  driver_id uuid primary key references public.drivers(id) on delete restrict,
  organization_id uuid not null references public.organizations(id),
  pay_mode text not null check (pay_mode in ('daily', 'per_trip')),
  amount numeric(12,2) not null check (amount > 0 and amount <= 1000000),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create table public.driver_payouts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  driver_id uuid not null references public.drivers(id) on delete restrict,
  period_start date not null,
  period_end date not null check (period_end >= period_start),
  pay_mode text not null check (pay_mode in ('daily', 'per_trip')),
  rate numeric(12,2) not null,
  trips_count integer not null default 0,
  days_worked integer not null default 0,
  base_amount numeric(12,2) not null default 0,
  adjustments_amount numeric(12,2) not null default 0,
  total_amount numeric(12,2) not null default 0,
  status text not null default 'open' check (status in ('open', 'paid', 'cancelled')),
  payment_reference text,
  paid_at timestamptz,
  paid_by uuid references auth.users(id),
  cancelled_reason text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.driver_payout_trips (
  payout_id uuid not null references public.driver_payouts(id) on delete restrict,
  trip_id uuid not null references public.trips(id) on delete restrict,
  work_date date not null,
  active boolean not null default true,
  primary key (payout_id, trip_id)
);
create unique index driver_payout_trips_one_active on public.driver_payout_trips (trip_id) where active;

create table public.driver_pay_adjustments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  driver_id uuid not null references public.drivers(id) on delete restrict,
  reference_date date not null,
  amount numeric(12,2) not null check (amount <> 0 and abs(amount) <= 1000000),
  reason text not null check (length(btrim(reason)) between 3 and 500),
  payout_id uuid references public.driver_payouts(id),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.client_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number bigint generated always as identity,
  organization_id uuid not null references public.organizations(id),
  client_id uuid not null references public.clients(id) on delete restrict,
  period_start date not null,
  period_end date not null check (period_end >= period_start),
  due_date date,
  orders_count integer not null default 0,
  total_amount numeric(12,2) not null default 0,
  status text not null default 'open' check (status in ('open', 'issued', 'paid', 'cancelled')),
  notes text,
  payment_reference text,
  issued_at timestamptz,
  paid_at timestamptz,
  cancelled_reason text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.client_invoice_items (
  invoice_id uuid not null references public.client_invoices(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete restrict,
  amount numeric(12,2) not null,
  completed_at timestamptz,
  active boolean not null default true,
  primary key (invoice_id, order_id)
);
create unique index client_invoice_items_one_active on public.client_invoice_items (order_id) where active;

-- Leitura apenas para financeiro/gestão da própria empresa; escrita só pelas funções abaixo.
alter table public.driver_pay_settings enable row level security;
alter table public.driver_payouts enable row level security;
alter table public.driver_payout_trips enable row level security;
alter table public.driver_pay_adjustments enable row level security;
alter table public.client_invoices enable row level security;
alter table public.client_invoice_items enable row level security;

create policy driver_pay_settings_finance_read on public.driver_pay_settings for select to authenticated
  using (organization_id = public.current_organization_id() and public.can_manage_finance());
create policy driver_payouts_finance_read on public.driver_payouts for select to authenticated
  using (organization_id = public.current_organization_id() and public.can_manage_finance());
create policy driver_payout_trips_finance_read on public.driver_payout_trips for select to authenticated
  using (exists (select 1 from public.driver_payouts p where p.id = payout_id and p.organization_id = public.current_organization_id()) and public.can_manage_finance());
create policy driver_pay_adjustments_finance_read on public.driver_pay_adjustments for select to authenticated
  using (organization_id = public.current_organization_id() and public.can_manage_finance());
create policy client_invoices_finance_read on public.client_invoices for select to authenticated
  using (organization_id = public.current_organization_id() and public.can_manage_finance());
create policy client_invoice_items_finance_read on public.client_invoice_items for select to authenticated
  using (exists (select 1 from public.client_invoices i where i.id = invoice_id and i.organization_id = public.current_organization_id()) and public.can_manage_finance());

grant select on public.driver_pay_settings, public.driver_payouts, public.driver_payout_trips,
  public.driver_pay_adjustments, public.client_invoices, public.client_invoice_items to authenticated;

-- ---------- Frete do pedido ----------
create or replace function public.set_order_freight(p_order_id uuid, p_value numeric, p_reason text)
returns numeric language plpgsql security definer set search_path to '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_org uuid := public.current_organization_id();
  v_order public.orders%rowtype;
  v_reason text := nullif(btrim(p_reason), '');
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if v_org is null or not public.can_manage_finance() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_value is null or p_value < 0 or p_value > 10000000 then raise exception 'invalid_amount' using errcode = '22023'; end if;
  if v_reason is null then raise exception 'reason_required' using errcode = '22023'; end if;
  select * into v_order from public.orders o where o.id = p_order_id and o.organization_id = v_org for update;
  if not found then raise exception 'order_not_found' using errcode = 'P0002'; end if;
  if exists (
    select 1 from public.client_invoice_items it join public.client_invoices i on i.id = it.invoice_id
    where it.order_id = p_order_id and it.active and i.status in ('issued', 'paid')
  ) then raise exception 'order_already_invoiced' using errcode = '22023'; end if;
  update public.orders set freight_value = p_value where id = p_order_id;
  -- Fatura ainda aberta acompanha o novo valor.
  update public.client_invoice_items set amount = p_value where order_id = p_order_id and active;
  update public.client_invoices i set total_amount = (select coalesce(sum(amount), 0) from public.client_invoice_items it where it.invoice_id = i.id and it.active)
  where i.id in (select invoice_id from public.client_invoice_items where order_id = p_order_id and active);
  insert into public.audit_log (actor_user_id, action, entity_table, entity_id, reason, metadata)
  values (v_uid, 'set_order_freight', 'orders', p_order_id, v_reason, jsonb_build_object('from', v_order.freight_value, 'to', p_value, 'organization_id', v_org));
  return p_value;
end $$;

create or replace function public.order_financials(p_order_ids uuid[])
returns table (order_id uuid, freight_value numeric, completed_at timestamptz, invoice_id uuid, invoice_number bigint, invoice_status text)
language plpgsql stable security definer set search_path to '' as $$
begin
  if not public.can_manage_finance() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  select o.id, o.freight_value, public.order_completed_at(o.id), i.id, i.invoice_number, i.status
  from public.orders o
  left join public.client_invoice_items it on it.order_id = o.id and it.active
  left join public.client_invoices i on i.id = it.invoice_id
  where o.id = any (p_order_ids) and o.organization_id = public.current_organization_id();
end $$;

-- ---------- Visão de faturamento por cliente ----------
create or replace function public.billing_overview(p_start date, p_end date)
returns table (client_id uuid, client_name text, completed_orders integer, freight_total numeric, orders_without_freight integer,
  invoiced_orders integer, invoiced_amount numeric, pending_orders integer, pending_amount numeric)
language plpgsql stable security definer set search_path to '' as $$
declare v_org uuid := public.current_organization_id();
begin
  if v_org is null or not public.can_manage_finance() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_start is null or p_end is null or p_end < p_start then raise exception 'invalid_period' using errcode = '22023'; end if;
  return query
  with done as (
    select o.id, o.client_id, o.freight_value, public.order_completed_at(o.id) as completed_at
    from public.orders o where o.organization_id = v_org and o.status = 'completed'
  ), period as (
    select d.*, exists (select 1 from public.client_invoice_items it where it.order_id = d.id and it.active) as invoiced
    from done d where (d.completed_at at time zone 'America/Sao_Paulo')::date between p_start and p_end
  )
  select c.id, c.name, count(p.id)::integer, coalesce(sum(p.freight_value), 0),
    count(p.id) filter (where coalesce(p.freight_value, 0) = 0)::integer,
    count(p.id) filter (where p.invoiced)::integer, coalesce(sum(p.freight_value) filter (where p.invoiced), 0),
    count(p.id) filter (where not p.invoiced)::integer, coalesce(sum(p.freight_value) filter (where not p.invoiced), 0)
  from period p join public.clients c on c.id = p.client_id
  group by c.id, c.name order by c.name;
end $$;

create or replace function public.create_client_invoice(p_client_id uuid, p_start date, p_end date, p_due_date date, p_notes text)
returns uuid language plpgsql security definer set search_path to '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_org uuid := public.current_organization_id();
  v_invoice uuid;
  v_count integer;
  v_zero integer;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if v_org is null or not public.can_manage_finance() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_start is null or p_end is null or p_end < p_start then raise exception 'invalid_period' using errcode = '22023'; end if;
  if not exists (select 1 from public.clients c where c.id = p_client_id and c.organization_id = v_org) then raise exception 'client_unavailable' using errcode = '22023'; end if;

  create temporary table tmp_invoice_orders on commit drop as
  select o.id, o.freight_value, public.order_completed_at(o.id) as completed_at
  from public.orders o
  where o.organization_id = v_org and o.client_id = p_client_id and o.status = 'completed'
    and not exists (select 1 from public.client_invoice_items it where it.order_id = o.id and it.active);
  delete from tmp_invoice_orders where (completed_at at time zone 'America/Sao_Paulo')::date not between p_start and p_end;

  select count(*), count(*) filter (where coalesce(freight_value, 0) = 0) into v_count, v_zero from tmp_invoice_orders;
  if v_count = 0 then raise exception 'no_orders_to_invoice' using errcode = '22023'; end if;
  if v_zero > 0 then raise exception 'orders_without_freight: %', v_zero using errcode = '22023'; end if;

  insert into public.client_invoices (organization_id, client_id, period_start, period_end, due_date, notes, created_by)
  values (v_org, p_client_id, p_start, p_end, p_due_date, nullif(btrim(p_notes), ''), v_uid) returning id into v_invoice;
  insert into public.client_invoice_items (invoice_id, order_id, amount, completed_at)
  select v_invoice, id, freight_value, completed_at from tmp_invoice_orders;
  update public.client_invoices set orders_count = v_count,
    total_amount = (select coalesce(sum(amount), 0) from public.client_invoice_items where invoice_id = v_invoice)
  where id = v_invoice;
  insert into public.audit_log (actor_user_id, action, entity_table, entity_id, metadata)
  values (v_uid, 'create_client_invoice', 'client_invoices', v_invoice, jsonb_build_object('client_id', p_client_id, 'orders', v_count, 'organization_id', v_org));
  return v_invoice;
end $$;

create or replace function public.set_client_invoice_status(p_invoice_id uuid, p_status text, p_reference text, p_reason text)
returns text language plpgsql security definer set search_path to '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_org uuid := public.current_organization_id();
  v_invoice public.client_invoices%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if v_org is null or not public.can_manage_finance() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into v_invoice from public.client_invoices i where i.id = p_invoice_id and i.organization_id = v_org for update;
  if not found then raise exception 'invoice_not_found' using errcode = 'P0002'; end if;
  if p_status = 'issued' and v_invoice.status = 'open' then
    update public.client_invoices set status = 'issued', issued_at = now() where id = p_invoice_id;
  elsif p_status = 'paid' and v_invoice.status in ('open', 'issued') then
    update public.client_invoices set status = 'paid', paid_at = now(), issued_at = coalesce(issued_at, now()), payment_reference = nullif(btrim(p_reference), '') where id = p_invoice_id;
  elsif p_status = 'cancelled' and v_invoice.status in ('open', 'issued') then
    if nullif(btrim(p_reason), '') is null then raise exception 'reason_required' using errcode = '22023'; end if;
    update public.client_invoices set status = 'cancelled', cancelled_reason = btrim(p_reason) where id = p_invoice_id;
    update public.client_invoice_items set active = false where invoice_id = p_invoice_id;
  else
    raise exception 'invalid_invoice_transition: % -> %', v_invoice.status, p_status using errcode = '22023';
  end if;
  insert into public.audit_log (actor_user_id, action, entity_table, entity_id, reason, metadata)
  values (v_uid, 'invoice_' || p_status, 'client_invoices', p_invoice_id, nullif(btrim(p_reason), ''),
    jsonb_build_object('from', v_invoice.status, 'reference', nullif(btrim(p_reference), ''), 'organization_id', v_org));
  return p_status;
end $$;

-- ---------- Pagamento de motoristas ----------
create or replace function public.set_driver_pay(p_driver_id uuid, p_mode text, p_amount numeric, p_reason text)
returns text language plpgsql security definer set search_path to '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_org uuid := public.current_organization_id();
  v_old public.driver_pay_settings%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if v_org is null or not public.can_manage_finance() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_mode not in ('daily', 'per_trip') or p_amount is null or p_amount <= 0 or p_amount > 1000000 then raise exception 'invalid_pay_rule' using errcode = '22023'; end if;
  if nullif(btrim(p_reason), '') is null then raise exception 'reason_required' using errcode = '22023'; end if;
  if not exists (select 1 from public.drivers d where d.id = p_driver_id and d.organization_id = v_org) then raise exception 'driver_unavailable' using errcode = '22023'; end if;
  select * into v_old from public.driver_pay_settings where driver_id = p_driver_id;
  insert into public.driver_pay_settings (driver_id, organization_id, pay_mode, amount, updated_by, updated_at)
  values (p_driver_id, v_org, p_mode, p_amount, v_uid, now())
  on conflict (driver_id) do update set pay_mode = excluded.pay_mode, amount = excluded.amount, updated_by = excluded.updated_by, updated_at = now();
  insert into public.audit_log (actor_user_id, action, entity_table, entity_id, reason, metadata)
  values (v_uid, 'set_driver_pay', 'drivers', p_driver_id, btrim(p_reason), jsonb_build_object('from_mode', v_old.pay_mode, 'from_amount', v_old.amount, 'to_mode', p_mode, 'to_amount', p_amount, 'organization_id', v_org));
  return p_mode;
end $$;

create or replace function public.add_driver_pay_adjustment(p_driver_id uuid, p_reference_date date, p_amount numeric, p_reason text)
returns uuid language plpgsql security definer set search_path to '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_org uuid := public.current_organization_id();
  v_id uuid;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if v_org is null or not public.can_manage_finance() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_amount is null or p_amount = 0 or abs(p_amount) > 1000000 or p_reference_date is null then raise exception 'invalid_amount' using errcode = '22023'; end if;
  if length(coalesce(btrim(p_reason), '')) < 3 then raise exception 'reason_required' using errcode = '22023'; end if;
  if not exists (select 1 from public.drivers d where d.id = p_driver_id and d.organization_id = v_org) then raise exception 'driver_unavailable' using errcode = '22023'; end if;
  insert into public.driver_pay_adjustments (organization_id, driver_id, reference_date, amount, reason, created_by)
  values (v_org, p_driver_id, p_reference_date, p_amount, btrim(p_reason), v_uid) returning id into v_id;
  insert into public.audit_log (actor_user_id, action, entity_table, entity_id, reason, metadata)
  values (v_uid, 'add_driver_pay_adjustment', 'driver_pay_adjustments', v_id, btrim(p_reason), jsonb_build_object('driver_id', p_driver_id, 'amount', p_amount, 'organization_id', v_org));
  return v_id;
end $$;

create or replace function public.remove_driver_pay_adjustment(p_adjustment_id uuid, p_reason text)
returns boolean language plpgsql security definer set search_path to '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_org uuid := public.current_organization_id();
  v_adj public.driver_pay_adjustments%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if v_org is null or not public.can_manage_finance() then raise exception 'forbidden' using errcode = '42501'; end if;
  if nullif(btrim(p_reason), '') is null then raise exception 'reason_required' using errcode = '22023'; end if;
  select * into v_adj from public.driver_pay_adjustments a where a.id = p_adjustment_id and a.organization_id = v_org for update;
  if not found then raise exception 'adjustment_not_found' using errcode = 'P0002'; end if;
  if v_adj.payout_id is not null then raise exception 'adjustment_already_in_payout' using errcode = '22023'; end if;
  delete from public.driver_pay_adjustments where id = p_adjustment_id;
  insert into public.audit_log (actor_user_id, action, entity_table, entity_id, reason, metadata)
  values (v_uid, 'remove_driver_pay_adjustment', 'driver_pay_adjustments', p_adjustment_id, btrim(p_reason), to_jsonb(v_adj));
  return true;
end $$;

-- Viagens concluídas no período ainda não incluídas em fechamento ativo.
create or replace function public.unsettled_driver_trips(p_driver_id uuid, p_start date, p_end date)
returns table (trip_id uuid, trip_number bigint, work_date date, completed_at timestamptz)
language sql stable security definer set search_path to '' as $$
  select t.id, t.trip_number::bigint, (t.completed_at at time zone 'America/Sao_Paulo')::date, t.completed_at
  from public.trips t
  where t.driver_id = p_driver_id and t.status = 'completed' and t.completed_at is not null
    and t.organization_id = public.current_organization_id()
    and (t.completed_at at time zone 'America/Sao_Paulo')::date between p_start and p_end
    and not exists (select 1 from public.driver_payout_trips pt where pt.trip_id = t.id and pt.active)
  order by t.completed_at;
$$;
revoke all on function public.unsettled_driver_trips(uuid, date, date) from public, anon, authenticated;

create or replace function public.driver_pay_overview(p_start date, p_end date)
returns table (driver_id uuid, driver_name text, pay_mode text, rate numeric, trips_count integer, days_worked integer,
  base_amount numeric, adjustments_amount numeric, total_amount numeric, open_payout_id uuid)
language plpgsql stable security definer set search_path to '' as $$
declare v_org uuid := public.current_organization_id();
begin
  if v_org is null or not public.can_manage_finance() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_start is null or p_end is null or p_end < p_start then raise exception 'invalid_period' using errcode = '22023'; end if;
  return query
  with base as (
    select d.id, p.full_name, s.pay_mode, s.amount,
      (select count(*) from public.unsettled_driver_trips(d.id, p_start, p_end))::integer as trips,
      (select count(distinct u.work_date) from public.unsettled_driver_trips(d.id, p_start, p_end) u)::integer as days,
      coalesce((select sum(a.amount) from public.driver_pay_adjustments a where a.driver_id = d.id and a.payout_id is null and a.reference_date between p_start and p_end), 0) as adj,
      (select po.id from public.driver_payouts po where po.driver_id = d.id and po.status = 'open' order by po.created_at desc limit 1) as open_payout
    from public.drivers d
    join public.profiles p on p.id = d.profile_id
    left join public.driver_pay_settings s on s.driver_id = d.id
    where d.organization_id = v_org and d.status in ('active', 'suspended', 'inactive')
  )
  select b.id, b.full_name, b.pay_mode, b.amount, b.trips, b.days,
    coalesce(case when b.pay_mode = 'daily' then b.amount * b.days when b.pay_mode = 'per_trip' then b.amount * b.trips end, 0),
    b.adj,
    coalesce(case when b.pay_mode = 'daily' then b.amount * b.days when b.pay_mode = 'per_trip' then b.amount * b.trips end, 0) + b.adj,
    b.open_payout
  from base b
  order by b.full_name;
end $$;

create or replace function public.create_driver_payout(p_driver_id uuid, p_start date, p_end date)
returns uuid language plpgsql security definer set search_path to '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_org uuid := public.current_organization_id();
  v_rule public.driver_pay_settings%rowtype;
  v_payout uuid;
  v_trips integer;
  v_days integer;
  v_base numeric;
  v_adj numeric;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if v_org is null or not public.can_manage_finance() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_start is null or p_end is null or p_end < p_start then raise exception 'invalid_period' using errcode = '22023'; end if;
  if not exists (select 1 from public.drivers d where d.id = p_driver_id and d.organization_id = v_org) then raise exception 'driver_unavailable' using errcode = '22023'; end if;
  select * into v_rule from public.driver_pay_settings where driver_id = p_driver_id;
  if not found then raise exception 'driver_pay_rule_missing' using errcode = '22023'; end if;

  create temporary table tmp_payout_trips on commit drop as select * from public.unsettled_driver_trips(p_driver_id, p_start, p_end);
  select count(*), count(distinct work_date) into v_trips, v_days from tmp_payout_trips;
  select coalesce(sum(amount), 0) into v_adj from public.driver_pay_adjustments
  where driver_id = p_driver_id and payout_id is null and reference_date between p_start and p_end;
  if v_trips = 0 and v_adj = 0 then raise exception 'nothing_to_pay' using errcode = '22023'; end if;
  v_base := case when v_rule.pay_mode = 'daily' then v_rule.amount * v_days else v_rule.amount * v_trips end;

  insert into public.driver_payouts (organization_id, driver_id, period_start, period_end, pay_mode, rate, trips_count, days_worked,
    base_amount, adjustments_amount, total_amount, created_by)
  values (v_org, p_driver_id, p_start, p_end, v_rule.pay_mode, v_rule.amount, v_trips, v_days, v_base, v_adj, v_base + v_adj, v_uid)
  returning id into v_payout;
  insert into public.driver_payout_trips (payout_id, trip_id, work_date) select v_payout, trip_id, work_date from tmp_payout_trips;
  update public.driver_pay_adjustments set payout_id = v_payout
  where driver_id = p_driver_id and payout_id is null and reference_date between p_start and p_end;
  insert into public.audit_log (actor_user_id, action, entity_table, entity_id, metadata)
  values (v_uid, 'create_driver_payout', 'driver_payouts', v_payout, jsonb_build_object('driver_id', p_driver_id, 'total', v_base + v_adj, 'organization_id', v_org));
  return v_payout;
end $$;

create or replace function public.set_driver_payout_status(p_payout_id uuid, p_status text, p_reference text, p_reason text)
returns text language plpgsql security definer set search_path to '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_org uuid := public.current_organization_id();
  v_payout public.driver_payouts%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if v_org is null or not public.can_manage_finance() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into v_payout from public.driver_payouts p where p.id = p_payout_id and p.organization_id = v_org for update;
  if not found then raise exception 'payout_not_found' using errcode = 'P0002'; end if;
  if p_status = 'paid' and v_payout.status = 'open' then
    update public.driver_payouts set status = 'paid', paid_at = now(), paid_by = v_uid, payment_reference = nullif(btrim(p_reference), '') where id = p_payout_id;
  elsif p_status = 'cancelled' and v_payout.status = 'open' then
    if nullif(btrim(p_reason), '') is null then raise exception 'reason_required' using errcode = '22023'; end if;
    update public.driver_payouts set status = 'cancelled', cancelled_reason = btrim(p_reason) where id = p_payout_id;
    update public.driver_payout_trips set active = false where payout_id = p_payout_id;
    update public.driver_pay_adjustments set payout_id = null where payout_id = p_payout_id;
  else
    raise exception 'invalid_payout_transition: % -> %', v_payout.status, p_status using errcode = '22023';
  end if;
  insert into public.audit_log (actor_user_id, action, entity_table, entity_id, reason, metadata)
  values (v_uid, 'payout_' || p_status, 'driver_payouts', p_payout_id, nullif(btrim(p_reason), ''),
    jsonb_build_object('reference', nullif(btrim(p_reference), ''), 'total', v_payout.total_amount, 'organization_id', v_org));
  return p_status;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'set_order_freight(uuid, numeric, text)', 'order_financials(uuid[])', 'billing_overview(date, date)',
    'create_client_invoice(uuid, date, date, date, text)', 'set_client_invoice_status(uuid, text, text, text)',
    'set_driver_pay(uuid, text, numeric, text)', 'add_driver_pay_adjustment(uuid, date, numeric, text)',
    'remove_driver_pay_adjustment(uuid, text)', 'driver_pay_overview(date, date)', 'create_driver_payout(uuid, date, date)',
    'set_driver_payout_status(uuid, text, text, text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- Auditoria do financeiro visível para administradores, gestores e financeiro da empresa.
create policy audit_log_read_finance_events on public.audit_log for select to authenticated using (
  entity_table in ('client_invoices', 'driver_payouts', 'driver_pay_adjustments')
  and public.can_manage_finance()
  and (
    exists (select 1 from public.client_invoices i where i.id = audit_log.entity_id and i.organization_id = public.current_organization_id())
    or exists (select 1 from public.driver_payouts p where p.id = audit_log.entity_id and p.organization_id = public.current_organization_id())
    or exists (select 1 from public.driver_pay_adjustments a where a.id = audit_log.entity_id and a.organization_id = public.current_organization_id())
  )
);
