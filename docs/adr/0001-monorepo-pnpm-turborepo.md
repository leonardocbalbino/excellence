# 0001 — Monorepo com pnpm + Turborepo e tooling compartilhado

- **Status:** aceito
- **Data:** 2026-09-25

## Contexto

API, web e (na fase 2) mobile compartilham schemas de validação, tipos e o client HTTP.
Precisamos de um único lugar para versionar esses contratos e de um pipeline que valide tudo junto.

## Decisão

- Monorepo **pnpm workspaces** + **Turborepo** (tasks `build`, `lint`, `typecheck`, `test`, `dev` com cache).
- Layout: `apps/api`, `apps/web`, `apps/mobile` (fora do workspace até a fase 2), `packages/shared`,
  `packages/tsconfig`, `packages/eslint-config`.
- **Node 22 LTS** (`.nvmrc`, `engines`), **pnpm** fixado via `packageManager` e Corepack.
- **TypeScript 6.0** fixado em `~6.0`. O TS 7 (compilador nativo) já é `latest`, mas o
  typescript-eslint ainda exige `<6.1`. Revisitar quando houver suporte.
- tsconfig base estrito: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `noImplicitOverride`, `noImplicitReturns`, `noUnused*`.
  - Exceção na API (NestJS): `exactOptionalPropertyTypes` desligado e `experimentalDecorators` /
    `emitDecoratorMetadata` ligados, exigidos pela injeção de dependência. Módulo `NodeNext`
    emitindo CommonJS.
- `packages/shared` é publicado em **ESM + CJS** (tsdown), consumido pela web (ESM) e pela API (CJS).
- **ESLint 10** flat config com `typescript-eslint` `strictTypeChecked` + `stylisticTypeChecked`;
  **Prettier** apenas para formatação (`eslint-config-prettier`).
- **Vitest** como runner único; na API via `unplugin-swc` para emitir metadata de decorators.
- husky com lint-staged (Prettier) no `pre-commit`. Mensagens de commit livres: commitlint foi removido.
- **CI** no GitHub Actions: format check, lint, typecheck, test, build em PRs.

## Consequências

- Mudança em `packages/shared` invalida o cache de API e web; contratos quebrados aparecem no typecheck.
- Sem `baseUrl`/`paths`: imports entre pacotes passam sempre pelo nome do pacote (`@excellence/*`).
- `consistent-type-imports` fica desligado na API, porque o NestJS precisa de imports de valor para
  resolver tipos injetados.

## Alternativas consideradas

- **Nx**: mais recursos (generators, grafo), porém mais pesado e opinativo do que precisamos.
- **tsup** para o shared: em modo manutenção e o gerador de `.d.ts` injeta `baseUrl`, rejeitado pelo TS 6.
- **Jest**: exigiria dois runners (web com Vitest); o SWC resolve os decorators no Vitest.
