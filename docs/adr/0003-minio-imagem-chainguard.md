# 0003 — Imagem do MinIO no ambiente local

- **Status:** aceito
- **Data:** 2026-09-25

## Contexto

As imagens oficiais `minio/minio` e `minio/mc` não estão mais disponíveis para pull anônimo
(Docker Hub nega acesso e o quay.io retorna 401). Precisamos de storage S3-compatível local.

## Decisão

Usar as builds da Chainguard, `cgr.dev/chainguard/minio` e `cgr.dev/chainguard/minio-client`, só
no ambiente local (docker-compose).

- A imagem não traz `curl`, `grep` nem `mc`. O healthcheck usa `/dev/tcp` e builtins do bash
  contra `/minio/health/live`.
- O bucket é criado pelo serviço one-shot `minio-init` (profile `init`), executado por
  `pnpm infra:up`.

## Consequências

- A tag gratuita da Chainguard é só `latest`, sem versões fixas. Aceitável para dev local.
- A aplicação depende só da API S3 (SDK AWS v3). Trocar o provedor (AWS S3, R2, Garage, SeaweedFS)
  é questão de configuração.

## Alternativas consideradas

- **Garage / SeaweedFS / RustFS**: S3-compatíveis e com imagens públicas, mas o requisito do
  projeto cita MinIO. Viram plano B se a imagem da Chainguard deixar de estar disponível.
