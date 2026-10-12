-- Leitura das tarefas de coleta/entrega limitada à organização ou viagem do motorista.
-- Gravações continuam exclusivamente pelas RPCs autorizadas.

revoke all on public.order_stops, public.order_stop_packages from anon, authenticated;
grant select on public.order_stops, public.order_stop_packages to authenticated;

create policy order_stops_read_ops_or_assigned on public.order_stops
  for select to authenticated using (
    exists (
      select 1
      from public.orders o
      where o.id = order_stops.order_id
        and o.organization_id = public.current_organization_id()
        and (
          public.has_org_role(o.organization_id, array['admin'::public.app_role, 'manager'::public.app_role, 'dispatcher'::public.app_role, 'support'::public.app_role])
          or exists (
            select 1
            from public.trip_stops ts
            where ts.source_order_stop_id = order_stops.id
              and public.can_access_trip(ts.trip_id)
          )
        )
    )
  );

create policy order_stop_packages_read_ops_or_assigned on public.order_stop_packages
  for select to authenticated using (
    exists (
      select 1
      from public.order_stops os
      join public.orders o on o.id = os.order_id
      where os.id = order_stop_packages.order_stop_id
        and os.order_id = order_stop_packages.order_id
        and o.organization_id = public.current_organization_id()
        and (
          public.has_org_role(o.organization_id, array['admin'::public.app_role, 'manager'::public.app_role, 'dispatcher'::public.app_role, 'support'::public.app_role])
          or exists (
            select 1
            from public.trip_stops ts
            where ts.source_order_stop_id = os.id
              and public.can_access_trip(ts.trip_id)
          )
        )
    )
  );

