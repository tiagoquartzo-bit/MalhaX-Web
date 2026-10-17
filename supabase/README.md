# Supabase

Schema, políticas e operações transacionais são versionados em `migrations/`. O desenvolvimento usa Supabase local com Docker; desenvolvimento, homologação e produção devem permanecer separados. Antes de dados reais, revisar RLS com contas de cada papel e validar as migrations em ambiente descartável.

## Estado do backend

- Migrations `202609290001`–`202610090022`: schema operacional, isolamento por organização, despacho e paradas, comprovantes, GPS, cadastro de clientes e atendimento ao motorista.
- `202610060004_organizations_activia.sql` introduz `organization_id` e escopo multi-tenant. A Activia é a primeira organização.
- `202610060006_order_stops_model.sql` permite quantidades independentes de tarefas de coleta e entrega, cada uma com endereço e volumes associados.
- `202610060007_order_creation_dispatch_rpcs.sql` cria pedidos e despacha tarefas de forma transacional e idempotente.
- `202610060010_delivery_proof_security.sql` configura o bucket privado e exige evidência, recebedor e GPS válido para concluir entrega.
- `202610060011_driver_lifecycle.sql` controla ativação, suspensão, rejeição e inativação com justificativa, auditoria e proteção contra mudanças durante viagens ativas.
- `202610060012_delivery_proof_idempotency.sql` torna o registro de comprovante repetível com segurança quando o celular perde a resposta da rede.
- `202610060013_manager_trip_stop_controls.sql` adiciona RPCs para incluir, retirar sem apagar e reordenar paradas sob controle do gestor; aplicada no Supabase local.
- `202610060014_driver_tracking_history.sql` registra posições GPS por viagem com idempotência e validação do período da rota.
- `202610090015_client_registration.sql` cria clientes por RPC idempotente e auditável.
- `202610090016_two_photo_delivery_proof.sql` exige foto da entrega e foto da fachada/local.
- `202610090017_delivery_gps_capture_time.sql` separa o horário da captura GPS do horário das fotos.
- `202610090018_driver_support_chat.sql` cria conversas privadas entre motoristas e operação.
- `202610090019_support_realtime.sql` habilita publicação Realtime para mensagens e estado das conversas.
- `202610090020_support_thread_lifecycle.sql` fecha conversas com motivo, autor, horário e auditoria, de forma idempotente.
- `202610090021_tenant_aware_driver_invitation.sql` valida a organização ativa e o papel do convidador no backend, sem fixar o convite à Activia.
- `202610090022_backoffice_user_invitation.sql` controla convites do backoffice por hierarquia: admin pode convidar gestor, assistente, suporte ou financeiro; manager pode convidar assistente ou suporte.
- `202610090023_tracking_positions_realtime.sql` publica as posições GPS para acompanhamento ao vivo.
- `202610090024_vehicle_registration.sql` cadastra veículos com validação e auditoria.
- `202610100025_driver_route_realtime.sql` publica viagens e paradas para o app refletir alterações do gestor sem depender de atualização manual.
- `202610170032_business_rule_guarantees.sql` garante no banco: coleta antes da entrega (despacho e execução), aceite obrigatório e `start_trip` (GPS desde a saída), previsão por parada, conferência dos códigos dos volumes (`confirm_stop_packages`), capacidade do veículo em kg, peso/coordenadas obrigatórios no pedido, `manage_trip` (pausar, retomar, cancelar, reatribuir) e `cancel_order`, todos com motivo e auditoria.
- `202610170033_vehicle_edit_and_stop_addition.sql` cria `update_vehicle` (com motivo e auditoria; não desativa veículo em viagem ativa) e faz `add_order_stop_to_trip` validar capacidade, localização e gravar previsão.
- `tests/validacao-regras/executar.sh` aplica todas as migrations num PostgreSQL descartável e roda 129 cenários de regra de negócio (resultado esperado: 0 falhas).
- Cadastro aberto permanece desativado. Convites usam a Edge Function `functions/invite-driver`; SMTP transacional precisa ser configurado antes de validar envio de e-mails reais.
- Realtime de conversas e posições GPS tem migrations próprias (`019` e `023`); a migration `025` habilita atualizações de viagens e paradas para o app do motorista.
- O app do motorista acompanha mudanças em viagens e paradas via Realtime. Ao entrar em uma viagem em andamento, ele solicita autorização para registrar o GPS em segundo plano; o motorista pode recusar e ativar depois na tela da viagem.

As migrations 001–022 estão aplicadas no Supabase local, confirmado por `supabase migration list --local` em 09/10/2026. `supabase db lint --local` passou com um aviso de variável não usada em `add_order_stop_to_trip`. O typecheck de web e Android também passou. Ainda precisamos validar os fluxos integrados com contas de teste. Nenhuma migration foi aplicada a um projeto hospedado.

## Comandos locais

Na raiz do projeto:

- `pnpm db:start`: inicia a stack local.
- `pnpm db:migrations:local`: compara migrations locais com a base local.
- `pnpm db:lint:local`: valida o schema local.
- `pnpm db:reset:local`: apaga e recria os dados locais e aplica todas as migrations.
- `pnpm db:stop`: encerra a stack local.

`config.toml` é versionado sem secrets. Chaves geradas para o Supabase local servem apenas no próprio ambiente local. Nunca colocar `service_role` no web ou Android. Buckets de comprovantes e documentos devem permanecer privados, com autorização aplicada por políticas RLS e caminhos validados no servidor.









