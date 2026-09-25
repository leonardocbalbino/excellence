# 0009 — Web: client tipado, sessão no navegador, PWA e testes e2e

- **Status:** aceito
- **Data:** 2026-09-25

## Contexto

O web (PWA) é usado por administradores e RH no desktop e por funcionários no celular (ponto
e rondas). Ele precisa de sessão segura sem expor tokens a XSS, de funcionar instalado, e de
compartilhar contratos com a API e com o futuro app mobile.

## Decisão

**Client HTTP tipado (`@excellence/shared`)**

- `createApiClient` expõe um método por endpoint (`api.auth.login`, `api.access.roles.update`…),
  com os mesmos schemas Zod da API:
  - a entrada é validada antes do envio;
  - a resposta é conferida contra o contrato;
  - todo erro vira Promise rejeitada: `ApiError` (com o Problem Details) ou
    `ApiUnavailableError` (rede ou resposta fora do contrato).
- Em 401 do tipo `unauthenticated`, chama `refreshSession()` e repete a requisição uma vez. Não
  faz isso em login, refresh nem MFA.
- Web e mobile usam o mesmo client. Muda só a `baseUrl`, o transporte do refresh token e as
  `credentials`.

**Sessão no navegador**

- O access token fica **só em memória**. O refresh token é o cookie httpOnly (ADR 0006), e nada
  de token vai para localStorage.
- Ao abrir o app, a sessão é retomada chamando `/auth/refresh` com o cookie.
- O refresh é deduplicado dentro da aba e **serializado entre abas com a Web Locks API**, porque
  cada refresh token vale uma vez. Isso evita que duas abas disparem a detecção de reuso.
- A renovação acontece 60 s antes de o access token expirar, e reativamente em 401.
- O logout é propagado às outras abas por `BroadcastChannel`.
- Uma falha de rede não derruba a sessão; um 401 no refresh, sim.

**Interface**

- React Router 7 com rotas carregadas sob demanda (um pedaço de JS por módulo).
- TanStack Query para estado de servidor, React Hook Form + Zod (schemas do shared) para
  formulários, e componentes no padrão shadcn/ui (Radix + Tailwind 4) versionados no
  repositório.
- Menu e rotas filtrados pelas permissões de `/me/access`. Isso só orienta a interface: quem
  decide é a API, que nega por padrão.
- Se o perfil exige MFA e o usuário ainda não ativou, o web leva à página de segurança da conta.
- Em desenvolvimento, a API passa por proxy do Vite (mesma origem), como em produção atrás de
  proxy reverso. Assim não há CORS, e o cookie `SameSite=Strict` funciona.

**PWA**

- `vite-plugin-pwa` (`generateSW`, atualização automática). O manifesto tem ícones 192/512 e
  _maskable_, gerados por `scripts/generate-icons.mjs` (sem dependência nativa).
- O cache do service worker guarda **só o app shell**. Respostas da API (dados pessoais) nunca
  são cacheadas, e rotas `/api`, `/docs` e `/health` ficam fora do fallback de navegação. O
  modo offline de ponto e rondas é escopo do app mobile (fase 2).
- Câmera e geolocalização ficam em utilitários (`lib/device`) com erros traduzidos: posição com
  alta precisão e sem cache, horário do dispositivo guardado só para auditoria, e captura de
  foto via canvas (sem EXIF).

**Testes**

- Componentes e fluxos: Vitest + Testing Library + **MSW**. Requisição não simulada falha o
  teste.
- **e2e: Playwright.** O `globalSetup` sobe Postgres e Redis efêmeros (Testcontainers), aplica
  `migrate deploy`, roda o seed e inicia a API buildada. O web roda em `vite preview` com proxy
  para ela.
- Nenhum banco é apagado: cada execução começa num container novo. Um `migrate reset` num banco
  fixo foi descartado, porque é destrutivo e arriscado se a URL apontar para o banco errado.
- Os cenários cobrem login, cadastro obrigatório de MFA (com TOTP real), manutenção da sessão
  no reload, criação de perfil, auditoria, bloqueio por permissão e logout.

## Consequências

- Um XSS não consegue ler o refresh token. Com o access token em memória, o alcance fica
  limitado à aba e a 15 min.
- Recarregar a página custa um refresh, o que é aceitável.
- Navegadores sem Web Locks (antigos) ficam sem a serialização entre abas. Nesse caso, a
  detecção de reuso pode encerrar a sessão, e o usuário entra de novo.
- O job de CI de e2e depende de Docker no runner (Testcontainers) e do Chromium do Playwright.

## Alternativas consideradas

- **Gerar o client a partir do OpenAPI (openapi-typescript)**: duplicaria os tipos que já
  existem nos schemas Zod, e a validação de resposta se perderia.
- **Access token em sessionStorage**: sobrevive ao reload, mas fica exposto a XSS.
- **Banco e2e fixo com reset**: destrutivo; a infraestrutura efêmera é mais segura e isolada.
