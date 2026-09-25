# 0005 — Erros RFC 7807, validação com Zod e OpenAPI a partir do Zod

- **Status:** aceito
- **Data:** 2026-09-25

## Contexto

Web e mobile consomem a mesma API e compartilham schemas Zod em `packages/shared`. Precisamos de:
um formato de erro único e previsível; validação de entrada com os mesmos schemas que o cliente
usa; e documentação OpenAPI gerada pela API, sem duplicar DTOs em classes.

## Decisão

**Erros**

- Todo erro HTTP sai como RFC 7807 (`application/problem+json`), pelo filtro global
  `ProblemDetailsFilter`. O schema é o `problemDetailsSchema` de `@excellence/shared`.
- `type` identifica o problema de forma estável. `about:blank` vale para erros genéricos, e os
  específicos usam URNs `urn:excellence:problem:*`, definidas em `ProblemType` no shared. O
  cliente decide o tratamento pelo `type`, nunca pelo texto.
- Membros de extensão: `errors[]` (falhas por campo: `path` e `message`) e `requestId`.
- `instance` é o caminho da requisição, sem a query string.
- Código de domínio lança `ProblemException` com o problema completo.
- Erros conhecidos do Prisma são convertidos: P2002 vira 409 `unique-violation`, P2003 vira 409
  `reference-violation` e P2025 vira 404.
- Qualquer outro erro vira 500 genérico. A mensagem e a stack vão só para o log, junto com o
  `requestId`.
- Os endpoints de health são exceção: respondem no formato do Terminus, inclusive no 503, porque
  orquestradores e monitores esperam esse corpo.

**Validação**

- `ZodValidationPipe` valida e transforma a entrada (aplica defaults e coerções). Se falhar,
  responde **400** com `type = urn:excellence:problem:validation-error` e `errors[]`.
- Decorators `@ZodBody(schema)`, `@ZodQuery(schema)` e `@ZodParam(nome, schema)` validam e
  documentam o parâmetro em uma única anotação. `@ZodResponse(status, schema)` documenta a resposta.
- Os schemas de contrato ficam em `packages/shared`; a API não define DTOs em classes.

**OpenAPI**

- `@nestjs/swagger` monta o documento. Os schemas vêm do `z.toJSONSchema()` nativo do Zod 4
  (alvo `openapi-3.0`). Entradas usam `io: 'input'` (campos com default ficam opcionais) e saídas
  usam `io: 'output'`.
- O documento é publicado em `/openapi.json` e `/openapi.yaml`, com interface em `/docs`. A flag
  `OPENAPI_ENABLED` controla a publicação.
- Rotas de negócio usam o prefixo `/api/v1`. Os health checks ficam fora dele.

## Consequências

- Um só schema serve de validação no cliente, validação no servidor e documentação.
- Nenhuma dependência de terceiros entre o Zod e o Nest: a integração própria tem poucas linhas e
  acompanha as versões do Zod e do Nest.
- Tipos que o JSON Schema não representa (ex.: `z.date()`, transforms) aparecem como "qualquer
  valor" no OpenAPI. Nos contratos, datas trafegam como string ISO 8601.
- Falta gerar o client HTTP tipado no shared a partir do OpenAPI. Entra quando houver os
  primeiros endpoints de negócio (etapa 0.3).

## Alternativas consideradas

- **`nestjs-zod`**: menos código, mas nos prende ao ritmo de atualização da biblioteca.
- **class-validator + DTOs em classe**: duplicaria os schemas do shared e não serve para web e
  mobile.
- **422 para validação**: 400 é mais comum entre clientes HTTP e bibliotecas de formulário. O `type`
  já distingue validação de outros 400.
