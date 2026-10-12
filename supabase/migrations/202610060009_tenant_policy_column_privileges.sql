-- RLS predicates use organization_id to scope operational rows.
-- Grant only this non-financial tenant key in addition to existing column grants.
grant select (organization_id) on public.orders, public.drivers to authenticated;
