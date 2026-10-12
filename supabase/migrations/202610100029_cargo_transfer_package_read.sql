-- A driver can inspect only volumes physically handed to the trip assigned to them.
create policy packages_read_current_custody on public.packages for select to authenticated using (
  exists (
    select 1 from public.orders o
    where o.id = packages.order_id and o.organization_id = public.current_organization_id()
      and (
        exists (select 1 from public.trips t where t.id = packages.custodian_trip_id and t.driver_id = public.current_driver_id() and t.organization_id = public.current_organization_id())
        or exists (
          select 1 from public.cargo_transfers x
          join public.trips t on t.id = x.destination_trip_id
          where x.id = packages.active_cargo_transfer_id
            and x.status in ('authorized', 'awaiting_source')
            and t.driver_id = public.current_driver_id()
            and t.organization_id = public.current_organization_id()
        )
      )
  )
);
