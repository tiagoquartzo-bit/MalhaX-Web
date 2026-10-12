# MalhaX — arquitetura inicial

## Aplicações

- **Painel web:** operações, cadastro e aprovação de motoristas, despacho, acompanhamento ao vivo, suporte, comprovantes e indicadores.
- **Android:** viagens atribuídas, lista ordenada de paradas, navegação externa, leitura de códigos, execução de coleta/entrega, ocorrências e sincronização offline.
- **Backend:** Supabase (PostgreSQL, Auth, Storage privado e Realtime). Operações sensíveis passam por funções/RPC no servidor; o cliente não recebe `service_role`.
- **Organizações:** `organizations` representa a empresa/tenant. A Activia é a primeira organização (`slug=activia`). Papéis e dados operacionais são limitados a ela via membership e RLS.
- **Compartilhado:** tipos de API, enums e validações sem segredos em `packages/shared`.

## Fluxo operacional

1. Suporte/gestor cadastra o e-mail e os dados do motorista; o sistema envia convite para confirmação e criação de senha. Após a confirmação, revisa documentos e ativa a conta.
2. Operador cria pedido, endereços de coleta e entrega, valores e volumes. Cada volume recebe código único.
3. Despachante monta viagem, ordena paradas e atribui motorista e veículo. Atribuições e mudanças geram auditoria.
4. Android sincroniza a viagem. Em cada parada, o motorista confere/escaneia os volumes e registra coleta ou entrega, resultado, observação e evidências requeridas.
5. A fila offline envia eventos de forma idempotente. O painel distingue evento no aparelho de evento confirmado pelo servidor.
6. Suporte acompanha estados, última localização recebida, atraso de sincronização, ocorrências e comprovantes.

## Modelo conceitual

`organizations`; `organization_members`; `organization_member_roles`; `profiles`; `drivers`; `vehicles`; `clients`; `orders`; `packages`; `trips`; `trip_stops`; `stop_orders`; `stop_packages`; `tracking_positions`; `stop_events`; `delivery_proofs`; `incidents`; `audit_log`.

Pedido representa o compromisso comercial. Volume representa cada unidade física identificável. Parada representa uma ação em um endereço. Viagem agrupa paradas atribuídas. Evento é o histórico imutável da execução; campos de estado atual são projeções para leitura rápida. Entidades raiz operacionais guardam `organization_id`; relações entre parada, viagem, ordem e pacote são validadas para impedir mistura de empresas.

## Atualização em tempo real

Realtime serve para refletir novos eventos e posição recente no painel. A tela sempre mostra horário da última atualização e indicador de conexão; não apresenta posição antiga como atual. O app envia posições em frequência limitada durante uma viagem ativa e interrompe o envio ao encerrá-la.

## Recuperação e integridade

- Outbox local persistente no Android, com IDs UUID gerados no dispositivo e chave idempotente por ação.
- Eventos são append-only; correções criam evento compensatório com motivo e autor.
- Upload de arquivo usa caminho associado ao pedido/parada, validação de tamanho/tipo e confirmação de conclusão antes de encerrar a entrega.
- Índices e restrições no banco protegem atribuições, códigos únicos e transições válidas.
- Backup, restauração e alertas operacionais devem ser configurados no ambiente Supabase antes da produção.
- A migration `202610060004_organizations_activia.sql` está preparada, ainda não aplicada a um banco Supabase.


