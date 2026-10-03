# Deploy

Mesma VPS do cartao-colaborativa e do arsenal-cac, em pasta e portas próprias. O build (API + web)
roda no GitHub Actions; a VPS só recebe os artefatos por `rsync` e ativa a release nova com um
symlink atômico + `pm2 reload`. A VPS nunca clona o repositório.

- API: NestJS via PM2, só em localhost; o nginx faz proxy de `/api/`.
- Web: SPA estática (Vite), servida direto pelo nginx a partir de `current/web`.
- Migrations: rodam no runner, por túnel SSH até o Postgres da VPS, antes da troca de release.

## Portas

Sem DNS por enquanto: acesso por `http://169.58.37.26:<porta>` (nginx escutando direto na porta).

| Ambiente | Web (nginx) | API (PM2, localhost) |
| -------- | ----------- | -------------------- |
| prod     | 8200        | 3200                 |
| staging  | 8201        | 3201                 |

Infra compartilhada pelos dois ambientes, só em `127.0.0.1`: Redis em 6390 (DB 1 prod, DB 2
staging) e MinIO em 9100 (container `excellence-minio`, buckets `excellence-prod` e
`excellence-staging`, console em 9101). O navegador envia e baixa arquivos pelo vhost
`excellence-arquivos` (porta 8202), via URLs pré-assinadas.

Sem HTTPS, `AUTH_COOKIE_SECURE` fica `false` (ecosystem) e a batida de ponto não funciona: câmera,
geolocalização e `crypto.randomUUID` exigem contexto seguro no navegador. Com domínio: voltar os
vhosts pra `listen 80` + `server_name`, rodar o certbot e religar `AUTH_COOKIE_SECURE`.

## Estrutura na VPS

```
/var/www/projetos/repo/excellence/
  prod/
    ecosystem.prod.config.js   ← copiado deste diretório
    secrets.env                ← criado na VPS (modelo: secrets.env.example)
    releases/<timestamp>/{api,web}
    current -> releases/<timestamp>
  staging/
    ecosystem.staging.config.js
    secrets.env
    releases/<timestamp>/{api,web}
    current -> releases/<timestamp>
```

## Setup inicial (uma vez)

1. Diretórios (dono = usuário do `VPS_USER`):

   ```bash
   sudo mkdir -p /var/www/projetos/repo/excellence/{prod,staging}/releases
   sudo chown -R $USER:$USER /var/www/projetos/repo/excellence
   ```

2. Banco (como superuser; as extensões são criadas pelas migrations):

   ```sql
   CREATE ROLE excellence LOGIN PASSWORD 'SENHA_FORTE';
   CREATE DATABASE excellence_prod OWNER excellence;
   CREATE DATABASE excellence_staging OWNER excellence;
   ```

3. Ecosystem e secrets:

   ```bash
   scp deploy/ecosystem.prod.config.js usuario@vps:/var/www/projetos/repo/excellence/prod/
   scp deploy/ecosystem.staging.config.js usuario@vps:/var/www/projetos/repo/excellence/staging/
   scp deploy/secrets.env.example usuario@vps:/var/www/projetos/repo/excellence/prod/secrets.env
   scp deploy/secrets.env.example usuario@vps:/var/www/projetos/repo/excellence/staging/secrets.env
   # editar os dois secrets.env na VPS (chmod 600)
   ```

4. Nginx + HTTPS (o cookie de sessão é `Secure`):

   ```bash
   sudo cp nginx-prod.conf /etc/nginx/sites-available/excellence-prod
   sudo cp nginx-staging.conf /etc/nginx/sites-available/excellence-staging
   sudo cp nginx-arquivos.conf /etc/nginx/sites-available/excellence-arquivos
   sudo ln -s /etc/nginx/sites-available/excellence-{prod,staging,arquivos} /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx
   sudo certbot --nginx -d excellence.cartaocolaborativa.com.br \
     -d dev.excellence.cartaocolaborativa.com.br -d arquivos.excellence.cartaocolaborativa.com.br
   ```

5. Primeiro deploy: push na `main` (prod) ou label `staging` num PR. O `pm2 startOrReload` cria o
   processo na primeira vez.

## GitHub (Settings → Secrets and variables → Actions)

| Secret                 | Valor                                                                       |
| ---------------------- | --------------------------------------------------------------------------- |
| `VPS_HOST`             | mesmo do cartao-colaborativa                                                |
| `VPS_USER`             | idem                                                                        |
| `VPS_SSH_KEY`          | idem (chave privada)                                                        |
| `VPS_SSH_PORT`         | opcional, padrão 22                                                         |
| `DATABASE_URL_PROD`    | igual ao `DATABASE_URL` do `prod/secrets.env` (`localhost:5432`, via túnel) |
| `DATABASE_URL_STAGING` | igual ao `DATABASE_URL` do `staging/secrets.env`                            |

Environments `production` e `staging` (Settings → Environments) já são referenciados pelos
workflows.

## Comandos úteis

```bash
pm2 logs excellence-api-prod
curl -s localhost:3200/health/ready   # database, redis e storage
```
