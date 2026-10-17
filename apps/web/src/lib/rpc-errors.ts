// Traduz os códigos de erro levantados pelas RPCs do banco (migration 0003)
// em mensagens para o usuário. Mensagens do Postgres chegam como "codigo" ou
// "codigo: detalhe"; só o código é usado para escolher o texto.

const MENSAGENS: Record<string, string> = {
  not_authenticated: "Sua sessão expirou. Entre novamente.",
  package_weight_required: "Informe o peso (kg) de cada volume.",
  stop_coordinates_required: "Toda parada precisa de localização confirmada no mapa.",
  package_requires_one_pickup_and_one_delivery: "Cada volume precisa de exatamente uma coleta e uma entrega.",
  pickup_must_precede_delivery: "A coleta do volume precisa vir antes da entrega (ou já ter sido concluída).",
  vehicle_capacity_exceeded: "A carga da viagem passa da capacidade do veículo. Escolha outro veículo ou retire paradas.",
  planned_at_must_match_stops: "Informe a previsão de chegada de cada parada.",
  planned_at_out_of_order: "As previsões das paradas precisam seguir a ordem da rota.",
  request_id_and_driver_required: "Selecione o motorista e tente novamente.",
  order_stops_required: "Selecione ao menos uma parada.",
  forbidden: "Você não tem permissão para esta operação.",
  forbidden_financial_values: "Somente administradores e gerentes podem informar frete e repasse.",
  client_unavailable: "Cliente inexistente ou inativo.",
  invalid_client_data: "Revise os dados do cliente e tente novamente.",
  invalid_vehicle_data: "Revise a placa, a categoria e os dados do veículo.",
  vehicle_plate_already_exists: "Esta placa já está cadastrada nesta empresa.",
  request_id_conflict: "Este pedido já foi enviado com outros dados. Atualize a página antes de tentar novamente.",
  request_id_required: "Atualize a página e tente novamente.",
  packages_and_stops_required: "Adicione ao menos um volume e uma parada.",
  one_package_record_per_physical_unit: "Cada volume precisa ser cadastrado como uma unidade individual.",
  invalid_order_stop_type: "O tipo de parada é inválido.",
  package_indexes_must_be_array: "Revise a associação dos volumes às paradas.",
  stop_packages_required: "Associe ao menos um volume a cada parada.",
  package_index_out_of_range: "Um volume associado não existe mais. Revise as paradas.",
  package_without_order_task: "Associe cada volume a pelo menos uma coleta ou entrega.",
  packages_required: "Informe ao menos um volume.",
  driver_unavailable: "Motorista indisponível (inativo ou não aprovado).",
  vehicle_unavailable: "Veículo indisponível.",
  stops_required: "Informe ao menos uma parada.",
  orders_required: "A viagem precisa ter ao menos um pedido.",
  order_not_dispatchable: "Algum pedido não está aguardando despacho.",
  order_stop_not_dispatchable: "Uma ou mais paradas já foram atribuídas ou não podem ser despachadas.",
  duplicate_order_stop_ids: "A sequência contém uma parada repetida.",
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

