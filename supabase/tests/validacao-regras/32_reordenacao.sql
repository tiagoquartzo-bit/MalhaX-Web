-- ===== 9. Alterações do gestor numa viagem despachada =====
select t.check('9 Ajustes','Gestor cria pedido 3','gestor',
 format($q$ select public.create_order_with_stops(gen_random_uuid(), %L,
   '[{"weight_kg":3}]', '[{"stop_type":"pickup","address_label":"CD","address_line":"Rua A","latitude":-23.5,"longitude":-46.6,"package_indexes":[1]},{"stop_type":"delivery","address_label":"Loja D","address_line":"Rua D","latitude":-23.53,"longitude":-46.63,"package_indexes":[1]}]')::text $q$, t.id('cliente')), '________-%', 'pedido3');
select t.check('9 Ajustes','Despacho coleta→entrega para motorista1','gestor',
 format($q$ select public.dispatch_trip_from_order_stops(gen_random_uuid(), %L, null, null, array[(select id from public.order_stops where order_id=%2$L and stop_type='pickup'),(select id from public.order_stops where order_id=%2$L and stop_type='delivery')])::text $q$,
   t.id('drv_motorista1'), t.id('pedido3')), '________-%', 'viagem3');
select t.check('9 Ajustes','Reordenar para entrega antes da coleta é bloqueado','gestor',
 format($q$ select public.reorder_unstarted_trip_stops(%1$L, (select array_agg(id order by sequence_number desc) from public.trip_stops where trip_id=%1$L), 'teste de inversão')::text $q$, t.id('viagem3')), 'ERRO%pickup_must_precede_delivery%');
select t.check('9 Ajustes','Cancelar pedido já despachado é recusado','gestor',
 format($q$ select public.cancel_order(%L, 'cliente desistiu')::text $q$, t.id('pedido3')), 'ERRO%order_already_in_execution%');
select t.check('9 Ajustes','Reatribuir sem motivo é recusado','gestor',
 format($q$ select public.manage_trip(%L, 'reassign', ' ', %L)::text $q$, t.id('viagem3'), t.id('drv_motorista_pendente')), 'ERRO%reason_required%');
select t.check('9 Ajustes','Reatribuir viagem para outro motorista','gestor',
 format($q$ select public.manage_trip(%L, 'reassign', 'Motorista 1 indisponível', %L)::text $q$, t.id('viagem3'), t.id('drv_motorista_pendente')), 'assigned');
select t.check('9 Ajustes','Motorista anterior perde o acesso à viagem','motorista1', format($q$ select count(*)::text from public.trips where id=%L $q$, t.id('viagem3')), '0');
select t.check('9 Ajustes','Novo motorista enxerga a viagem','motorista_pendente', format($q$ select count(*)::text from public.trips where id=%L $q$, t.id('viagem3')), '1');
select t.check('9 Ajustes','Reatribuição fica na auditoria com o motorista anterior','gestor',
 format($q$ select (metadata->>'previous_driver_id' = %L)::text from public.audit_log where action='trip_reassign' and entity_id=%L $q$, t.id('drv_motorista1'), t.id('viagem3')), 'true');
select t.check('9 Ajustes','Novo motorista aceita e inicia','motorista_pendente', format($q$ select public.accept_trip(%1$L)::text||'/'||public.start_trip(%1$L)::text $q$, t.id('viagem3')), 'accepted/in_progress');
select t.check('9 Ajustes','Gestor pausa a viagem com motivo','gestor', format($q$ select public.manage_trip(%L, 'pause', 'Chuva forte')::text $q$, t.id('viagem3')), 'paused');
select t.check('9 Ajustes','Motorista não executa parada com viagem pausada','motorista_pendente',
 format($q$ select public.record_stop_event(%L, gen_random_uuid(), 'arrived', null, now(), null, null, null)::text $q$, t.stop('viagem3',1)), 'ERRO%trip_not_active%');
select t.check('9 Ajustes','Gestor retoma a viagem','gestor', format($q$ select public.manage_trip(%L, 'resume', null)::text $q$, t.id('viagem3')), 'in_progress');
select t.check('9 Ajustes','Despachante cancela a viagem (nenhuma parada iniciada)','despachante', format($q$ select public.manage_trip(%L, 'cancel', 'Cliente remarcou')::text $q$, t.id('viagem3')), 'cancelled');
select t.check('9 Ajustes','Paradas da viagem cancelada voltam para a fila de despacho','gestor',
 format($q$ select string_agg(distinct status::text, ',')||'/'||(select status::text from public.orders where id=%1$L) from public.order_stops where order_id=%1$L $q$, t.id('pedido3')), 'pending_dispatch/pending_dispatch');
select t.check('9 Ajustes','Suporte não pode cancelar viagem','suporte', format($q$ select public.manage_trip(%L, 'cancel', 'x')::text $q$, t.id('viagem')), 'ERRO%forbidden%');
select t.check('9 Ajustes','Viagem já iniciada não pode ser cancelada','gestor', format($q$ select public.manage_trip(%L, 'cancel', 'teste')::text $q$, t.id('viagem_ordem')), 'ERRO%trip_already_started%');
select t.check('9 Ajustes','Cancelar pedido na fila (não executado) com motivo','gestor', format($q$ select public.cancel_order(%L, 'Cliente desistiu')::text $q$, t.id('pedido3')), 'cancelled');
select t.check('9 Ajustes','Tarefas do pedido cancelado saem da fila','gestor', format($q$ select string_agg(distinct status::text, ',') from public.order_stops where order_id=%L $q$, t.id('pedido3')), 'cancelled');
select t.check('9 Ajustes','Cancelamento do pedido fica na auditoria','gestor', format($q$ select reason from public.audit_log where action='cancel_order' and entity_id=%L $q$, t.id('pedido3')), 'Cliente desistiu');
