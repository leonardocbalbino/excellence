# Excellence

Sistema de gestão de pessoas, controle de ponto e rondas.

## Requisitos

- Node.js 22 LTS (`.nvmrc`)
- pnpm via Corepack: `corepack enable`
- Docker (com Compose v2)

## Primeiros passos

```bash
corepack enable
pnpm install
cp .env.example .env
pnpm infra:up        # Postgres, Redis, MinIO (+ bucket) e Mailpit
pnpm --filter @excellence/api db:deploy   # aplica as migrations
pnpm --filter @excellence/api db:seed     # empresa de exemplo, perfis e usuários
pnpm dev             # API em :3000, web em :5173
```

| Serviço             | Endereço                                                        |
| ------------------- | --------------------------------------------------------------- |
| API                 | http://localhost:3000/api/v1                                    |
| OpenAPI (UI / JSON) | http://localhost:3000/docs / http://localhost:3000/openapi.json |
| Health (live/ready) | http://localhost:3000/health/live · /health/ready               |
| Web (PWA)           | http://localhost:5173 (a API passa pelo proxy em `/api`)        |
| Postgres            | `localhost:5432` (bancos `excellence` e `excellence_test`)      |
| Redis               | `localhost:6379`                                                |
| MinIO API / console | http://localhost:9000 / http://localhost:9001                   |
| Mailpit (SMTP / UI) | `localhost:1025` / http://localhost:8025                        |

## Scripts

| Comando                                                 | O que faz                                                                                                |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `pnpm build`                                            | Build de todos os pacotes (Turborepo)                                                                    |
| `pnpm lint` / `pnpm typecheck` / `pnpm test`            | Verificações (testes unitários)                                                                          |
| `pnpm test:integration`                                 | Integração com Testcontainers (Docker)                                                                   |
| `pnpm test:e2e`                                         | e2e com Playwright (Docker e Chromium: `pnpm --filter @excellence/web exec playwright install chromium`) |
| `pnpm --filter @excellence/api db:generate`             | Gera o Prisma Client                                                                                     |
| `pnpm --filter @excellence/api db:deploy`               | Aplica as migrations                                                                                     |
| `pnpm --filter @excellence/api db:seed`                 | Dados de exemplo (idempotente)                                                                           |
| `pnpm --filter @excellence/api db:new-migration <nome>` | Gera migration a partir do schema (revise o SQL)                                                         |
| `pnpm format` / `pnpm format:check`                     | Prettier                                                                                                 |
| `pnpm infra:up` / `pnpm infra:down`                     | Sobe / derruba a infraestrutura local                                                                    |

## Usuários de teste (seed)

O seed cria a empresa de exemplo, 2 unidades (Matriz em São Paulo e Filial em Campinas, com
coordenadas e cerca virtual), departamentos, cargos, um sindicato, os 4 perfis padrão e 6
funcionários. Senha: valor de `SEED_PASSWORD` no `.env`. Os perfis Administrador e RH exigem MFA: no primeiro
login, o sistema pede o cadastro no aplicativo autenticador.

| E-mail                     | Perfil        |
| -------------------------- | ------------- |
| admin@exemplo.com.br       | Administrador |
| rh@exemplo.com.br          | RH            |
| gestor@exemplo.com.br      | Gestor        |
| funcionario@exemplo.com.br | Funcionário   |

## Estrutura

```
apps/api                NestJS (API)
apps/web                React + Vite (PWA)
apps/mobile             Expo (fase 2)
packages/shared         Schemas Zod, tipos e client HTTP compartilhados
packages/tsconfig       Bases de tsconfig
packages/eslint-config  Configuração ESLint compartilhada
docs/adr                Decisões de arquitetura
docs/pendencias.md      Regras que aguardam definição jurídica/RH
```

## Convenções

- Commits no padrão [Conventional Commits](https://www.conventionalcommits.org/pt-br/), validados
  por hook.
- Documentação em português; código, tabelas e variáveis em inglês.
