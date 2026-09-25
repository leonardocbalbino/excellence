# 0002 — Prisma como ORM e ferramenta de migrations

- **Status:** aceito
- **Data:** 2026-09-25

## Contexto

O domínio exige PostgreSQL com recursos além do CRUD: triggers que impedem UPDATE/DELETE em
tabelas append-only, hash encadeado em `time_entries`, `timestamptz` em UTC e filtro obrigatório
por `company_id` + escopo em toda consulta.

## Decisão

Usar **Prisma** (client + Prisma Migrate), com estas convenções:

- Migrations versionadas em `apps/api/prisma/migrations`. Triggers, funções, índices parciais e
  políticas são escritos **em SQL dentro das migrations** (`--create-only` + edição).
- Tipos de data sempre `DateTime @db.Timestamptz(6)`.
- Isolamento multi-empresa por **Prisma Client Extension** que injeta `company_id` e o escopo do
  usuário. Consultas SQL cruas passam por helpers que exigem esses parâmetros.
- Consultas analíticas pesadas (relatórios, motor de cálculo) podem usar `$queryRaw` tipado
  (TypedSQL), sempre com `company_id`.

## Consequências

- Schema declarativo legível e migrations maduras; ótimo DX com tipos gerados.
- Partes do banco (triggers append-only, funções de hash) ficam fora do `schema.prisma` e são
  cobertas por testes de integração com Testcontainers.
- Detalhes do isolamento por empresa entram no ADR da etapa 0.4 (RBAC e escopo).

## Alternativas consideradas

- **Drizzle**: SQL mais explícito e runtime leve, mas migrations menos maduras e menos
  familiaridade esperada do time.
