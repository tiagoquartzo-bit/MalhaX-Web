insert into public.organizations (name, slug) values ('Outra Transportadora', 'outra');
do $$
declare u record; v_org uuid; v_other uuid;
begin
  select id into v_org from public.organizations where slug = 'activia';
  select id into v_other from public.organizations where slug = 'outra';
  insert into t.ids values ('org', v_org), ('org_outra', v_other);
  for u in select * from (values
      ('gestor','manager','activia'), ('despachante','dispatcher','activia'), ('suporte','support','activia'),
      ('financeiro','finance','activia'), ('motorista1','driver','activia'), ('motorista2','driver','activia'),
      ('motorista_pendente','driver','activia'), ('intruso','manager','outra'), ('motorista_outra','driver','outra'),
      ('sem_papel', null, 'activia')) as x(k, role, org) loop
    insert into auth.users (email, raw_user_meta_data) values (u.k || '@teste.local', jsonb_build_object('full_name', initcap(u.k)))
      returning id::text into strict v_org;  -- reuse var for id text
    insert into t.ids values (u.k, v_org);
    insert into public.organization_members (organization_id, user_id)
      values ((select id from public.organizations where slug = u.org), v_org::uuid);
    if u.role is not null then
      insert into public.organization_member_roles (organization_id, user_id, role)
        values ((select id from public.organizations where slug = u.org), v_org::uuid, u.role::public.app_role);
    end if;
    if u.role = 'driver' then
      perform set_config('app.trusted_org_id', (select id::text from public.organizations where slug = u.org), true);
      insert into public.drivers (profile_id, status, organization_id)
        values (v_org::uuid, case when u.k = 'motorista_pendente' then 'pending_review' else 'active' end::public.driver_status,
                (select id from public.organizations where slug = u.org))
        returning id::text into v_other;
      insert into t.ids values ('drv_' || u.k, v_other);
    end if;
  end loop;
end $$;
select k, left(v, 8) from t.ids order by k;
