# Estrutura do projeto

## Monorepo

```text
00.Activia/
├── apps/
│   ├── web/                 # Next.js: painel gestor, despacho e suporte
│   └── android/             # Expo/React Native: aplicativo do motorista
├── packages/
│   └── shared/              # tipos e vocabulário compartilhado
├── supabase/
│   ├── functions/           # operações privilegiadas no servidor
│   └── migrations/          # alterações versionadas do PostgreSQL
├── docs/                    # arquitetura, fluxos, segurança, 5S e decisões
├── package.json             # scripts e configuração do workspace
└── pnpm-workspace.yaml
```

## Padrões

- `pnpm` gerencia o workspace na versão fixada em `package.json`; Node.js mínimo `22.13.0`.
- Cada app declara suas próprias dependências; nada de dependência global implícita para web/mobile.
- `apps/web` e `apps/android` têm configuração e variáveis de ambiente separadas.
- `packages/shared` contém apenas contratos sem acesso privilegiado a serviços.
- Migrations Supabase são sequenciais e nunca se reescrevem depois de aplicadas.
- `.env.example` não contém credenciais. Valores `NEXT_PUBLIC_*` e `EXPO_PUBLIC_*` são públicos e nunca podem incluir chave `service_role`.

## Comandos previstos

- `pnpm install`: instala dependências e gera `pnpm-lock.yaml`.
- `pnpm dev:web`: painel web.
- `pnpm dev:android`: servidor de desenvolvimento do app.
- `pnpm typecheck`: checagem de tipos dos projetos configurados.
- Início do Supabase local: instalar/configurar a CLI e executar `supabase start` na raiz (requer Docker compatível).

Antes de instalar dependências ou iniciar serviços, confirmar Node/pnpm e Docker disponíveis no ambiente.
