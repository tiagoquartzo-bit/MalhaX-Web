create table public.support_threads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  driver_id uuid not null references public.drivers(id) on delete restrict,
  trip_id uuid references public.trips(id) on delete restrict,
  subject text not null check (length(subject) between 3 and 120),
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.support_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.support_threads(id) on delete restrict,
  sender_user_id uuid not null references public.profiles(id) on delete restrict,
  body text not null check (length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index support_threads_org_updated_idx on public.support_threads (organization_id, status, updated_at desc);
create index support_messages_thread_created_idx on public.support_messages (thread_id, created_at);
alter table public.support_threads enable row level security;
alter table public.support_messages enable row level security;
revoke all on public.support_threads, public.support_messages from anon, authenticated;
grant select on public.support_threads, public.support_messages to authenticated;
grant insert on public.support_messages to authenticated;

create policy support_threads_read_driver_or_ops on public.support_threads for select to authenticated using (
  (driver_id = public.current_driver_id() and organization_id = public.current_organization_id())
  or public.has_org_role(organization_id, array['admin'::public.app_role, 'manager'::public.app_role, 'dispatcher'::public.app_role, 'support'::public.app_role])
);
create policy support_messages_read_thread_participant on public.support_messages for select to authenticated using (
  exists (select 1 from public.support_threads st where st.id = thread_id and (
    (st.driver_id = public.current_driver_id() and st.organization_id = public.current_organization_id())
    or public.has_org_role(st.organization_id, array['admin'::public.app_role, 'manager'::public.app_role, 'dispatcher'::public.app_role, 'support'::public.app_role])
  ))
);
create policy support_messages_insert_thread_participant on public.support_messages for insert to authenticated with check (
  sender_user_id = (select auth.uid()) and exists (
    select 1 from public.support_threads st where st.id = thread_id and st.status = 'open' and (
      (st.driver_id = public.current_driver_id() and st.organization_id = public.current_organization_id())
      or public.has_org_role(st.organization_id, array['admin'::public.app_role, 'manager'::public.app_role, 'dispatcher'::public.app_role, 'support'::public.app_role])
    )
  )
);

create or replace function public.open_driver_support_thread(p_trip_id uuid, p_subject text, p_body text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_driver_id uuid := public.current_driver_id();
  v_org_id uuid := public.current_organization_id();
  v_thread_id uuid;
  v_subject text := nullif(btrim(p_subject), '');
  v_body text := nullif(btrim(p_body), '');
begin
  if auth.uid() is null or v_driver_id is null or v_org_id is null then
    raise exception 'driver_access_required' using errcode = '42501';
  end if;
  if v_subject is null or length(v_subject) > 120 or v_body is null or length(v_body) > 2000 then
    raise exception 'invalid_support_message' using errcode = '22023';
  end if;
  if p_trip_id is not null and not exists (
    select 1 from public.trips t where t.id = p_trip_id and t.driver_id = v_driver_id and t.organization_id = v_org_id
  ) then raise exception 'trip_access_denied' using errcode = '42501'; end if;
  insert into public.support_threads (organization_id, driver_id, trip_id, subject)
  values (v_org_id, v_driver_id, p_trip_id, v_subject) returning id into v_thread_id;
  insert into public.support_messages (thread_id, sender_user_id, body) values (v_thread_id, auth.uid(), v_body);
  return v_thread_id;
end; $$;
revoke all on function public.open_driver_support_thread(uuid, text, text) from public, anon;
grant execute on function public.open_driver_support_thread(uuid, text, text) to authenticated;

create or replace function public.touch_support_thread()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.support_threads set updated_at = now() where id = new.thread_id;
  return new;
end; $$;
create trigger support_message_touch_thread after insert on public.support_messages
for each row execute function public.touch_support_thread();

comment on table public.support_threads is 'Atendimento privado por empresa entre motorista e equipe operacional.';
comment on table public.support_messages is 'Mensagens imutáveis de atendimento; leitura e envio limitados por RLS.';
