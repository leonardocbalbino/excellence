# 0022 — App do funcionário: foco, visual e notificações push

- **Status:** aceito
- **Data:** 2026-10-24

## Contexto

O app mobile (ADR 0019) foi escrito mas nunca instalado. O pedido agora:

- um app só para o funcionário;
- focado em bater o ponto, fazer a ronda com o leitor de QR code e ver os benefícios;
- com visual cuidado, animações e notificações push;
- apontando para a API de produção.

O web não muda.

## Decisão

**Escopo e regra de acesso**

- O app é só do funcionário. Quem não tem cadastro de funcionário (`hasEmployeeRecord`) vê
  um aviso e só pode sair. A gestão continua no site.
- Abas: Início, Ponto, Rondas (só com rota atribuída), Benefícios e Mais. Espelho,
  comunicados e perfil abrem a partir de outras telas.
- Continuam valendo as regras do ponto:
  - a localização e a foto seguem `clock_settings`: com a localização exigida, sem GPS não
    registra; com a foto exigida, a selfie vem antes;
  - o registro sem conexão vai para a fila do aparelho, com até 72 h e sinalizado (ADR 0019,
    P-026).

**API de produção**

- `PRODUCTION_API_URL` em `apps/mobile/app.config.ts` é o padrão. `EXPO_PUBLIC_API_URL`
  troca o endereço em desenvolvimento.
- Os perfis `preview` e `production` do `eas.json` fixam o endereço de produção.
- A API de produção ainda é HTTP num IP. Por isso o build libera HTTP no Android
  (`usesCleartextTraffic`) e no iOS (ATS). As duas liberações saem sozinhas quando o endereço
  for `https` (P-029).

**Visual**

- Mesmas cores do web, com um degradê da marca.
- Animações com Reanimated: entrada escalonada dos cartões, toque com mola, barra de abas
  com pílula animada, halo pulsando no botão do ponto, "check" no sucesso e tremida no erro,
  linha de leitura e flash verde/vermelho no leitor de QR, progresso da ronda.
- Vibração (expo-haptics) nas confirmações e nos erros.
- As animações contínuas respeitam o "reduzir movimento" do sistema.

**Benefícios no app**

- VA e VT por dia mostram o valor diário e uma prévia do mês, calculada com o próprio espelho
  de ponto e a mesma regra da API (ADR 0021), até ontem.
- O app avisa que o valor final é o do fechamento do RH, que pode ajustar exceções.

**Push** (`push_devices`, módulo `notifications`)

- O aparelho registra o token do Expo depois do login (`POST /me/push-devices`, contrato que já
  existia em `conversations.schemas`) e o remove ao sair.
- O token é único: outra conta no mesmo celular passa a recebê-lo.
- O envio é pelo serviço do Expo, em lotes de 100. Tokens que o Expo diz não existirem mais são
  apagados.
- O envio é "melhor esforço": nunca lança erro para a operação que o originou.
- Eventos:
  - comunicado publicado: aos funcionários do público com conta de acesso;
  - ajuste de ponto aprovado ou recusado;
  - atestado marcado válido ou inválido.
- Lembretes, conferidos a cada minuto (`PushReminders`), só nas empresas com aparelhos:
  - ronda: 10 min antes do horário; se ninguém iniciou, de 15 a 45 min depois;
  - entrada: de 10 min antes a 30 min depois do início do turno, sem marcação;
  - saída: até 60 min depois do fim do turno, com marcação em aberto.
- Sem lembrete em feriado, folga ou atestado aceito. O turno da noite termina no dia seguinte.
- Cada lembrete sai uma vez: a chave fica no Redis por 2 dias. Sem Redis, o lembrete não sai,
  porque é melhor faltar um aviso do que repetir a cada minuto.
- Tocar na notificação abre a tela dela.
- Configuração: `PUSH_ENABLED` (padrão ligado, desligado nos testes) e `EXPO_ACCESS_TOKEN`
  (opcional).

## Consequências

- Os tempos dos lembretes são regra operacional, não legal. Ficam em
  `notifications/domain/reminders.ts`.
- O lembrete de ponto percorre o quadro do dia de cada empresa com aparelho a cada minuto.
  Isso serve para uma instância e algumas centenas de funcionários; mais que isso pede fila
  (BullMQ).
- O push precisa de um projeto no expo.dev (`EAS_PROJECT_ID`), credencial FCM (Android) e
  chave APNs (iOS). Sem isso, o app funciona e só não recebe push.
- As versões do app foram alinhadas ao SDK 55 do Expo (`expo install --fix`; `expo-doctor` sem
  pendências).

## Alternativas consideradas

- Notificações locais agendadas pelo app: funcionam sem rede, mas ficam velhas quando a
  escala ou a rota mudam e o app não é aberto. Também não cobrem a decisão do RH.
- Firebase direto (sem o Expo): mais configuração e um SDK nativo a mais. O Expo entrega pelo
  FCM e pelo APNs do mesmo jeito.
- Um app novo do zero: perderia a sessão segura, a fila offline e a idempotência que já
  existem.
