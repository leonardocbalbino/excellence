# 0008 — Trilha de auditoria append-only e arquivos com URL pré-assinada

- **Status:** aceito
- **Data:** 2026-09-25

## Contexto

A regra 2 exige tabelas append-only garantidas pelo banco, e a regra 7 exige auditar toda
leitura de dado sensível. O sistema recebe arquivos de funcionários (atestados, selfies de
ponto, fotos de ocorrência, planilhas), que não devem trafegar pela API nem ficar públicos.

## Decisão

**Append-only no banco**

- Função genérica `forbid_mutation()`, ligada por triggers `BEFORE UPDATE OR DELETE` (por linha) e
  `BEFORE TRUNCATE` (por comando). A mesma função serve para todas as tabelas append-only
  (`time_entries`, `hour_bank_entries`, `patrol_checkins`, `announcement_reads`,
  `document_acknowledgments`, `disciplinary_*`). Correções são registros novos que referenciam
  o original.
- Os triggers ficam no SQL das migrations e são cobertos por testes de integração.

**Trilha de auditoria (`audit_logs`)**

- Campos: empresa, `occurred_at` (horário do servidor, UTC), ator, IP, request ID, `action` (verbo
  no passado com prefixo de domínio, ex. `role.updated`), recurso e `metadata` JSON.
- `actor_user_id` fica sem FK de propósito, para o registro sobreviver a qualquer mudança nos
  cadastros.
- `AuditService.record(evento, tx?)`: dentro de uma transação, o registro é gravado ou desfeito
  junto com a mudança. Uma alteração recusada (ex.: tirar o último administrador) não deixa
  rastro falso.
- Eventos registrados:
  - login com sucesso (com cliente, uso de MFA e sessão) e login falho de usuário existente;
  - MFA ativado e MFA falho;
  - logout e reuso de refresh token;
  - perfil criado, editado (antes e depois) e excluído;
  - perfis de usuário alterados (entradas e saídas).
- Login com e-mail inexistente não tem empresa e fica só no log de acesso.
- **Leitura sensível (regra 7):** interceptor global. Em GET ou HEAD autorizado por permissão
  `sensitive` no catálogo, grava `sensitive_data.read` com rota, parâmetros e query (nunca os
  dados retornados), **antes** de a resposta sair. Se a auditoria falhar, os dados não são
  entregues. `audit:read` é sensível, então consultar a trilha também é auditado.
- `GET /audit-logs`: exige `audit:read` com escopo de empresa, tem filtros e paginação por cursor
  (`occurred_at`, `id`), da mais recente para a mais antiga.

**Arquivos**

- Tabela `files`: finalidade, chave no bucket, nome original, tipo, tamanho, status
  (`pending` / `uploaded`) e quem enviou. A chave é
  `<empresa>/<finalidade>/<ano>/<mês>/<id>` e nunca usa o nome enviado pelo usuário.
- As finalidades (`FILE_PURPOSES` no shared) definem os tipos e o tamanho máximo aceitos.
- **Upload direto ao storage por presigned POST:** o tamanho declarado (exato) e o `Content-Type`
  viram condições assinadas na política. O próprio storage recusa outro tamanho ou uma política
  adulterada.
- **Confirmação:** `HeadObject` confere tamanho e tipo, e os primeiros bytes são lidos para
  conferir a assinatura do formato (_magic bytes_). Isso impede, por exemplo, um executável
  declarado como PDF.
- **Download:** URL GET pré-assinada, `FILE_URL_TTL_SECONDS` (padrão 5 min), com
  `Content-Disposition: attachment` (nome ASCII em `filename` e UTF-8 em `filename*`).
- **Quem pode baixar** é decidido pelo módulo dono do registro (ex.: atestado).
  `FilesService.createDownloadLink` não checa permissão. Pela rota genérica `/files`, cada usuário
  só vê os arquivos que ele mesmo enviou.
- `S3_PUBLIC_ENDPOINT` permite assinar URLs com o endereço visto pelo navegador quando ele difere
  do usado pela API.

## Consequências

- A API não trafega bytes de arquivo, o que poupa memória e banda.
- Uploads iniciados e não confirmados ficam `pending`. Falta um job de limpeza (BullMQ), que
  entra com a infraestrutura de jobs.
- Antivírus e remoção de metadados EXIF (geolocalização em fotos) ficam como evolução. O
  armazenamento de selfies de ponto deve considerar o EXIF (etapa 1A.3).
- Retenção de auditoria e de arquivos depende de definição jurídica (pendências P-005 e P-006).
- Em produção, o bucket precisa de CORS liberando as origens do web para POST e GET.

## Alternativas consideradas

- **Upload pela API (multipart)**: simples, mas faz a API segurar arquivos grandes em memória e
  banda.
- **Presigned PUT**: não permite impor o tamanho máximo na assinatura.
- **Auditoria por trigger no banco**: captura tudo, mas não conhece o ator nem o contexto da
  requisição sem variáveis de sessão. Pode complementar no futuro.
