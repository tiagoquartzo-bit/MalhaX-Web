create schema t;
create table t.results (n serial, area text, caso text, esperado text, obtido text, ok boolean);
create table t.ids (k text primary key, v text);
create or replace function t.id(k text) returns text language sql as $$ select v from t.ids where ids.k = $1 $$;
-- executa SQL como usuário autenticado (RLS + auth.uid()) e devolve texto do resultado ou 'ERRO: ...'
create or replace function t.as_user(p_user text, p_sql text) returns text language plpgsql as $$
declare r text;
begin
  perform set_config('request.jwt.claim.sub', coalesce(t.id(p_user), ''), true);
  execute 'set local role authenticated';
  begin
    execute p_sql into r;
  exception when others then
    r := 'ERRO: ' || sqlerrm;
  end;
  execute 'reset role';
  return coalesce(r, '(nulo)');
end $$;
-- registra caso: esperado é prefixo/padrão (like)
create or replace function t.check(p_area text, p_caso text, p_user text, p_sql text, p_expect text, p_save text default null) returns text language plpgsql as $$
declare r text;
begin
  r := t.as_user(p_user, p_sql);
  insert into t.results(area, caso, esperado, obtido, ok) values (p_area, p_caso, p_expect, left(r, 200), r like p_expect);
  if p_save is not null and r not like 'ERRO%' then insert into t.ids values (p_save, r) on conflict (k) do update set v = excluded.v; end if;
  return r;
end $$;
grant usage on schema t to authenticated; grant select on t.ids to authenticated;
