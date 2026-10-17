-- ===== 11. Faturamento de clientes =====
select t.check('11 Faturamento','Suporte não altera o frete','suporte',
 format($q$ select public.set_order_freight(%L, 125, 'Frete combinado')::text $q$, t.id('pedido2')), 'ERRO%forbidden%');
select t.check('11 Faturamento','Gestor de outra empresa não altera o frete','intruso',
 format($q$ select public.set_order_freight(%L, 125, 'Frete combinado')::text $q$, t.id('pedido2')), 'ERRO%order_not_found%');
select t.check('11 Faturamento','Frete negativo é recusado','financeiro',
 format($q$ select public.set_order_freight(%L, -1, 'Correção')::text $q$, t.id('pedido2')), 'ERRO%invalid_amount%');
select t.check('11 Faturamento','Frete sem justificativa é recusado','financeiro',
 format($q$ select public.set_order_freight(%L, 125, ' ')::text $q$, t.id('pedido2')), 'ERRO%reason_required%');
select t.check('11 Faturamento','Pedido concluído sem frete não pode ser faturado','financeiro',
 format($q$ select public.create_client_invoice(%L, current_date - 1, current_date + 1, current_date + 30, null)::text $q$, t.id('cliente')), 'ERRO%orders_without_freight: 1%');
select t.check('11 Faturamento','Período invertido é recusado','financeiro',
 $q$ select count(*)::text from public.billing_overview(current_date, current_date - 1) $q$, 'ERRO%invalid_period%');
select t.check('11 Faturamento','Financeiro não lê frete diretamente da tabela de pedidos','financeiro',
 format($q$ select freight_value::text from public.orders where id=%L $q$, t.id('pedido2')), 'ERRO%');
select t.check('11 Faturamento','Financeiro define frete do pedido concluído','financeiro',
 format($q$ select public.set_order_freight(%L, 125, 'Valor negociado com o cliente')::text $q$, t.id('pedido2')), '125.00');
select t.check('11 Faturamento','Frete é lido pela RPC financeira','financeiro',
 format($q$ select freight_value::text from public.order_financials(array[%L]::uuid[]) $q$, t.id('pedido2')), '125.00');
select t.check('11 Faturamento','Suporte não consulta dados financeiros do pedido','suporte',
 format($q$ select freight_value::text from public.order_financials(array[%L]::uuid[]) $q$, t.id('pedido2')), 'ERRO%forbidden%');
select t.check('11 Faturamento','Visão financeira mostra o frete pendente','financeiro',
 format($q$ select pending_orders::text||'/'||pending_amount::text from public.billing_overview(current_date - 1, current_date + 1) where client_id=%L $q$, t.id('cliente')), '1/125.00');
select t.check('11 Faturamento','Suporte não cria fatura','suporte',
 format($q$ select public.create_client_invoice(%L, current_date - 1, current_date + 1, current_date + 30, null)::text $q$, t.id('cliente')), 'ERRO%forbidden%');
select t.check('11 Faturamento','Financeiro gera fatura do pedido concluído','financeiro',
 format($q$ select public.create_client_invoice(%L, current_date - 1, current_date + 1, current_date + 30, 'Faturamento teste')::text $q$, t.id('cliente')), '________-%', 'fatura_teste');
select t.check('11 Faturamento','Fatura registra quantidade e valor do pedido','financeiro',
 format($q$ select orders_count::text||'/'||total_amount::text from public.client_invoices where id=%L $q$, t.id('fatura_teste')), '1/125.00');
select t.check('11 Faturamento','Pedido não entra em uma segunda fatura','financeiro',
 format($q$ select public.create_client_invoice(%L, current_date - 1, current_date + 1, null, null)::text $q$, t.id('cliente')), 'ERRO%no_orders_to_invoice%');
select t.check('11 Faturamento','Frete atualiza enquanto a fatura está aberta','financeiro',
 format($q$ select public.set_order_freight(%L, 150, 'Revisão antes da emissão')::text $q$, t.id('pedido2')), '150.00');
select t.check('11 Faturamento','Total da fatura aberta acompanha o frete atualizado','financeiro',
 format($q$ select total_amount::text from public.client_invoices where id=%L $q$, t.id('fatura_teste')), '150.00');
select t.check('11 Faturamento','Status de fatura desconhecido é recusado','financeiro',
 format($q$ select public.set_client_invoice_status(%L, 'sent', null, null)::text $q$, t.id('fatura_teste')), 'ERRO%invalid_invoice_transition%');
select t.check('11 Faturamento','Financeiro emite a fatura','financeiro',
 format($q$ select public.set_client_invoice_status(%L, 'issued', null, null)::text $q$, t.id('fatura_teste')), 'issued');
select t.check('11 Faturamento','Frete de pedido faturado não pode ser alterado','financeiro',
 format($q$ select public.set_order_freight(%L, 175, 'Tentativa após emissão')::text $q$, t.id('pedido2')), 'ERRO%order_already_invoiced%');
select t.check('11 Faturamento','Financeiro recebe a fatura e registra a referência','financeiro',
 format($q$ with changed as (select public.set_client_invoice_status(%1$L, 'paid', 'PIX-TESTE', null) as status)
   select (changed.status='paid' and exists (select 1 from public.client_invoices where id=%1$L and status='paid' and payment_reference='PIX-TESTE'))::text from changed $q$, t.id('fatura_teste')), 'true');
select t.check('11 Faturamento','Fatura paga não volta para emitida','financeiro',
 format($q$ select public.set_client_invoice_status(%L, 'issued', null, null)::text $q$, t.id('fatura_teste')), 'ERRO%invalid_invoice_transition%');

-- ===== 12. Pagamento de motoristas =====
select t.check('12 Pagamentos','Suporte não define regra de pagamento','suporte',
 format($q$ select public.set_driver_pay(%L, 'daily', 100, 'Regra teste')::text $q$, t.id('drv_motorista1')), 'ERRO%forbidden%');
select t.check('12 Pagamentos','Modo de pagamento inválido é recusado','financeiro',
 format($q$ select public.set_driver_pay(%L, 'weekly', 100, 'Regra teste')::text $q$, t.id('drv_motorista1')), 'ERRO%invalid_pay_rule%');
select t.check('12 Pagamentos','Valor de pagamento zero é recusado','financeiro',
 format($q$ select public.set_driver_pay(%L, 'daily', 0, 'Regra teste')::text $q$, t.id('drv_motorista1')), 'ERRO%invalid_pay_rule%');
select t.check('12 Pagamentos','Regra sem justificativa é recusada','financeiro',
 format($q$ select public.set_driver_pay(%L, 'daily', 100, ' ')::text $q$, t.id('drv_motorista1')), 'ERRO%reason_required%');
select t.check('12 Pagamentos','Financeiro define regra por diária','financeiro',
 format($q$ select public.set_driver_pay(%L, 'daily', 100, 'Regra inicial')::text $q$, t.id('drv_motorista1')), 'daily');
select t.check('12 Pagamentos','Financeiro altera regra para valor por viagem','financeiro',
 format($q$ select public.set_driver_pay(%L, 'per_trip', 100, 'Regra por viagem')::text $q$, t.id('drv_motorista1')), 'per_trip');
select t.check('12 Pagamentos','Visão de pagamentos calcula viagens e valor base','financeiro',
 format($q$ select (pay_mode='per_trip' and rate=100 and trips_count>0 and days_worked>0 and base_amount=rate*trips_count and adjustments_amount=0 and total_amount=base_amount)::text from public.driver_pay_overview(current_date - 1, current_date + 1) where driver_id=%L $q$, t.id('drv_motorista1')), 'true');
select t.check('12 Pagamentos','Ajuste zerado é recusado','financeiro',
 format($q$ select public.add_driver_pay_adjustment(%L, current_date, 0, 'Ajuste')::text $q$, t.id('drv_motorista1')), 'ERRO%invalid_amount%');
select t.check('12 Pagamentos','Ajuste sem justificativa suficiente é recusado','financeiro',
 format($q$ select public.add_driver_pay_adjustment(%L, current_date, 25, 'ok')::text $q$, t.id('drv_motorista1')), 'ERRO%reason_required%');
select t.check('12 Pagamentos','Financeiro lança adicional ao motorista','financeiro',
 format($q$ select public.add_driver_pay_adjustment(%L, current_date, 25, 'Adicional de rota')::text $q$, t.id('drv_motorista1')), '________-%', 'ajuste_positivo');
select t.check('12 Pagamentos','Financeiro lança desconto ao motorista','financeiro',
 format($q$ select public.add_driver_pay_adjustment(%L, current_date, -5, 'Desconto de adiantamento')::text $q$, t.id('drv_motorista1')), '________-%', 'ajuste_negativo');
select t.check('12 Pagamentos','Ajuste pode ser removido antes do fechamento','financeiro',
 format($q$ select public.remove_driver_pay_adjustment(%L, 'Lançamento duplicado')::text $q$, t.id('ajuste_negativo')), 'true');
select t.check('12 Pagamentos','Financeiro fecha pagamento das viagens concluídas','financeiro',
 format($q$ select public.create_driver_payout(%L, current_date - 1, current_date + 1)::text $q$, t.id('drv_motorista1')), '________-%', 'pagamento_teste');
select t.check('12 Pagamentos','Pagamento fechado registra totais e pode ser marcado como pago','financeiro',
 format($q$ with changed as (select public.set_driver_payout_status(%1$L, 'paid', 'PIX-TESTE', null) as status)
   select (changed.status='paid' and exists (
   select 1 from public.driver_payouts p
   where p.id=%1$L and p.status='paid' and p.pay_mode='per_trip' and p.rate=100
     and p.trips_count>0 and p.days_worked>0 and p.base_amount=p.rate*p.trips_count
     and p.adjustments_amount=25 and p.total_amount=p.base_amount+25 and p.payment_reference='PIX-TESTE'
     and (select count(*) from public.driver_payout_trips pt where pt.payout_id=p.id)=p.trips_count))::text from changed $q$, t.id('pagamento_teste')), 'true');
