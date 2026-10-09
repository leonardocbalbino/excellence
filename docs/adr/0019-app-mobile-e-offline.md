# 0019 — App mobile e registro sem conexão

- **Status:** proposto (código escrito; falta instalar, alinhar versões e testar em aparelho)
- **Data:** 2026-09-27

## Contexto

Vigilantes e rondantes trabalham em locais com sinal ruim e usam o celular o dia todo. O web
(PWA) funciona, mas exige conexão. A fase 2 prevê um app nativo com modo offline de ponto e
rondas e com biometria (ADRs 0001, 0006 e 0009).

## Decisão

**Stack**

- Expo com expo-router em `apps/mobile`, agora dentro do workspace pnpm. Reaproveita o
  `@excellence/shared` (schemas, tipos e client HTTP) com `clientName: 'mobile'`.

**Sessão**

- Login com `client: 'mobile'`: o refresh token vem no corpo (ADR 0006).
- O refresh token fica no armazenamento seguro do sistema (Keychain/Keystore, só neste
  aparelho). O access token fica só em memória.
- Os dados básicos do usuário também ficam no armazenamento seguro, para abrir o app sem
  conexão ("modo offline"). A sessão se renova sozinha no primeiro pedido com conexão (401 →
  refresh).

**Biometria**

- Opcional e local. Destrava o app ao abrir e depois de 5 min em segundo plano. Não substitui a
  senha no servidor: só protege o refresh token guardado.

**Registro sem conexão (API)**

- A marcação de ponto e o check-in de ronda aceitam `offlineRecordedAt`, o momento em que o
  registro foi feito no aparelho.
- Regras (`resolveOfflineTime`):
  - só vale para o app (`X-Client: mobile`);
  - nunca no futuro (2 min de tolerância de relógio);
  - no máximo 72 h para trás;
  - no check-in, não antes do início da ronda.
- O registro é gravado com esse horário e `source = 'mobile_offline'`. A API expõe `offline` na
  marcação e no check-in, para quem analisa.
- Sem migration: `source` já era texto.

**Fila no aparelho**

- Os registros sem conexão ficam guardados no aparelho, em ordem e por usuário. Num aparelho
  compartilhado, a fila de uma pessoa não sai com a sessão de outra.
- A fila é enviada quando a conexão volta, quando o app volta ao primeiro plano e a cada
  minuto.
- Falha de rede ou 5xx: tenta de novo depois. Recusa do servidor: o item fica como "não aceito"
  para a pessoa ver e descartar.
- Cada item tem a sua chave de idempotência. Se a primeira tentativa (com conexão) cair no
  meio e a resposta se perder, o item da fila usa outra chave (o corpo muda). No pior caso
  entram duas marcações, e o gestor desconsidera uma por ajuste.
- A ronda precisa ser iniciada com conexão, porque o servidor cria a ronda. Depois, os pontos
  podem ser lidos sem sinal.
- Para abrir o app sem rede, as permissões, as rondas e a configuração do ponto ficam gravadas no
  aparelho por até 24 h. Dados pessoais (perfil, espelho, benefícios) não são gravados.

## Consequências

- A marcação offline confia no relógio do aparelho. Isso precisa de aval jurídico (Portaria
  MTP 671/2021, REP-P): pendência P-026. Enquanto isso, a janela de 72 h é provisória e toda
  marcação offline aparece sinalizada.
- O app ainda não foi instalado nem executado. As versões em `package.json` são uma referência:
  `npx expo install --fix` alinha com o SDK.

## Alternativas consideradas

- PWA com service worker e fila: sem biometria nativa, e o iOS limita a sincronização em
  segundo plano.
- Horário do servidor na sincronização: registraria a hora errada (a do envio, não a da
  marcação).
