-- Close support threads through an auditable, organization-scoped operation.
alter table public.support_threads
  add column closed_at timestamptz,
  add column closed_by_user_id uuid references public.profiles(id) on delete restrict,
  add column close_reason text,
  add constraint support_threads_closed_fields_check check (
    (status = 'open' and closed_at is null and closed_by_user_id is null and close_reason is null)
    or (status = 'closed' and closed_at is not null and closed_by_user_id is not null and close_reason is not null)
  );

create or replace function public.close_support_thread(p_thread_id uuid, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_org_id uuid := public.current_organization_id();
  v_thread public.support_threads%rowtype;
  v_reason text := nullif(btrim(p_reason), '');
begin
  if v_actor is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if v_org_id is null or not public.has_org_role(
    v_org_id,
    array['admin'::public.app_role, 'manager'::public.app_role, 'dispatcher'::public.app_role, 'support'::public.app_role]
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_thread_id is null or v_reason is null or length(v_reason) < 3 or length(v_reason) > 500 then
    raise exception 'invalid_support_close_data' using errcode = '22023';
  end if;

  select st.* into v_thread
  from public.support_threads st
  where st.id = p_thread_id and st.organization_id = v_org_id
  for update;
  if not found then
    raise exception 'support_thread_not_found' using errcode = 'P0002';
  end if;
  if v_thread.status = 'closed' then
    return false;
  end if;

  update public.support_threads
  set status = 'closed', closed_at = now(), closed_by_user_id = v_actor,
      close_reason = v_reason, updated_at = now()
  where id = p_thread_id;

  insert into public.audit_log (actor_user_id, action, entity_table, entity_id, reason, metadata)
  values (
    v_actor, 'support_thread_closed', 'support_threads', p_thread_id, v_reason,
    jsonb_build_object('organization_id', v_org_id, 'driver_id', v_thread.driver_id, 'trip_id', v_thread.trip_id)
  );
  return true;
end;
$$;

revoke all on function public.close_support_thread(uuid, text) from public, anon;
grant execute on function public.close_support_thread(uuid, text) to authenticated;

create policy audit_log_read_support_thread_events on public.audit_log
for select to authenticated using (
  entity_table = 'support_threads'
  and public.has_org_role(
    public.current_organization_id(),
    array['admin'::public.app_role, 'manager'::public.app_role, 'dispatcher'::public.app_role, 'support'::public.app_role]
  )
  and exists (
    select 1 from public.support_threads st
    where st.id = audit_log.entity_id and st.organization_id = public.current_organization_id()
  )
);

comment on function public.close_support_thread(uuid, text) is
  'Closes an organization-scoped support thread once, with a required reason and audit record.';

notify pgrst, 'reload schema';
