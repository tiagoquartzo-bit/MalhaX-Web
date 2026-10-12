-- Cadastro de clientes por RPC autenticada, auditável e segura para retry.
alter table public.clients
  add column creation_request_id uuid,
  add column creation_request_fingerprint text,
  add constraint clients_creation_request_pair_check
    check ((creation_request_id is null) = (creation_request_fingerprint is null));

create unique index clients_org_creation_request_uidx
  on public.clients (organization_id, creation_request_id)
  where creation_request_id is not null;

drop policy if exists audit_log_read_admin_manager on public.audit_log;
create policy audit_log_read_admin_manager on public.audit_log for select to authenticated using (
  public.has_any_role(array['admin'::public.app_role, 'manager'::public.app_role]) and (
    (entity_table = 'orders' and exists (
      select 1 from public.orders o
      where o.id = audit_log.entity_id and o.organization_id = public.current_organization_id()
    ))
    or (entity_table = 'trips' and exists (
      select 1 from public.trips t
      where t.id = audit_log.entity_id and t.organization_id = public.current_organization_id()
    ))
    or (entity_table = 'drivers' and exists (
      select 1 from public.drivers d
      where d.id = audit_log.entity_id and d.organization_id = public.current_organization_id()
    ))
    or (entity_table = 'clients' and exists (
      select 1 from public.clients c
      where c.id = audit_log.entity_id and c.organization_id = public.current_organization_id()
    ))
  )
);

create or replace function public.create_client(
  p_request_id uuid,
  p_name text,
  p_contact_name text default null,
  p_phone text default null,
  p_email text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_org_id uuid := public.current_organization_id();
  v_name text := nullif(btrim(p_name), '');
  v_contact_name text := nullif(btrim(p_contact_name), '');
  v_phone text := nullif(btrim(p_phone), '');
  v_email text := nullif(lower(btrim(p_email)), '');
  v_fingerprint text;
  v_client_id uuid;
  v_existing_fingerprint text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if v_org_id is null then
    raise exception 'organization_required' using errcode = '42501';
  end if;
  if not public.has_any_role(array['admin', 'manager', 'dispatcher', 'support']::public.app_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_request_id is null then
    raise exception 'request_id_required' using errcode = '22023';
  end if;
  if v_name is null or length(v_name) > 120
     or length(coalesce(v_contact_name, '')) > 120
     or length(coalesce(v_phone, '')) > 32
     or length(coalesce(v_email, '')) > 254
     or (v_email is not null and v_email !~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$') then
    raise exception 'invalid_client_data' using errcode = '22023';
  end if;

  v_fingerprint := encode(extensions.digest(
    jsonb_build_object(
      'name', v_name,
      'contact_name', v_contact_name,
      'phone', v_phone,
      'email', v_email
    )::text,
    'sha256'
  ), 'hex');

  select c.id, c.creation_request_fingerprint
    into v_client_id, v_existing_fingerprint
  from public.clients c
  where c.organization_id = v_org_id and c.creation_request_id = p_request_id;
  if found then
    if v_existing_fingerprint is distinct from v_fingerprint then
      raise exception 'request_id_conflict' using errcode = '23505';
    end if;
    return v_client_id;
  end if;

  insert into public.clients (
    name, contact_name, phone, email, creation_request_id, creation_request_fingerprint
  ) values (
    v_name, v_contact_name, v_phone, v_email, p_request_id, v_fingerprint
  ) returning id into v_client_id;

  insert into public.audit_log (actor_user_id, action, entity_table, entity_id, metadata)
  values (
    v_uid, 'create_client', 'clients', v_client_id,
    jsonb_build_object('organization_id', v_org_id)
  );

  return v_client_id;
end;
$$;

revoke all on function public.create_client(uuid, text, text, text, text) from public, anon;
grant execute on function public.create_client(uuid, text, text, text, text) to authenticated;

comment on function public.create_client(uuid, text, text, text, text) is
  'Creates an organization-scoped client with server-side validation, audit logging, and safe retry by request ID.';
