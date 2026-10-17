-- Atalhos de leitura
create or replace function t.stop(p_trip text, p_seq int) returns text language sql as $$ select id::text from public.trip_stops where trip_id = t.id(p_trip)::uuid and sequence_number = p_seq $$;
create or replace function t.codes(p_stop text) returns text[] language sql security definer as $$ select array_agg(pk.package_code) from public.stop_packages sp join public.packages pk on pk.id = sp.package_id where sp.stop_id = p_stop::uuid $$;
grant usage on schema t to authenticated;

-- ===== 5. Fluxo completo (pedido 2, motorista1) =====
select t.check('5 Fluxo','Gestor cria pedido 2','gestor',
 format($q$ select public.create_order_with_stops(gen_random_uuid(), %L,
   '[{"description":"Caixa 1","weight_kg":2.5},{"description":"Caixa 2","weight_kg":4}]',
   '[{"stop_type":"pickup","address_label":"CD","address_line":"Rua A, 1","latitude":-23.5,"longitude":-46.6,"package_indexes":[1,2]},
     {"stop_type":"delivery","address_label":"Loja B","address_line":"Rua B, 2","latitude":-23.51,"longitude":-46.61,"package_indexes":[1]},
     {"stop_type":"delivery","address_label":"Loja C","address_line":"Rua C, 3","latitude":-23.52,"longitude":-46.62,"package_indexes":[2]}]')::text $q$, t.id('cliente')), '________-%', 'pedido2');
select t.check('5 Fluxo','Despachante monta viagem coleta→B→C com caminhão e previsão por parada','despachante',
 format($q$ select public.dispatch_trip_from_order_stops(gen_random_uuid(), %L, %L, now() + interval '1 hour',
   array[(select id from public.order_stops where order_id=%3$L and stop_type='pickup'),(select id from public.order_stops where order_id=%3$L and address_label='Loja B'),(select id from public.order_stops where order_id=%3$L and address_label='Loja C')],
   array[now() + interval '1 hour', now() + interval '90 minutes', now() + interval '2 hours']::timestamptz[])::text $q$,
   t.id('drv_motorista1'), t.id('veiculo'), t.id('pedido2')), '________-%', 'viagem');
select t.check('5 Fluxo','Após despacho: viagem atribuída, paradas atribuídas, pedido planejado','gestor',
 format($q$ select (select status::text from public.trips where id=%L)||'/'||(select string_agg(distinct status::text, ',') from public.order_stops where order_id=%L)||'/'||(select status::text from public.orders where id=%2$L) $q$, t.id('viagem'), t.id('pedido2')), 'assigned/assigned/planned');
select t.check('5 Fluxo','Previsão gravada em todas as paradas','gestor',
 format($q$ select count(planned_at)||'/'||count(*) from public.trip_stops where trip_id=%L $q$, t.id('viagem')), '3/3');
select t.check('5 Fluxo','Mesmas paradas não podem ser despachadas duas vezes','gestor',
 format($q$ select public.dispatch_trip_from_order_stops(gen_random_uuid(), %L, null, null, (select array_agg(id) from public.order_stops where order_id=%L))::text $q$, t.id('drv_motorista2'), t.id('pedido2')), 'ERRO%order_stop_not_dispatchable%');
select t.check('5 Fluxo','Motorista2 não aceita viagem do motorista1','motorista2', format($q$ select public.accept_trip(%L)::text $q$, t.id('viagem')), 'ERRO%trip_not_found%');
select t.check('5 Fluxo','Motorista2 não enxerga viagem do motorista1','motorista2', format($q$ select count(*)::text from public.trips where id=%L $q$, t.id('viagem')), '0');
select t.check('5 Fluxo','Motorista1 enxerga a viagem, as 3 paradas e os volumes','motorista1',
 format($q$ select (select count(*) from public.trips where id=%1$L)||'/'||(select count(*) from public.trip_stops where trip_id=%1$L)||'/'||(select count(*) from public.stop_packages sp join public.trip_stops s on s.id=sp.stop_id where s.trip_id=%1$L) $q$, t.id('viagem')), '1/3/4');
select t.check('5 Fluxo','Executar parada sem aceitar a viagem é recusado','motorista1',
 format($q$ select public.record_stop_event(%L, gen_random_uuid(), 'arrived', null, now(), null, null, null)::text $q$, t.stop('viagem',1)), 'ERRO%trip_not_accepted%');
select t.check('5 Fluxo','Iniciar viagem sem aceitar é recusado','motorista1', format($q$ select public.start_trip(%L)::text $q$, t.id('viagem')), 'ERRO%trip_not_accepted%');
select t.check('5 Fluxo','Motorista1 aceita a viagem','motorista1', format($q$ select public.accept_trip(%L)::text $q$, t.id('viagem')), 'accepted');
select t.check('5 Fluxo','Motorista1 inicia a viagem (sai para a 1ª coleta)','motorista1', format($q$ select public.start_trip(%L)::text $q$, t.id('viagem')), 'in_progress');
select t.check('5 Fluxo','GPS a caminho da 1ª parada é gravado','motorista1',
 format($q$ select public.record_driver_position(%L, gen_random_uuid(), now(), -23.49, -46.59, 8)::text $q$, t.id('viagem')), '________-%');
select t.check('5 Fluxo','Transição inválida (pendente→concluída) é recusada','motorista1',
 format($q$ select public.record_stop_event(%L, gen_random_uuid(), 'completed', null, now(), null, null, null)::text $q$, t.stop('viagem',1)), 'ERRO%invalid_transition%');
select t.check('5 Fluxo','Chegada na coleta','motorista1',
 format($q$ select public.record_stop_event(%L, '33333333-3333-3333-3333-333333333333', 'arrived', null, now(), -23.5, -46.6, 10)::text $q$, t.stop('viagem',1)), 'arrived');
select t.check('5 Fluxo','Reenvio do mesmo evento (offline) não duplica','motorista1',
 format($q$ select public.record_stop_event(%L, '33333333-3333-3333-3333-333333333333', 'arrived', null, now(), -23.5, -46.6, 10)::text $q$, t.stop('viagem',1)), 'arrived');
select t.check('5 Fluxo','… e só existe 1 evento gravado','gestor', $q$ select count(*)::text from public.stop_events where device_event_id='33333333-3333-3333-3333-333333333333' $q$, '1');
select t.check('5 Fluxo','Concluir coleta sem conferir os códigos é recusado','motorista1',
 format($q$ select public.record_stop_event(%L, gen_random_uuid(), 'completed', null, now(), null, null, null)::text $q$, t.stop('viagem',1)), 'ERRO%package_check_required%');
select t.check('5 Fluxo','Código que não pertence à parada é recusado','motorista1',
 format($q$ select public.confirm_stop_packages(%L, array['codigo-inexistente'])::text $q$, t.stop('viagem',1)), 'ERRO%package_not_expected_at_stop%');
select t.check('5 Fluxo','Conferir só 1 dos 2 volumes ainda bloqueia a conclusão','motorista1',
 format($q$ select public.confirm_stop_packages(%1$L, array[(t.codes(%1$L))[1]])::text $q$, t.stop('viagem',1)), '1');
select t.check('5 Fluxo','… conclusão recusada com volume faltando','motorista1',
 format($q$ select public.record_stop_event(%L, gen_random_uuid(), 'completed', null, now(), null, null, null)::text $q$, t.stop('viagem',1)), 'ERRO%package_check_required%');
select t.check('5 Fluxo','Conferir todos os volumes (maiúsculas/espaços aceitos)','motorista1',
 format($q$ select public.confirm_stop_packages(%1$L, (select array_agg(' '||upper(c)||' ') from unnest(t.codes(%1$L)) c))::text $q$, t.stop('viagem',1)), '2');
select t.check('5 Fluxo','Coleta concluída','motorista1',
 format($q$ select public.record_stop_event(%L, gen_random_uuid(), 'completed', null, now(), null, null, null)::text $q$, t.stop('viagem',1)), 'completed');
select t.check('5 Fluxo','Volumes ficam "coletados"','gestor', format($q$ select string_agg(distinct status::text, ',') from public.packages where order_id=%L $q$, t.id('pedido2')), 'picked_up');
select t.check('5 Fluxo','Pedido fica "em andamento"','gestor', format($q$ select status::text from public.orders where id=%L $q$, t.id('pedido2')), 'in_progress');
select t.check('5 Fluxo','Chegada na entrega B','motorista1',
 format($q$ select public.record_stop_event(%L, gen_random_uuid(), 'arrived', null, now(), null, null, null)::text $q$, t.stop('viagem',2)), 'arrived');
select t.check('5 Fluxo','Conferência do volume da entrega B','motorista1', format($q$ select public.confirm_stop_packages(%1$L, t.codes(%1$L))::text $q$, t.stop('viagem',2)), '1');
select t.check('5 Fluxo','Entrega sem comprovante é bloqueada','motorista1',
 format($q$ select public.record_stop_event(%L, gen_random_uuid(), 'completed', null, now(), null, null, null)::text $q$, t.stop('viagem',2)), 'ERRO%delivery_proof_required%');
select t.check('5 Fluxo','Comprovante sem a foto enviada é recusado','motorista1',
 format($q$ select public.register_delivery_proof(%2$L, %1$L||'/'||%2$L||'/a.jpg', %1$L||'/'||%2$L||'/a-local.jpg', 'Maria', now(), null, null, null, null, null)::text $q$, t.id('viagem'), t.stop('viagem',2)), 'ERRO%proof_file_not_uploaded%');
insert into storage.objects (bucket_id, name) select 'delivery-proofs', t.id('viagem')||'/'||ts.id||'/'||x from public.trip_stops ts, (values ('a.jpg'),('a-local.jpg')) v(x) where ts.trip_id = t.id('viagem')::uuid;
select t.check('5 Fluxo','Comprovante só com a foto da mercadoria (sem fachada) é recusado','motorista1',
 format($q$ select public.register_delivery_proof(%2$L, %1$L||'/'||%2$L||'/a.jpg', null, 'Maria', now(), null, null, null, null, null)::text $q$, t.id('viagem'), t.stop('viagem',2)), 'ERRO%location_photo%');
select t.check('5 Fluxo','Comprovante sem nome do recebedor é recusado','motorista1',
 format($q$ select public.register_delivery_proof(%2$L, %1$L||'/'||%2$L||'/a.jpg', %1$L||'/'||%2$L||'/a-local.jpg', ' ', now(), null, null, null, null, null)::text $q$, t.id('viagem'), t.stop('viagem',2)), 'ERRO%recipient_name_required%');
select t.check('5 Fluxo','GPS incompleto (lat sem precisão) é recusado','motorista1',
 format($q$ select public.register_delivery_proof(%2$L, %1$L||'/'||%2$L||'/a.jpg', %1$L||'/'||%2$L||'/a-local.jpg', 'Maria', now(), now(), -23.5, -46.6, null, null)::text $q$, t.id('viagem'), t.stop('viagem',2)), 'ERRO%proof_gps_fields_incomplete%');
select t.check('5 Fluxo','Comprovante com 2 fotos + recebedor, sem GPS, é aceito (GPS opcional)','motorista1',
 format($q$ select public.register_delivery_proof(%2$L, %1$L||'/'||%2$L||'/a.jpg', %1$L||'/'||%2$L||'/a-local.jpg', 'Maria', now(), null, null, null, null, null)::text $q$, t.id('viagem'), t.stop('viagem',2)), '________-%');
select t.check('5 Fluxo','Entrega B concluída','motorista1',
 format($q$ select public.record_stop_event(%L, gen_random_uuid(), 'completed', null, now(), null, null, null)::text $q$, t.stop('viagem',2)), 'completed');
select t.check('5 Fluxo','Volume 1 fica "entregue"','gestor', format($q$ select string_agg(pk.status::text, ',') from public.packages pk join public.stop_packages sp on sp.package_id=pk.id where sp.stop_id=%L $q$, t.stop('viagem',2)), 'delivered');
select t.check('5 Fluxo','Falha na entrega C sem motivo é recusada','motorista1',
 format($q$ select public.record_stop_event(%L, gen_random_uuid(), 'failed', ' ', now(), null, null, null)::text $q$, t.stop('viagem',3)), 'ERRO%reason_required%');
select t.check('5 Fluxo','Falha na entrega C com motivo é aceita (sem exigir conferência)','motorista1',
 format($q$ select public.record_stop_event(%L, gen_random_uuid(), 'failed', 'Cliente ausente', now(), null, null, null)::text $q$, t.stop('viagem',3)), 'failed');
select t.check('5 Fluxo','Viagem concluída, pedido em exceção, tarefa C de volta à fila, volume 2 em exceção','gestor',
 format($q$ select (select status::text from public.trips where id=%L)||'/'||(select status::text from public.orders where id=%L)||'/'||(select status::text from public.order_stops where order_id=%2$L and address_label='Loja C')||'/'||(select pk.status::text from public.packages pk join public.order_stop_packages osp on osp.package_id=pk.id join public.order_stops os on os.id=osp.order_stop_id where os.order_id=%2$L and os.address_label='Loja C') $q$, t.id('viagem'), t.id('pedido2')), 'completed/exception/exception/exception');
select t.check('5 Fluxo','GPS depois do fim da viagem é recusado','motorista1',
 format($q$ select public.record_driver_position(%L, gen_random_uuid(), now() + interval '1 minute', -23.5, -46.6, 8)::text $q$, t.id('viagem')), 'ERRO%tracking_timestamp_outside_trip%');
select t.check('5 Fluxo','Reentrega: tarefa C em nova viagem (coleta já feita na viagem anterior)','gestor',
 format($q$ select public.dispatch_trip_from_order_stops(gen_random_uuid(), %L, null, null, array[(select id from public.order_stops where order_id=%L and address_label='Loja C')])::text $q$, t.id('drv_motorista1'), t.id('pedido2')), '________-%', 'viagem2');
select t.check('5 Fluxo','Tentativa registrada como 2','gestor', format($q$ select attempt_number::text from public.trip_stops where trip_id=%L $q$, t.id('viagem2')), '2');
select t.check('5 Fluxo','Tentativa 2: aceitar, chegar e conferir','motorista1', format($q$
  select public.accept_trip(%1$L)::text||'/'||public.record_stop_event(%2$L, gen_random_uuid(), 'arrived', null, now(), null, null, null)::text||'/'||public.confirm_stop_packages(%2$L, t.codes(%2$L))::text $q$, t.id('viagem2'), t.stop('viagem2',1)), 'accepted/arrived/1');
insert into storage.objects (bucket_id, name) select 'delivery-proofs', t.id('viagem2')||'/'||ts.id||'/'||x from public.trip_stops ts, (values ('b.jpg'),('b-local.jpg')) v(x) where ts.trip_id = t.id('viagem2')::uuid;
select t.check('5 Fluxo','Tentativa 2: comprovante com GPS e conclusão','motorista1', format($q$
  select (public.register_delivery_proof(%2$L, %1$L||'/'||%2$L||'/b.jpg', %1$L||'/'||%2$L||'/b-local.jpg', 'João', now(), now(), -23.52, -46.62, 12, null) is not null)::text
   ||'/'||public.record_stop_event(%2$L, gen_random_uuid(), 'completed', null, now(), null, null, null)::text $q$, t.id('viagem2'), t.stop('viagem2',1)), 'true/completed');
select t.check('5 Fluxo','Pedido 2 concluído','gestor', format($q$ select status::text from public.orders where id=%L $q$, t.id('pedido2')), 'completed');

-- ===== 6. Execução fora de ordem (pedido 1: coleta e entrega B na mesma viagem) =====
select t.check('6 Ordem','Despacho correto coleta→B do pedido 1','gestor',
 format($q$ select public.dispatch_trip_from_order_stops(gen_random_uuid(), %L, null, null, array[(select id from public.order_stops where order_id=%2$L and stop_type='pickup'),(select id from public.order_stops where order_id=%2$L and address_label='Loja B')])::text $q$,
   t.id('drv_motorista2'), t.id('pedido')), '________-%', 'viagem_ordem');
select t.check('6 Ordem','Motorista2 aceita e vai direto à entrega (pula a coleta)','motorista2', format($q$
  select public.accept_trip(%1$L)::text||'/'||public.record_stop_event(%2$L, gen_random_uuid(), 'arrived', null, now(), null, null, null)::text||'/'||public.confirm_stop_packages(%2$L, t.codes(%2$L))::text $q$, t.id('viagem_ordem'), t.stop('viagem_ordem',2)), 'accepted/arrived/1');
insert into storage.objects (bucket_id, name) select 'delivery-proofs', t.id('viagem_ordem')||'/'||ts.id||'/'||x from public.trip_stops ts, (values ('f.jpg'),('f-local.jpg')) v(x) where ts.trip_id = t.id('viagem_ordem')::uuid;
select t.check('6 Ordem','Comprovante registrado na entrega','motorista2',
 format($q$ select public.register_delivery_proof(%2$L, %1$L||'/'||%2$L||'/f.jpg', %1$L||'/'||%2$L||'/f-local.jpg', 'Fulano', now(), null, null, null, null, null)::text $q$, t.id('viagem_ordem'), t.stop('viagem_ordem',2)), '________-%');
select t.check('6 Ordem','Concluir entrega antes da coleta do mesmo volume é bloqueado','motorista2',
 format($q$ select public.record_stop_event(%L, gen_random_uuid(), 'completed', null, now(), null, null, null)::text $q$, t.stop('viagem_ordem',2)), 'ERRO%pickup_required_before_delivery%');
select t.check('6 Ordem','Volume continua "esperado"','gestor',
 format($q$ select string_agg(pk.status::text, ',') from public.packages pk join public.stop_packages sp on sp.package_id=pk.id where sp.stop_id=%L $q$, t.stop('viagem_ordem',2)), 'expected');

-- ===== 7. Comprovantes e arquivos =====
select t.check('7 Arquivos','Motorista2 não envia foto na pasta de viagem do motorista1','motorista2',
 format($q$ insert into storage.objects (bucket_id, name) values ('delivery-proofs', %L||'/x/y.jpg') returning name $q$, t.id('viagem')), 'ERRO%');
select t.check('7 Arquivos','Motorista2 não lê comprovantes do motorista1','motorista2',
 format($q$ select count(*)::text from public.delivery_proofs p join public.trip_stops s on s.id=p.stop_id where s.trip_id=%L $q$, t.id('viagem')), '0');
select t.check('7 Arquivos','Suporte lê comprovantes da empresa','suporte',
 format($q$ select count(*)::text from public.delivery_proofs p join public.trip_stops s on s.id=p.stop_id where s.trip_id=%L $q$, t.id('viagem')), '1');
select t.check('7 Arquivos','Gestor de outra empresa não lê comprovantes','intruso', $q$ select count(*)::text from public.delivery_proofs $q$, '0');
select t.check('7 Arquivos','Bucket de comprovantes é privado','gestor', $q$ select public::text from storage.buckets where id='delivery-proofs' $q$, 'false');

-- ===== 8. Motoristas =====
select t.check('8 Motoristas','Suspender motorista com viagem ativa é bloqueado','suporte',
 format($q$ select public.set_driver_status(%L, 'suspended', 'teste')::text $q$, t.id('drv_motorista2')), 'ERRO%');
select t.check('8 Motoristas','Mudar status sem justificativa é recusado','suporte',
 format($q$ select public.set_driver_status(%L, 'active', ' ')::text $q$, t.id('drv_motorista_pendente')), 'ERRO%');
select t.check('8 Motoristas','Ativação exige e-mail confirmado','suporte',
 format($q$ select public.set_driver_status(%L, 'active', 'Documentos conferidos')::text $q$, t.id('drv_motorista_pendente')), 'ERRO%driver_email_not_confirmed%');
update auth.users set email_confirmed_at = now() where id = t.id('motorista_pendente')::uuid;
select t.check('8 Motoristas','Suporte aprova motorista pendente com justificativa (e-mail confirmado)','suporte',
 format($q$ select public.set_driver_status(%L, 'active', 'Documentos conferidos')::text $q$, t.id('drv_motorista_pendente')), '________-%');
select t.check('8 Motoristas','Alteração de status fica na auditoria','gestor',
 $q$ select coalesce(string_agg(action||': '||coalesce(metadata::text,''), ' | '), 'nada') from public.audit_log where entity_table='drivers' $q$, '%active%');
select t.check('8 Motoristas','Motorista não altera o próprio status','motorista1',
 format($q$ select public.set_driver_status(%L, 'inactive', 'x')::text $q$, t.id('drv_motorista1')), 'ERRO%');
select t.check('8 Motoristas','Motorista não pode ser apagado com histórico','gestor',
 format($q$ delete from public.drivers where id=%L returning id::text $q$, t.id('drv_motorista1')), 'ERRO%');
