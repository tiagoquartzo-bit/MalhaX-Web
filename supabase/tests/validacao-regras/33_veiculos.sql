-- ===== 10. Veículos e inclusão de parada em viagem =====
select t.check('10 Veículos','Editar veículo sem motivo é recusado','gestor',
 format($q$ select public.update_vehicle(%L, 'VW Delivery 9.170', 1600, null, true, ' ')::text $q$, t.id('veiculo')), 'ERRO%reason_required%');
select t.check('10 Veículos','Gestor atualiza capacidade do caminhão para 1.600 kg','gestor',
 format($q$ select public.update_vehicle(%L, 'VW Delivery 9.170', 1600, 'baú', true, 'Nova medição da carga útil')::text $q$, t.id('veiculo')), '________-%');
select t.check('10 Veículos','Capacidade gravada e alteração na auditoria','gestor',
 format($q$ select (select capacity_kg::text from public.vehicles where id=%1$L)||'/'||(select count(*) from public.audit_log where action='update_vehicle' and entity_id=%1$L) $q$, t.id('veiculo')), '1600.00/1');
select t.check('10 Veículos','Capacidade zero é recusada na edição','gestor',
 format($q$ select public.update_vehicle(%L, null, 0, null, true, 'teste')::text $q$, t.id('veiculo')), 'ERRO%invalid_vehicle_data%');
select t.check('10 Veículos','Motorista não edita veículo','motorista1',
 format($q$ select public.update_vehicle(%L, null, 10, null, true, 'teste')::text $q$, t.id('veiculo')), 'ERRO%forbidden%');
select t.check('10 Veículos','Gestor de outra empresa não edita veículo da Activia','intruso',
 format($q$ select public.update_vehicle(%L, null, 10, null, true, 'teste')::text $q$, t.id('veiculo')), 'ERRO%');
-- viagem com a moto (5 kg) e um pedido leve; depois tentar incluir parada pesada
select t.check('10 Veículos','Pedido leve (2 kg) e pedido pesado (10 kg)','gestor',
 format($q$ select (public.create_order_with_stops(gen_random_uuid(), %1$L, '[{"weight_kg":2}]', '[{"stop_type":"pickup","address_label":"CD","address_line":"Rua A","latitude":-23.5,"longitude":-46.6,"package_indexes":[1]},{"stop_type":"delivery","address_label":"Loja L","address_line":"Rua L","latitude":-23.54,"longitude":-46.64,"package_indexes":[1]}]') is not null)::text $q$, t.id('cliente')), 'true');
insert into t.ids select 'pedido_leve', id::text from public.orders order by created_at desc limit 1 on conflict (k) do update set v = excluded.v;
select t.check('10 Veículos','… pedido pesado','gestor',
 format($q$ select public.create_order_with_stops(gen_random_uuid(), %1$L, '[{"weight_kg":10}]', '[{"stop_type":"pickup","address_label":"CD","address_line":"Rua A","latitude":-23.5,"longitude":-46.6,"package_indexes":[1]},{"stop_type":"delivery","address_label":"Loja P","address_line":"Rua P","latitude":-23.55,"longitude":-46.65,"package_indexes":[1]}]')::text $q$, t.id('cliente')), '________-%', 'pedido_pesado');
select t.check('10 Veículos','Viagem da moto com o pedido leve','gestor',
 format($q$ select public.dispatch_trip_from_order_stops(gen_random_uuid(), %L, %L, now(), array[(select id from public.order_stops where order_id=%3$L and stop_type='pickup'),(select id from public.order_stops where order_id=%3$L and stop_type='delivery')], array[now() + interval '20 minutes', now() + interval '40 minutes']::timestamptz[])::text $q$,
   t.id('drv_motorista_outra') , t.id('moto'), t.id('pedido_leve')), 'ERRO%driver_unavailable%');
select t.check('10 Veículos','… com motorista da Activia','gestor',
 format($q$ select public.dispatch_trip_from_order_stops(gen_random_uuid(), %L, %L, now(), array[(select id from public.order_stops where order_id=%3$L and stop_type='pickup'),(select id from public.order_stops where order_id=%3$L and stop_type='delivery')], array[now() + interval '20 minutes', now() + interval '40 minutes']::timestamptz[])::text $q$,
   t.id('drv_motorista1'), t.id('moto'), t.id('pedido_leve')), '________-%', 'viagem_moto');
select t.check('10 Veículos','Incluir coleta de 10 kg na moto (limite 5 kg) é recusado','gestor',
 format($q$ select public.add_order_stop_to_trip(%L, (select id from public.order_stops where order_id=%L and stop_type='pickup'))::text $q$, t.id('viagem_moto'), t.id('pedido_pesado')), 'ERRO%vehicle_capacity_exceeded%');
select t.check('10 Veículos','Desativar veículo com viagem ativa é recusado','gestor',
 format($q$ select public.update_vehicle(%L, 'Honda CG', 5, null, false, 'Manutenção')::text $q$, t.id('moto')), 'ERRO%vehicle_has_active_trip%');
select t.check('10 Veículos','Aumentar a capacidade da moto para 20 kg','gestor',
 format($q$ select public.update_vehicle(%L, 'Honda CG + baú', 20, null, true, 'Baú instalado')::text $q$, t.id('moto')), '________-%');
select t.check('10 Veículos','Agora a coleta de 10 kg entra na viagem','gestor',
 format($q$ select (public.add_order_stop_to_trip(%L, (select id from public.order_stops where order_id=%L and stop_type='pickup')) is not null)::text $q$, t.id('viagem_moto'), t.id('pedido_pesado')), 'true');
select t.check('10 Veículos','Parada incluída recebe previsão automática (20 min após a última)','gestor',
 format($q$ select (planned_at - (select planned_at from public.trip_stops where trip_id=%1$L and sequence_number=2))::text from public.trip_stops where trip_id=%1$L and sequence_number=3 $q$, t.id('viagem_moto')), '00:20:00');
