# Fluxos e estados

## Cadastro do motorista

`rascunho → convite enviado → cadastro pendente → em revisão → ativo`

Saídas alternativas: `rejeitado`, `suspenso` e `inativo`. Cada transição registra ator, data e motivo. Motorista ativo precisa ter conta de autenticação vinculada, telefone verificado e veículo/documentos exigidos pela operação.

## Pedido e volumes

Pedido: `rascunho → aguardando despacho → planejado → em execução → concluído`.

Exceções explícitas: coleta não realizada, entrega não realizada, devolução, cancelado e em revisão. Cada volume tem código único, estado de custódia e eventos de leitura/transferência.

## Parada

Tipos `pickup` (coleta) e `delivery` (entrega). Estado: `pending → arrived → in_progress → completed`; exceção: `failed` com motivo obrigatório ou `skipped` com autorização/motivo. Para concluir, validar volumes esperados, campos exigidos, uploads confirmados (ou exceção autorizada) e idempotência.

## Viagem

`draft → assigned → accepted → in_progress → completed`; cancelamento/pausa exigem motivo. Reatribuição preserva histórico e invalida acesso operacional do motorista anterior.

## Ocorrências

Categorias iniciais: endereço incorreto, cliente ausente, recusa, volume divergente, avaria, veículo, segurança, atraso e outras. Ocorrência recebe prioridade, descrição, evidências opcionais, responsável e resolução.
