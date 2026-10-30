# apps/mobile

App **do funcionário** (Expo SDK 55, expo-router, Reanimated). Usa o mesmo `@excellence/shared`
do web: schemas, tipos e client HTTP. Decisões em ADR 0019 (sessão e offline) e ADR 0022
(foco, visual e push).

## O que tem

- **Só para funcionário:** quem não tem cadastro de funcionário vê um aviso e só pode sair. A
  gestão continua no site.
- **Início:** saudação, relógio, como está o dia no ponto ("em jornada há 3h10"), próxima ronda
  com contagem regressiva, comunicados pendentes e atalhos.
- **Ponto:**
  - botão redondo com halo animado, "check" e vibração no sucesso;
  - localização e foto conforme a empresa exige, selfie com moldura do rosto;
  - linha do tempo das marcações do dia (entrada/saída) e atalho para o espelho.
- **Rondas:**
  - rotas e horários de hoje;
  - iniciar a ronda e ler os QR codes, com linha de leitura animada e flash verde/vermelho;
  - barra de progresso, próximo ponto destacado e encerramento com motivo.
- **Falar com o RH:** chamados com número único, conversa em bolhas com foto, aviso por push
  quando o RH responde (ADR 0023). O RH atende pelo site, em Comunicação › Atendimento.
- **Foto de perfil:** câmera ou galeria, com recorte quadrado (Mais, Início e Perfil).
- **Benefícios:** cartões por tipo e links úteis. VA/VT por dia mostram o valor diário e a
  prévia do mês pelo próprio ponto.
- **Mais:**
  - espelho do mês, comunicados (com "li e estou ciente") e meu perfil;
  - notificações e biometria;
  - sair.
- **Push:** lembrete de ronda e de ponto, comunicado novo, ajuste e atestado decididos. Tocar
  abre a tela certa.
- **Biometria:** destrava ao abrir e depois de 5 min em segundo plano.
- **Tema** claro/escuro pelo aparelho, com as cores do web.

## Sem conexão

- **Ponto:** a marcação fica numa fila no aparelho com o horário em que foi feita e é enviada
  quando a conexão volta (sinalizada como "sem conexão" no espelho).
- **Rondas:** a ronda precisa ser **iniciada** com conexão. Depois, os pontos podem ser lidos
  sem sinal e entram na fila.
- **Abrir sem rede:** permissões, rotas, ronda em andamento e configuração do ponto ficam no
  aparelho por até 24 h. Dados pessoais não ficam.
- O servidor aceita registros de até **72 h** atrás e nunca no futuro (P-026).

## API

- O app oficial usa a **API de produção**: `PRODUCTION_API_URL` em `app.config.ts`
  (`http://169.58.37.26:8200/api/v1`). Os perfis `preview` e `production` do `eas.json` fixam
  esse endereço.
- Em desenvolvimento, crie `.env` com `EXPO_PUBLIC_API_URL` apontando para o IP do computador
  na rede (o celular não enxerga `localhost`).
- A API ainda é HTTP: o build libera HTTP no Android e no iOS. Quando houver domínio com
  HTTPS, troque `PRODUCTION_API_URL` (P-029).

## Como rodar

```bash
pnpm install                 # na raiz
cd apps/mobile
pnpm start                   # Expo Go ou development build
```

Push, câmera e biometria completos precisam de um **development build**:

```bash
npx eas-cli@latest build --profile development --platform android
```

## Publicar

Passo a passo da Google Play (pela conta do Cartão Colaborativa), ficha da loja, segurança dos
dados e política de privacidade em [`docs/loja`](../../docs/loja/README.md).

```powershell
npx eas-cli@latest build --platform android --profile production   # gera o AAB
npx eas-cli@latest submit --platform android --profile production --latest   # teste interno, rascunho
```

O app lê o `@excellence/shared` direto do código-fonte (`metro.config.js`), porque o `dist/`
fica fora do git e não chega ao EAS. Nada precisa ser buildado antes.

## Fica para depois

- Pedir ajuste de ponto e consultar atestados pelo app (hoje: pelo site).
- Cadastro do MFA pelo app.
