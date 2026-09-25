# 0006 — Autenticação: access token curto, refresh rotativo e MFA TOTP

- **Status:** aceito
- **Data:** 2026-09-25

## Contexto

Web (PWA) e mobile acessam a mesma API. O sistema guarda dados pessoais e sensíveis e tem perfis
administrativos que precisam de segundo fator. Funcionários de campo (rondas) ficam logados por
muito tempo em celulares compartilhados ou pessoais.

## Decisão

**Senha**

- Hash argon2id com os parâmetros mínimos da OWASP (19 MiB, 2 iterações), via `@node-rs/argon2`.
- Login por e-mail, único em todo o sistema (`citext`). Ver pendência P-001 para colaboradores
  sem e-mail.
- E-mail inexistente, senha errada e usuário inativo recebem a mesma resposta 401
  (`invalid-credentials`). Quando o e-mail não existe, a senha é verificada contra um hash
  fictício, para o tempo de resposta não revelar quais e-mails estão cadastrados.
- Limite de falhas no Redis, em janela fixa de `LOGIN_LOCKOUT_MINUTES`:
  - por e-mail + IP (`LOGIN_MAX_ATTEMPTS`). Assim, quem ataca de outro IP não consegue bloquear a
    conta de alguém;
  - por IP (`LOGIN_IP_MAX_ATTEMPTS`), contra ataque a muitas contas.

  Ao estourar, responde 429 com `Retry-After`. O IP vem do Express, respeitando `TRUST_PROXY`.

**Access token**

- JWT HS256 (`jose`), `ACCESS_TOKEN_TTL_SECONDS` (padrão 15 min), com `sub`, `cid` (empresa),
  `sid` (família do refresh), `typ` e `jti`.
- O guard global (`AuthGuard`) exige `Authorization: Bearer` em toda rota, salvo `@Public()`, e
  aceita só `typ=access`, salvo `@AcceptTokenTypes(...)`. O guard só autentica; permissão e escopo
  ficam com o RBAC (ADR da etapa 0.4).
- O access token é stateless e só expira. Logout e desativação passam a valer na renovação,
  no máximo em 15 min.

**Refresh token**

- Token opaco de 256 bits. O banco guarda só o SHA-256 (`refresh_tokens.token_hash`).
- Cada login abre uma família (`family_id`), e cada uso consome o token e emite o próximo.
  O consumo é um `UPDATE ... WHERE used_at IS NULL` atômico: em requisições concorrentes com o
  mesmo token, só uma vence.
- Se um token já consumido for reapresentado, é sinal de roubo e a família inteira é revogada
  (`reuse_detected`).
- A validade é deslizante (`REFRESH_TOKEN_TTL_DAYS`, padrão 30 dias) e renovada a cada rotação.
  Ver pendência P-004.
- **Web:** cookie `excellence_rt` `HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth`. O
  JavaScript nunca vê o token, e SameSite=Strict mais o path restrito bloqueiam CSRF. O access
  token fica só em memória.
- **Mobile:** o token vai no corpo e fica no armazenamento seguro do aparelho (etapa 2.1).
- Respostas com tokens levam `Cache-Control: no-store`.
- Como cada token vale uma vez, o web deve serializar o refresh entre abas (Web Locks API,
  etapa 0.6).

**MFA (TOTP, RFC 6238)**

- Parâmetros: SHA-1, 6 dígitos, 30 s e janela de ±1 passo, os padrões compatíveis com Google
  Authenticator, Microsoft Authenticator e similares.
- O segredo é cifrado com AES-256-GCM (`MFA_ENCRYPTION_KEY`) e o valor guardado tem prefixo de
  versão, para permitir rotação.
- Anti-replay: `users.mfa_last_used_step`. Um código não vale duas vezes, nem um código de passo
  anterior ao último aceito.
- 10 códigos de recuperação de uso único (`XXXXX-XXXXX`, alfabeto sem caracteres ambíguos),
  guardados como hash e exibidos uma única vez.
- Fluxo de login:
  1. Senha correta e MFA ativo: resposta `mfa_required`, com um token `mfa_challenge` de 5 min.
     O login termina em `/auth/mfa/verify`. Códigos errados são limitados por token de desafio.
  2. Senha correta, MFA obrigatório e ainda não configurado: resposta `mfa_enrollment_required`,
     com um token `mfa_enrollment`. Esse token só abre `/auth/mfa/setup` e `/auth/mfa/activate`,
     e a ativação já devolve a sessão.
- A obrigatoriedade vem da porta `MfaPolicy`. Até a etapa 0.4 ela não exige MFA de ninguém;
  depois passa a vir da configuração do perfil (`roles.requires_mfa`), nunca do nome do perfil.

## Consequências

- Roubo de refresh token é detectado no primeiro reuso, e um access token vazado vale no máximo
  15 min.
- HS256 exige que só a API conheça `JWT_SECRET`. Se outro serviço precisar validar tokens,
  migrar para assinatura assimétrica (EdDSA) com JWKS.
- O web precisa serializar o refresh entre abas.
- Eventos de login, logout e MFA passam a ser auditados na etapa 0.5.

## Alternativas consideradas

- **Sessão só em cookie (server-side session)**: simples no web, mas ruim para o mobile offline
  (fase 2).
- **Refresh token em localStorage**: fica exposto a XSS.
- **JWT como refresh token**: não permite revogação nem detecção de reuso sem guardar estado, e
  então não traz vantagem sobre o token opaco.
- **SMS como segundo fator**: custo e vulnerabilidade a SIM swap. Pode entrar depois como
  alternativa.
