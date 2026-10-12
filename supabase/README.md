# Supabase

Schema, políticas e operações transacionais são versionados em `migrations/`. O desenvolvimento usa Supabase local com Docker; desenvolvimento, homologação e produção devem permanecer separados. Antes de dados reais, revisar RLS com contas de cada papel e validar as migrations em ambiente descartável.

## Estado do backend

- Migrations `202609290001`–`202610060013`: schema operacional, políticas de leitura, RPCs, isolamento por organização, convite de motorista, tarefas variáveis por pedido, despacho, privilégios de tenant e comprovantes privados.
- `202610060004_organizations_activia.sql` introduz `organization_id` e escopo multi-tenant. A Activia é a primeira organização.
- `202610060006_order_stops_model.sql` permite quantidades independentes de tarefas de coleta e entrega, cada uma com endereço e volumes associados.
- `202610060007_order_creation_dispatch_rpcs.sql` cria pedidos e despacha tarefas de forma transacional e idempotente.
- `202610060010_delivery_proof_security.sql` configura o bucket privado e exige evidência, recebedor e GPS válido para concluir entrega.
- `202610060011_driver_lifecycle.sql` controla ativação, suspensão, rejeição e inativação com justificativa, auditoria e proteção contra mudanças durante viagens ativas.
- `202610060012_delivery_proof_idempotency.sql` torna o registro de comprovante repetível com segurança quando o celular perde a resposta da rede.
- `202610060013_manager_trip_stop_controls.sql` adiciona RPCs para incluir, retirar sem apagar e reordenar paradas sob controle do gestor; ainda pendente de validação local.
- Cadastro aberto permanece desativado. Convites usam a Edge Function `functions/invite-driver`; SMTP transacional precisa ser configurado antes de validar envio de e-mails reais.
- Realtime e acompanhamento ao vivo ainda não estão configurados.

As migrations 001–010 foram aplicadas em reset local limpo; as migrations 011 e 012 foram aplicadas incrementalmente sem apagar dados locais. A migration 013 foi criada, mas ainda não foi aplicada nem validada. `supabase db lint --local` passou e os fluxos principais foram exercitados com fixtures descartáveis e rollback. Isso valida o ambiente local, não substitui revisão de segurança pré-produção. Nenhuma migration foi aplicada a um projeto hospedado.

## Comandos locais

Na raiz do projeto:

- `pnpm db:start`: inicia a stack local.
- `pnpm db:migrations:local`: compara migrations locais com a base local.
- `pnpm db:lint:local`: valida o schema local.
- `pnpm db:reset:local`: apaga e recria os dados locais e aplica todas as migrations.
- `pnpm db:stop`: encerra a stack local.

`config.toml` é versionado sem secrets. Chaves geradas para o Supabase local servem apenas no próprio ambiente local. Nunca colocar `service_role` no web ou Android. Buckets de comprovantes e documentos devem permanecer privados, com autorização aplicada por políticas RLS e caminhos validados no servidor.




