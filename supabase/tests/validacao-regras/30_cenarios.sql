-- ===== 1. Cadastro de cliente e veículo =====
select t.check('1 Cadastros','Gestor cadastra cliente','gestor',
 $q$ select public.create_client('11111111-1111-1111-1111-111111111111','Cliente Teste','Ana','11999990000','ana@x.com')::text $q$, '________-%', 'cliente');
select t.check('1 Cadastros','Repetir cadastro com mesmo request_id devolve o mesmo cliente (idempotência)','gestor',
 $q$ select (public.create_client('11111111-1111-1111-1111-111111111111','Cliente Teste','Ana','11999990000','ana@x.com')::text = t.id('cliente'))::text $q$, 'true');
select t.check('1 Cadastros','Motorista não pode cadastrar cliente','motorista1',
 $q$ select public.create_client(gen_random_uuid(),'X',null,null,null)::text $q$, 'ERRO%forbidden%');
select t.check('1 Cadastros','Gestor cadastra veículo','gestor',
 $q$ select public.create_vehicle(gen_random_uuid(),'ABC1D23','truck','VW Delivery','1.500 kg', 1500)::text $q$, '________-%', 'veiculo');
select t.check('1 Cadastros','Gestor cadastra moto com capacidade de 5 kg','gestor',
 $q$ select public.create_vehicle(gen_random_uuid(),'MOT0A12','motorcycle','Honda CG',null, 5)::text $q$, '________-%', 'moto');
select t.check('1 Cadastros','Capacidade inválida (zero) é recusada','gestor',
 $q$ select public.create_vehicle(gen_random_uuid(),'ZZZ0Z00','car',null,null, 0)::text $q$, 'ERRO%invalid_vehicle_data%');
select t.check('1 Cadastros','Veículo tem capacidade numérica (kg) para validar peso','gestor',
 $q$ select capacity_kg::text from public.vehicles where id = t.id('veiculo')::uuid $q$, '1500.00');

-- ===== 2. Pedido =====
select t.check('2 Pedido','Gestor cria pedido com 2 volumes, 1 coleta e 2 entregas','gestor',
 format($q$ select public.create_order_with_stops('22222222-2222-2222-2222-222222222222', %L,
   '[{"description":"Caixa 1","weight_kg":2.5},{"description":"Caixa 2","weight_kg":4}]',
   '[{"stop_type":"pickup","address_label":"CD","address_line":"Rua A, 1","latitude":-23.5,"longitude":-46.6,"package_indexes":[1,2]},
     {"stop_type":"delivery","address_label":"Loja B","address_line":"Rua B, 2","latitude":-23.51,"longitude":-46.61,"package_indexes":[1]},
     {"stop_type":"delivery","address_label":"Loja C","address_line":"Rua C, 3","latitude":-23.52,"longitude":-46.62,"package_indexes":[2]}]')::text $q$, t.id('cliente')), '________-%', 'pedido');
select t.check('2 Pedido','Cada volume recebe código único e aleatório','gestor',
 $q$ select count(distinct package_code)||' códigos; exemplo '||min(package_code) from public.packages where order_id = t.id('pedido')::uuid $q$, '2 códigos%');
select t.check('2 Pedido','Pedido nasce "aguardando despacho" e paradas pendentes','gestor',
 $q$ select o.status||'/'||string_agg(distinct s.status::text, ',') from public.orders o join public.order_stops s on s.order_id=o.id where o.id=t.id('pedido')::uuid group by o.status $q$, 'pending_dispatch/pending_dispatch');
select t.check('2 Pedido','Reenvio idêntico não duplica pedido','gestor',
 format($q$ select (public.create_order_with_stops('22222222-2222-2222-2222-222222222222', %L,
   '[{"description":"Caixa 1","weight_kg":2.5},{"description":"Caixa 2","weight_kg":4}]',
   '[{"stop_type":"pickup","address_label":"CD","address_line":"Rua A, 1","latitude":-23.5,"longitude":-46.6,"package_indexes":[1,2]},
     {"stop_type":"delivery","address_label":"Loja B","address_line":"Rua B, 2","latitude":-23.51,"longitude":-46.61,"package_indexes":[1]},
     {"stop_type":"delivery","address_label":"Loja C","address_line":"Rua C, 3","latitude":-23.52,"longitude":-46.62,"package_indexes":[2]}]')::text = t.id('pedido'))::text $q$, t.id('cliente')), 'true');
select t.check('2 Pedido','Mesmo request_id com dados diferentes é recusado','gestor',
 format($q$ select public.create_order_with_stops('22222222-2222-2222-2222-222222222222', %L, '[{"description":"Outra"}]',
   '[{"stop_type":"delivery","address_label":"X","address_line":"Y","package_indexes":[1]}]')::text $q$, t.id('cliente')), 'ERRO%request_id_conflict%');
select t.check('2 Pedido','Suporte não cria pedido','suporte',
 format($q$ select public.create_order_with_stops(gen_random_uuid(), %L, '[{}]', '[{"stop_type":"delivery","address_label":"X","address_line":"Y","package_indexes":[1]}]')::text $q$, t.id('cliente')), 'ERRO%forbidden%');
select t.check('2 Pedido','Despachante não informa frete/repasse','despachante',
 format($q$ select public.create_order_with_stops(gen_random_uuid(), %L, '[{}]', '[{"stop_type":"delivery","address_label":"X","address_line":"Y","package_indexes":[1]}]', null, null, 100)::text $q$, t.id('cliente')), 'ERRO%forbidden_financial_values%');
select t.check('2 Pedido','Volume com quantidade 2 é recusado (1 código = 1 peça)','gestor',
 format($q$ select public.create_order_with_stops(gen_random_uuid(), %L, '[{"quantity":2,"weight_kg":1}]', '[{"stop_type":"delivery","address_label":"X","address_line":"Y","latitude":-23,"longitude":-46,"package_indexes":[1]}]')::text $q$, t.id('cliente')), 'ERRO%one_package_record_per_physical_unit%');
select t.check('2 Pedido','Parada sem volume é recusada','gestor',
 format($q$ select public.create_order_with_stops(gen_random_uuid(), %L, '[{"weight_kg":1}]', '[{"stop_type":"delivery","address_label":"X","address_line":"Y","latitude":-23,"longitude":-46,"package_indexes":[]}]')::text $q$, t.id('cliente')), 'ERRO%stop_packages_required%');
select t.check('2 Pedido','Volume sem coleta/entrega é recusado','gestor',
 format($q$ select public.create_order_with_stops(gen_random_uuid(), %L, '[{"weight_kg":1},{"weight_kg":1}]', '[{"stop_type":"delivery","address_label":"X","address_line":"Y","latitude":-23,"longitude":-46,"package_indexes":[1]}]')::text $q$, t.id('cliente')), 'ERRO%package_without_order_task%');
select t.check('2 Pedido','Pedido sem peso do volume é recusado','gestor',
 format($q$ select 'aceitou sem peso: '||public.create_order_with_stops(gen_random_uuid(), %L, '[{"description":"sem peso"}]', '[{"stop_type":"pickup","address_label":"X","address_line":"Y","latitude":-23,"longitude":-46,"package_indexes":[1]},{"stop_type":"delivery","address_label":"X","address_line":"Y","latitude":-23,"longitude":-46,"package_indexes":[1]}]')::text $q$, t.id('cliente')), 'ERRO%package_weight_required%');
select t.check('2 Pedido','Parada sem coordenadas é recusada','gestor',
 format($q$ select 'aceitou sem coordenadas: '||public.create_order_with_stops(gen_random_uuid(), %L, '[{"weight_kg":1}]', '[{"stop_type":"pickup","address_label":"X","address_line":"Y","package_indexes":[1]},{"stop_type":"delivery","address_label":"X","address_line":"Y","latitude":-23,"longitude":-46,"package_indexes":[1]}]')::text $q$, t.id('cliente')), 'ERRO%stop_coordinates_required%');
select t.check('2 Pedido','Volume sem coleta prevista (só entrega) é recusado','gestor',
 format($q$ select 'aceitou entrega sem coleta: '||public.create_order_with_stops(gen_random_uuid(), %L, '[{"weight_kg":1}]', '[{"stop_type":"delivery","address_label":"X","address_line":"Y","latitude":-23,"longitude":-46,"package_indexes":[1]}]')::text $q$, t.id('cliente')), 'ERRO%package_requires_one_pickup_and_one_delivery%');

-- ===== 3. Isolamento entre empresas =====
select t.check('3 Isolamento','Gestor de outra empresa não usa cliente da Activia','intruso',
 format($q$ select public.create_order_with_stops(gen_random_uuid(), %L, '[{}]', '[{"stop_type":"delivery","address_label":"X","address_line":"Y","package_indexes":[1]}]')::text $q$, t.id('cliente')), 'ERRO%client_unavailable%');
select t.check('3 Isolamento','Gestor de outra empresa não vê pedidos da Activia','intruso',
 $q$ select count(*)::text from public.orders $q$, '0');
select t.check('3 Isolamento','Gestor de outra empresa não vê volumes/paradas da Activia','intruso',
 $q$ select ((select count(*) from public.packages) + (select count(*) from public.order_stops))::text $q$, '0');
select t.check('3 Isolamento','Conta sem papel não vê pedidos','sem_papel',
 $q$ select count(*)::text from public.orders $q$, '0');
select t.check('3 Isolamento','Motorista não vê pedidos não atribuídos a ele','motorista1',
 $q$ select count(*)::text from public.orders $q$, '0');
select t.check('3 Isolamento','Suporte vê pedidos da própria empresa','suporte',
 $q$ select (count(*) > 0)::text from public.orders $q$, 'true');
select t.check('3 Isolamento','Suporte (sem papel financeiro) não lê frete','suporte',
 $q$ select freight_value::text from public.orders limit 1 $q$, 'ERRO%permission denied%');

-- ===== 4. Despacho =====
select t.check('4 Despacho','Despacho com motorista pendente de aprovação é recusado','gestor',
 format($q$ select public.dispatch_trip_from_order_stops(gen_random_uuid(), %L, null, null, (select array_agg(id) from public.order_stops where order_id=%L))::text $q$, t.id('drv_motorista_pendente'), t.id('pedido')), 'ERRO%driver_unavailable%');
select t.check('4 Despacho','Despacho com motorista de outra empresa é recusado','gestor',
 format($q$ select public.dispatch_trip_from_order_stops(gen_random_uuid(), %L, null, null, (select array_agg(id) from public.order_stops where order_id=%L))::text $q$, t.id('drv_motorista_outra'), t.id('pedido')), 'ERRO%driver_unavailable%');
select t.check('4 Despacho','Despacho com entrega antes da coleta é recusado','gestor',
 format($q$ select public.dispatch_trip_from_order_stops(gen_random_uuid(), %L, null, null,
   array[(select id from public.order_stops where order_id=%L and address_label='Loja B'), (select id from public.order_stops where order_id=%L and stop_type='pickup')])::text $q$,
   t.id('drv_motorista2'), t.id('pedido'), t.id('pedido')), 'ERRO%pickup_must_precede_delivery%');
select t.check('4 Despacho','Entrega sem a coleta na viagem (coleta ainda não feita) é recusada','gestor',
 format($q$ select public.dispatch_trip_from_order_stops(gen_random_uuid(), %L, null, null, array[(select id from public.order_stops where order_id=%L and address_label='Loja B')])::text $q$, t.id('drv_motorista2'), t.id('pedido')), 'ERRO%pickup_must_precede_delivery%');
select t.check('4 Despacho','Carga acima da capacidade do veículo é recusada (6,5 kg na moto de 5 kg)','gestor',
 format($q$ select public.dispatch_trip_from_order_stops(gen_random_uuid(), %L, %L, null, (select array_agg(id order by (stop_type='pickup') desc, address_label) from public.order_stops where order_id=%L))::text $q$, t.id('drv_motorista2'), t.id('moto'), t.id('pedido')), 'ERRO%vehicle_capacity_exceeded%');
select t.check('4 Despacho','Previsões fora de ordem são recusadas','gestor',
 format($q$ select public.dispatch_trip_from_order_stops(gen_random_uuid(), %L, null, null, array[(select id from public.order_stops where order_id=%2$L and stop_type='pickup'),(select id from public.order_stops where order_id=%2$L and address_label='Loja B')], array[now() + interval '2 hours', now() + interval '1 hour']::timestamptz[])::text $q$, t.id('drv_motorista2'), t.id('pedido')), 'ERRO%planned_at_out_of_order%');
