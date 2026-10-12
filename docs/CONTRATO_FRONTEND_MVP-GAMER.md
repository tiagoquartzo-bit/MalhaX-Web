# Contrato inicial do front-end — MalhaX

Este contrato registra o modelo operacional e as interfaces validadas no Supabase local. A aplicação ainda não está vinculada ao projeto hospedado; mantenha desenvolvimento e testes locais até a revisão final.

## Estado atual do projeto

- Estrutura base web/Android e documentos funcionais já existem.
- A migration `202610060006_order_stops_model.sql` registra tarefas/endereço por pedido, com X coletas e Y entregas independentes.
- A migration `202610060007_order_creation_dispatch_rpcs.sql` define as RPCs de criar pedido e despachar tarefas.
- O fluxo de convite de motoristas está definido em `supabase/functions/invite-driver`.
- As migrations `202609290001`–`202610090024` estão aplicadas no Supabase local. A migration `202610090023_tracking_positions_realtime.sql` publica novos pontos GPS com a leitura protegida por RLS. O painel `/painel/ao-vivo` assina esses eventos e mantém consulta de segurança por minuto. Nenhuma migration foi aplicada ao Supabase hospedado nesta etapa. SMTP, testes integrados autenticados e validação em Android físico continuam pendentes.
- `/painel/novo-pedido` cria pedidos pela RPC transacional `create_order_with_stops`, com um registro por volume físico, coletas e entregas independentes, endereços próprios e associação de volumes às paradas. Os códigos dos volumes são gerados pelo banco.
- `/painel/despacho` monta e reordena a lista de paradas, seleciona motorista ativo, veículo opcional e horário de saída em `America/Sao_Paulo`; a criação usa `dispatch_trip_from_order_stops`, que verifica disponibilidade, tenant, estados e idempotência no banco. O typecheck web passou em 09/10/2026. A validação visual e integrada dos fluxos segue pendente.
- `/painel/clientes` cadastra e lista clientes pela RPC idempotente `create_client`; `/painel/motoristas` lista contas, convida (admin/suporte) e altera status (admin/gestor/suporte) com motivo e auditoria. A revisão automática não autorizou ampliar convite para gestores.
- `/painel/paradas` reúne alertas para tarefas não despachadas, falhas, horários vencidos e entregas sem prova. Os filtros por pedido/endereço, tipo, status e motorista refinam a lista. A linha do tempo agrega eventos GPS, tentativas e fotos de comprovantes de cada tentativa.
- `/painel/indicadores` consulta agregados reais por mês selecionado, semestre e ano, com cartões selecionáveis, gráfico mensal e exportação CSV. `/painel/ao-vivo` consulta o último ponto GPS por viagem ativa, assina eventos Realtime e usa consulta de segurança por minuto. A visualização local plota coordenadas sem enviar GPS a mapas de terceiros; ainda não há mapa de ruas. `/painel/suporte` recebe e responde às mensagens do botão Suporte do app do motorista em tempo real. A rota local `/dev-preview/controle` é uma prévia interativa com dados demonstrativos; ela não substitui o painel conectado ao backend.
- `/painel/historico-motoristas` apresenta pontos diários e permite exportar CSV.

## Módulos do painel web

### Prioridade para o MVP

1. **Acesso:** login por e-mail e senha, aviso de convite e conclusão da senha.
2. **Painel inicial:** cartões de entregas/coletas por status, viagens ativas, paradas pendentes e ocorrências. Começar com dados mock.
3. **Motoristas:** lista, convite por e-mail, situação do cadastro e ações de ativar/suspender. O cadastro exige nome e sobrenome; e-mail é necessário para o convite. Telefone/documentos são opcionais.
4. **Clientes:** lista e formulário básico de contratante/contato.
5. **Pedidos:** cliente, volumes (cada linha é uma unidade/código) e uma lista dinâmica de tarefas. Cada linha permite escolher `Coleta` ou `Entrega`, informar endereço e vincular os volumes. Não fixar quantidade de coletas/entregas.
6. **Despacho:** selecionar tarefas pendentes, motorista e veículo; ordenar as paradas por arrastar/soltar ou controles de posição; mostrar tipo e endereço em cada parada.
7. **Detalhe da viagem:** sequência, estado das paradas, volumes esperados, ocorrências e comprovantes.
8. **Acompanhamento/indicadores:** indicadores operacionais, coordenadas de viagens ativas e histórico GPS/CSV conectados ao backend. O mapa geográfico de ruas depende da seleção de provedor aprovado; a atualização usa polling de 20 segundos, sem Realtime.
9. **Execução mobile do motorista:** viagens atribuídas, sequência, navegação, mudança de status, ocorrências e comprovante obrigatório de entrega.

### Etapas seguintes

- Testes integrados autenticados em Web e Android físico; validar foto, recebedor, horário e coordenadas/precisão.
- Validar em Android físico a fila offline idempotente de status e comprovantes (duas fotos), junto com posições GPS; a implementação web/Android já grava offline e sincroniza quando a conexão retorna, mas recuperação após reinício e cenários de espaço/permissão ainda precisam de piloto.
- SMTP transacional, convite real de motorista e links de confirmação em domínio hospedado.
- Mapa viário com provedor aprovado, realtime chat e alterações de rota sincronizadas imediatamente.
- Assinatura própria de produção Android, distribuição e operação no Supabase hospedado.
- Fechamento financeiro, repasses e indicadores financeiros.
- Configuração avançada do cadastro e revisão de documentos.
- Controles de permissão e telas administrativas detalhadas.

## Chamadas de gravação previstas

### Criar pedido

Chamar `create_order_with_stops` com:

- `p_request_id`: UUID gerado uma vez por envio e reutilizado em retries.
- `p_client_id`: UUID do cliente.
- `p_packages`: array de volumes; cada item representa uma unidade física e envia `quantity: 1` ou omite `quantity`.
- `p_order_stops`: array variável de coletas/entregas. Cada item envia `stop_type` (`pickup` ou `delivery`), `address_label`, `address_line` e `package_indexes`.
- `package_indexes` é baseado em 1 no array `p_packages`. Exemplo: `[1, 3]` associa os volumes 1 e 3 àquela tarefa.
- Campos adicionais aceitos nas tarefas: `address_extra`, `district`, `city`, `state`, `postal_code`, `contact_name`, `contact_phone`, `latitude`, `longitude`, `instructions`.
- Campos opcionais do pedido: `p_external_reference`, `p_instructions`, `p_freight_value`, `p_driver_payout`.

Cada tarefa deve ter pelo menos um volume associado. O backend gera um código por volume. O formulário pode mostrar um UUID de envio estável enquanto processa e só limpar após sucesso.

### Despachar viagem

Chamar `dispatch_trip_from_order_stops` com:

- `p_request_id`: UUID idempotente da ação de despacho.
- `p_driver_id`: motorista ativo.
- `p_vehicle_id`: veículo ou `null`.
- `p_planned_start_at`: data/hora planejada ou `null`.
- `p_order_stop_ids`: UUIDs das tarefas na ordem final da rota; a posição no array define a sequência.

O backend copia endereço e contato para cada parada executada e preserva o número da tentativa.
### Ajustar paradas de uma viagem (gestor/dispatcher)

- Adicionar: `add_order_stop_to_trip(p_trip_id, p_order_stop_id)` conecta à viagem uma tarefa já cadastrada e ainda não despachada (ou com exceção). A parada entra no fim da sequência; a tarefa e seus volumes mantêm os vínculos originais. A coleta dos volumes precisa estar concluída antes de incluir uma entrega na mesma viagem. A chamada é repetível: se a tarefa já estiver ativa na mesma viagem, retorna o `trip_stop_id` existente.
- Retirar: `remove_pending_trip_stop(p_trip_id, p_trip_stop_id, p_reason)` só retira parada pendente. Não apaga a linha: marca a execução como `skipped`, registra evento e motivo, e devolve a tarefa original à fila `pending_dispatch` para redistribuição. Paradas iniciadas/concluídas não podem ser removidas.
- Reordenar: `reorder_unstarted_trip_stops(p_trip_id, p_ordered_stop_ids, p_reason)` requer a lista completa das paradas da viagem e só funciona antes de qualquer parada começar. O motivo e a nova ordem ficam no `audit_log`.
- Os três caminhos são autorizados por função no servidor, limitados à organização e aos papéis `admin`, `manager` e `dispatcher`. O app deve atualizar a viagem após cada ação e informar o motorista da mudança; Realtime ainda não está configurado, então não prometa sincronização instantânea até esse canal existir.
- Esta migration cria somente a camada de backend. A interface no painel deverá ser integrada em `apps/web/src/app/painel/**` pelo responsável pelo front.

### Atualizar status da parada

Chamar `record_stop_event` com `p_stop_id`, `p_device_event_id`, `p_to_status`, `p_reason` opcional, `p_device_captured_at`, `p_latitude`, `p_longitude` e `p_location_accuracy_meters`. Reutilize o mesmo `p_device_event_id` em retries do mesmo evento. `failed` e `skipped` exigem motivo. O motorista só pode alterar paradas da própria viagem.

### Comprovante de entrega (motorista)

1. Marcar a parada como `arrived` ou `in_progress` com `record_stop_event`.
2. Capturar duas fotos obrigatórias: a evidência da entrega/mercadoria e a fachada ou identificação do local. Enviar ambas ao bucket privado `delivery-proofs` pelo Supabase Storage, em `<trip_id>/<trip_stop_id>/<uuid>.<ext>` e `<trip_id>/<trip_stop_id>/<uuid>-local.<ext>`, com `upsert: false`. MIME aceitos: JPEG, PNG e WebP; limite de 20 MiB por foto.
3. Chamar `register_delivery_proof` com `p_stop_id`, `p_storage_path`, `p_location_storage_path`, `p_recipient_name`, `p_captured_at_device`, `p_location_captured_at_device`, `p_latitude`, `p_longitude`, `p_location_accuracy_meters` e `p_package_id` opcional. O horário da evidência não se confunde com o horário da leitura GPS. Use `null` em `p_package_id` para uma evidência da parada inteira; para evidências por volume, envie o UUID do volume.
4. GPS é melhor esforço: latitude, longitude e precisão devem ser todos preenchidos ou todos nulos. Sem GPS ou com baixa precisão, o gestor vê a ocorrência e a entrega pode continuar. Permanecem obrigatórios as duas fotos, nome de quem recebeu e horário de captura. Uma evidência da parada inteira cobre todos os volumes; se forem evidências individuais, cada volume descarregado precisa ter sua evidência.

A foto da entrega e a foto do local devem ser carregadas antes de chamar `register_delivery_proof`; a parada precisa estar em `arrived` ou `in_progress`. O motorista só envia/consulta arquivos das próprias viagens. A equipe operacional autorizada consulta evidências da própria organização. O bucket não é público; use o SDK do Storage para obter acesso temporário ao visualizar imagens. Não conceda escrita direta à tabela `delivery_proofs` nem coloque `service_role` no cliente. Comprovantes antigos sem foto do local aparecem como pendência histórica; não são apagados nem retroativamente bloqueados.

### Gerenciar status do motorista

Chamar a RPC `set_driver_status` com `p_driver_id`, `p_new_status` e `p_reason`. A operação aceita `active`, `suspended`, `inactive` ou `rejected`, conforme transições permitidas no banco. Exige papel `admin`, `manager` ou `support` e justificativa de até 500 caracteres. Ativação exige e-mail confirmado; suspensão/inativação/rejeição exige que não haja viagem atribuída, aceita, em andamento ou pausada. Repetir o mesmo status é seguro e não duplica auditoria. O registro de comprovante também aceita retry do mesmo caminho e dados, sem duplicar evidência. Não excluir motoristas: inativar preserva histórico e evidências.
### Convidar motorista

Invocar Edge Function `invite-driver` com `email`, `full_name` (nome + sobrenome) e `phone` opcional. O usuário não escolhe organização ou papel; a função aplica Activia/motorista e valida autorização no servidor.

## Fronteira de arquivos para trabalho paralelo

Para reduzir conflitos neste checkout compartilhado:

- Claude pode trabalhar em `apps/web/src/app/painel/**`, componentes visuais e CSS.
- Este trabalho de backend fica em `supabase/migrations/**`, `supabase/functions/**` e documentação de contrato.
- Evitar editar em paralelo `apps/web/src/lib/supabase/**`, `apps/web/src/app/auth/**`, `package.json`, lockfile e configurações Supabase.
- É possível integrar e testar contra o Supabase local (`http://127.0.0.1:54321`) seguindo este contrato; não vincular nem aplicar alterações ao Supabase hospedado nesta etapa. Nunca incluir a chave `service_role` no front-end.

Um worktree Git isolado será a opção mais segura quando houver um checkpoint commitado do projeto. Até lá, a separação explícita de pastas reduz o risco, mas não isola alterações simultâneas no mesmo arquivo.










