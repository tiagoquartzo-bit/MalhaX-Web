# MalhaX

Base de engenharia para gestão de coletas e entregas, painel operacional e aplicativo Android para motoristas/motoboys.

## Estrutura

- `apps/web`: painel web do gestor e do suporte.
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

As migrations 001–010 foram aplicadas e validadas no ambiente local de desenvolvimento. Nenhuma migration foi aplicada em projeto Supabase hospedado.

O cadastro aberto está desativado na configuração local do Supabase. A autenticação do motorista e as permissões administrativas serão implementadas antes de habilitar fluxos de escrita.

## Domínios da operação

Clientes e contatos; motoristas, usuários e veículos; pedidos e volumes com códigos; viagens e paradas de coleta/entrega; atribuições; eventos operacionais; comprovantes e ocorrências; indicadores; auditoria.

## Regras fundamentais

1. Toda coleta e entrega é uma parada auditável, ligada a uma viagem e a um pedido.
2. Cada volume tem identificador interno e código público aleatório/QR, sem dados pessoais embutidos.
3. Comprovantes incluem autor, horário do dispositivo, horário de recebimento no servidor e coordenadas com precisão reportada pelo aparelho.
4. O app Android mantém uma fila local criptografada para sincronizar ações quando a conexão retornar; operações usam chave de idempotência.
5. A localização ao vivo só é coletada durante viagem ativa, com indicação clara de última atualização.
6. Motoristas com histórico são desativados, nunca apagados em cascata.
7. Fotos e documentos ficam em bucket privado; autorização é aplicada no servidor e por políticas RLS.

## Próximos passos

1. Validar as decisões registradas em `docs/DECISOES.md`.
2. Aplicar migrations em um projeto Supabase descartável/de desenvolvimento.
3. Implementar e revisar as RPCs transacionais de cadastro, despacho e execução antes de habilitar gravações do app.

Nenhum segredo ou credencial deve ser salvo no repositório.



