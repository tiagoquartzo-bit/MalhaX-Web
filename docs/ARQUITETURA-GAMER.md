# MalhaX — arquitetura inicial

## Aplicações

- **Painel web:** operações, cadastro e aprovação de motoristas, despacho, acompanhamento ao vivo, suporte, comprovantes e indicadores.
- **Experiência do backoffice:** há uma única aplicação web autenticada. Gestor, equipe de backoffice e suporte navegam pelos módulos da mesma interface; visão gerencial, operação ao vivo, atendimento e gestão de motoristas são seções do mesmo produto, não painéis ou sistemas independentes. A equipe pode chamar ou enviar WhatsApp ao motorista quando o telefone estiver cadastrado; conversas iniciadas pelo app ficam no inbox compartilhado.
- **Android:** viagens atribuídas, lista ordenada de paradas, navegação externa, leitura de códigos, execução de coleta/entrega, ocorrências e sincronização offline.
- **Backend:** Supabase (PostgreSQL, Auth, Storage privado e Realtime). Operações sensíveis passam por funções/RPC no servidor; o cliente não recebe `service_role`.
- **Plataforma e empresas:** MalhaX é o produto/plataforma. Cada cliente é uma organização/tenant em `organizations`, com usuários, dados e permissões isolados por membership e RLS. Activia é o primeiro tenant cadastrado (`slug=activia`), não a marca do sistema. O acesso a módulos deve ser configurável por tenant (por exemplo, Activia com roteiro); essa camada de licenças/recursos ainda precisa ser implementada antes de comercializar módulos diferentes.
- **Compartilhado:** tipos de API, enums e validações sem segredos em `packages/shared`.

Perfis de analista e assistente precisam de permissões somente leitura definidas antes de serem atribuídos. As roles atualmente modeladas são admin, manager, dispatcher, support, driver e finance; não conceder acesso operacional amplo a novos usuários sem atualizar a matriz de autorização e as políticas RLS.

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
- A migration `202610060004_organizations_activia.sql` está aplicada no Supabase local. Nenhuma migration foi aplicada em banco Supabase hospedado.


