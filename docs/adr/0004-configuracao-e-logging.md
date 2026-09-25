# 0004 — Configuração tipada e logging estruturado

- **Status:** aceito
- **Data:** 2026-09-25

## Contexto

A API depende de Postgres, Redis e storage S3 e vai lidar com dados pessoais e sensíveis. Se a
configuração estiver errada, o erro precisa aparecer no boot, não na primeira requisição. Os logs
precisam ser pesquisáveis e correlacionáveis por requisição, e não podem vazar credenciais nem
dados pessoais.

## Decisão

**Configuração**

- As variáveis de ambiente são validadas por um schema Zod (`apps/api/src/config/env.schema.ts`),
  ligado ao `@nestjs/config` via `validate`. Se houver erro, a API não inicia. A mensagem lista
  todas as variáveis inválidas, sem mostrar os valores recebidos.
- O código acessa a configuração só pelo serviço `AppConfig` (`get('CHAVE')`, tipado). Não se lê
  `process.env` diretamente.
- O `.env` fica na raiz do monorepo. Nos testes (`NODE_ENV=test`) ele é ignorado e o ambiente
  vem da configuração do Vitest ou dos containers.
- Prisma, Redis e S3 conectam sob demanda. A disponibilidade é verificada pelo `/health/ready`,
  não no boot. Assim a API sobe e responde ao liveness mesmo com uma dependência instável.

**Logging**

- `nestjs-pino`: JSON em produção e teste, `pino-pretty` em desenvolvimento.
- Cada requisição tem um `requestId`. Se o `X-Request-Id` recebido tiver até 128 caracteres de
  `[A-Za-z0-9._-]`, ele é reaproveitado; senão, gera-se um UUID. O ID volta no header da resposta
  e no corpo dos erros (ADR 0005).
- Por requisição, o log tem só método, URL, status e tempo de resposta. Corpo e headers não são
  logados. Há `redact` para `authorization`, `cookie`, `idempotency-key`, senhas, tokens, segredo
  TOTP e CPF, como defesa em profundidade.
- Os probes `/health/live` e `/health/ready` não geram log de acesso.
- Regra: dado sensível de domínio (CID, histórico disciplinar) nunca vai para log. O registro de
  acesso a esses dados é o `audit_logs` (etapa 0.5).

## Consequências

- Uma configuração errada falha rápido e com mensagem clara, e o tipo de cada variável é conhecido
  em compilação.
- Os logs podem ir direto para qualquer agregador JSON (Loki, CloudWatch, Datadog).
- Uma variável nova exige atualizar o schema e o `.env.example`.

## Alternativas consideradas

- **Logger padrão do Nest**: texto não estruturado, sem correlação por requisição.
- **Winston**: mais lento que o pino e com uma integração com Nest menos direta.
- **Conectar à infraestrutura no boot**: detecta falha mais cedo, mas acopla o liveness às
  dependências e dificulta subir a API para gerar o OpenAPI.
