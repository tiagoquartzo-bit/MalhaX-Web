// Traduz os códigos de erro levantados pelas RPCs do banco (migration 0003)
// em mensagens para o usuário. Mensagens do Postgres chegam como "codigo" ou
// "codigo: detalhe"; só o código é usado para escolher o texto.

const MENSAGENS: Record<string, string> = {
  not_authenticated: "Sua sessão expirou. Entre novamente.",
  forbidden: "Você não tem permissão para esta operação.",
  forbidden_financial_values: "Somente administradores e gerentes podem informar frete e repasse.",
  client_unavailable: "Cliente inexistente ou inativo.",
  packages_required: "Informe ao menos um volume.",
  driver_unavailable: "Motorista indisponível (inativo ou não aprovado).",
  vehicle_unavailable: "Veículo indisponível.",
  stops_required: "Informe ao menos uma parada.",
  orders_required: "A viagem precisa ter ao menos um pedido.",
  order_not_dispatchable: "Algum pedido não está aguardando despacho.",
  stop_address_required: "Toda parada precisa de identificação e endereço.",
  stop_requires_order: "Paradas de coleta e entrega precisam de pedido.",
  package_not_in_stop_orders: "Volume não pertence aos pedidos da parada.",
  invalid_transition: "Mudança de status não permitida para esta parada.",
  reason_required: "Informe o motivo.",
  trip_not_active: "A viagem não está ativa.",
  stop_not_found: "Parada não encontrada.",
  trip_not_found: "Viagem não encontrada.",
  device_event_id_conflict: "Evento duplicado com conteúdo diferente.",
};

export function mensagemDeErroRpc(message: string | null | undefined): string {
  const codigo = (message ?? "").split(":")[0]?.trim() ?? "";
  return MENSAGENS[codigo] ?? "Não foi possível concluir a operação. Tente novamente.";
}
