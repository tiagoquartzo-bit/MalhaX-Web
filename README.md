# MalhaX

Base de engenharia para gestão de coletas e entregas, painel operacional e aplicativo Android para motoristas/motoboys.

## Estrutura

- `apps/web`: backoffice único para gestor, operação e suporte.
- `apps/android`: aplicativo Android do motorista.
- `packages/shared`: contratos e regras compartilhadas entre as interfaces.
- `supabase/migrations`: schema versionado do PostgreSQL.
- `supabase/functions`: pontos de entrada para operações privilegiadas no servidor.
- `docs`: arquitetura, fluxos, segurança e decisões técnicas.

Convenções de organização e manutenção estão em `docs/5S.md`.

## Stack e comandos

- Monorepo TypeScript com `pnpm`.
- Painel: Next.js; app Android: Expo/React Native; contratos: `packages/shared`.
- Backend local: Supabase CLI e Docker; configuração sem credenciais em `supabase/config.toml`.
- Requer Node.js `22.13.0` ou superior e pnpm `11.25.0` (versão fixada no projeto).

Na raiz de `00.Activia`, rode `pnpm install`. Depois, `pnpm dev:web` inicia o painel e `pnpm dev:android` inicia o app. O Supabase CLI fica fixado nas dependências do projeto e usa o Docker Desktop para executar o backend local.

### Supabase local

- `pnpm db:start`: inicia a stack local.
- `pnpm db:migrations:local`: lista as migrations aplicadas localmente.
- `pnpm db:lint:local`: valida o schema local.
- `pnpm db:reset:local`: recria o banco local e aplica todas as migrations. Esse comando apaga os dados de desenvolvimento locais.
- `pnpm db:stop`: encerra a stack local.

As migrations `001–024` estão aplicadas no Supabase local de desenvolvimento. A migration `202610090023_tracking_positions_realtime.sql` publica novos pontos GPS no Supabase Realtime, mantendo as regras RLS existentes. As migrations `202610170032_business_rule_guarantees.sql`, `202610170033_vehicle_edit_and_stop_addition.sql` e `202610170034_billing_and_driver_pay.sql` devem ser aplicadas nessa ordem antes de validar as regras mais recentes. A migration `034` adiciona faturamento por pedido e faturas de clientes, além de regras e fechamentos de pagamento de motoristas. Nenhuma migration foi aplicada em projeto Supabase hospedado.

O cadastro aberto está desativado. As configurações locais da web e do Android usam a URL e a chave pública do Supabase local em arquivos ignorados pelo Git. Convites e permissões devem ser validados com contas de teste antes de qualquer implantação hospedada.

## Domínios da operação

Clientes e contatos; motoristas, usuários e veículos; pedidos e volumes com códigos; viagens e paradas de coleta/entrega; atribuições; eventos operacionais; comprovantes e ocorrências; indicadores; auditoria.

## Backoffice único

Gestor, backoffice, analistas, assistentes e suporte usam a mesma aplicação web e a mesma navegação. Os módulos de operação, acompanhamento, equipe, atendimento e visão gerencial são áreas do mesmo backoffice. O Android é o app de execução do motorista. Permissões de analista/assistente devem ser definidas como perfis somente leitura antes de habilitar esses acessos; não reutilizar papel de despachante ou suporte por conveniência.

## Regras fundamentais

1. Toda coleta e entrega é uma parada auditável, ligada a uma viagem e a um pedido.
2. Cada volume tem identificador interno e código público aleatório/QR, sem dados pessoais embutidos.
3. Comprovantes de entrega exigem foto da mercadoria/entrega, foto da fachada/local, nome do recebedor e horário; GPS com precisão reportada é registrado quando disponível e sinalizado quando ausente ou impreciso.
4. O app Android mantém status, comprovantes (duas fotos) e posições GPS pendentes em armazenamento privado do app para sincronizar quando a conexão retornar. A fila é idempotente e preserva arquivos até a confirmação do servidor.
5. A localização ao vivo só é coletada durante viagem ativa, com indicação clara de última atualização.
6. Motoristas com histórico são desativados, nunca apagados em cascata.
7. Fotos e documentos ficam em bucket privado; autorização é aplicada no servidor e por políticas RLS.
8. Um volume só é entregue depois de coletado; o despacho e a execução recusam a ordem invertida.
9. O motorista aceita e inicia a viagem antes de executar paradas; o GPS registra o trajeto desde a saída.
10. Coleta e entrega só são concluídas depois da conferência do código de cada volume (QR ou digitação).
11. Todo veículo tem capacidade em kg e o despacho recusa carga acima dela; cada parada recebe previsão de chegada.
12. Pausar, retomar, cancelar ou reatribuir viagem e cancelar pedido exigem motivo e ficam na auditoria.

## Estado para teste

- Web: `pnpm dev:web`, depois abra `http://127.0.0.1:3000/login`. O backoffice contém clientes, motoristas, coletas/entregas, despacho, visão gerencial com filtros mensais/semestrais/anuais, gráficos e CSV, histórico GPS, acompanhamento de viagens e inbox de suporte com mensagens Realtime.
- Android: `pnpm dev:android`. GPS em segundo plano exige um development build nativo; Expo Go não é suficiente. O motorista pode abrir atendimentos gerais ou vinculados à viagem, trocar mensagens com a equipe e retomar conversas anteriores. APKs em `apps/android/artifacts` são development builds que requerem Metro, não versões de produção assinadas.
- Backend: Supabase local via Docker. Use `pnpm db:migrations:local` e `pnpm db:lint:local` para inspecionar o schema.
- Build e typecheck foram verificados em 09/10/2026. O lint ESLint não inicializa neste checkout OneDrive: Node falha ao ler `eslint-plugin-react` com `UNKNOWN: unknown error, read`.

## Pendências antes de produção

1. Criar contas locais de teste (gestor e motorista) e validar convite/e-mail.
2. Testar pedido, volumes, despacho, alteração de rota, comprovante com foto/GPS e recuperação de conexão em Android físico.
3. Validar em Android físico a fila offline idempotente para status e comprovantes (duas fotos), inclusive reinício do app, pouco espaço e recuperação de conexão; o GPS é melhor esforço e pode ficar ausente ou impreciso, com alerta no painel.
4. Configurar SMTP transacional e implantar Edge Functions no projeto hospedado.
5. Escolher provedor de mapas aprovado para compartilhar posições GPS; nenhum tile externo é carregado por padrão e a tela atual usa coordenadas sem mapa de ruas.
6. Revisar segurança/tenant e gerar APK de produção assinado antes da distribuição.

Nenhum segredo ou credencial deve ser salvo no repositório.





