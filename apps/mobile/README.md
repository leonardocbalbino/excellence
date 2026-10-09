# apps/mobile

App do funcionário (React Native com Expo e expo-router). Fase 2 (ADR 0019). Usa o mesmo
`@excellence/shared` do web: schemas, tipos e client HTTP.

> **Estado:** código escrito sem instalação nem execução. Antes de publicar, rode os passos
> abaixo, alinhe as versões com o Expo e teste em aparelho.

## O que tem

- **Login** por e-mail e senha, com código do autenticador para quem tem MFA ativo. O cadastro
  do MFA (RH/Admin) continua pelo site. Senha temporária: o app pede a troca.
- **Sessão:** refresh token no armazenamento seguro do sistema (Keychain/Keystore). Renova sozinho.
- **Biometria:** destrava o app ao abrir e depois de 5 min em segundo plano. É oferecida no
  primeiro login e fica em Mais › Destravar com biometria.
- **Início:** hora, marcações de hoje, próxima ronda e comunicados pendentes.
- **Ponto:** registro com localização e foto (quando a empresa exige), comprovante resumido e
  marcações do dia.
- **Rondas:** rotas e horários de hoje, iniciar a ronda, ler o QR code dos pontos pela câmera,
  encerrar (com motivo, se faltar ponto).
- **Mais:** espelho de ponto do mês, comunicados (com "li e estou ciente"), benefícios e links
  úteis, meu perfil, biometria e sair.
- **Tema** claro/escuro pelo aparelho, com as mesmas cores do web.

## Sem conexão

- **Ponto:** a marcação fica numa fila no aparelho com o horário em que foi feita e é enviada
  quando a conexão volta (sinalizada como "sem conexão" no espelho).
- **Rondas:** a ronda precisa ser **iniciada** com conexão. Depois, os pontos podem ser lidos
  sem sinal e entram na fila.
- **Abrir o app sem rede:** ele abre em modo offline com o último usuário. As rotas, a ronda em
  andamento, as permissões e a configuração do ponto ficam gravadas no aparelho por até 24 h;
  dados pessoais não.
- A fila é por usuário: num aparelho compartilhado, os registros de uma pessoa só saem com a
  sessão dela.
- O servidor aceita registros de até **72 h** atrás e nunca no futuro. O que ele recusar aparece
  como "não aceito", com opção de descartar. Isso é provisório: pendência P-026.

## Como rodar

```bash
pnpm install                              # na raiz; a primeira vez baixa o React Native
cd apps/mobile
npx expo install --fix                    # alinha as versões com o SDK do Expo instalado
cp .env.example .env                      # e ajuste EXPO_PUBLIC_API_URL
pnpm start                                # abre no Expo Go ou num development build
```

- O celular não enxerga `localhost`. Use o IP do computador na rede em `EXPO_PUBLIC_API_URL` e,
  na API, em `S3_PUBLIC_ENDPOINT` (o envio da foto vai direto ao storage).
- Câmera, biometria e armazenamento seguro funcionam no Expo Go, mas para publicar use um
  development build (`npx expo run:android` / `run:ios`) ou EAS Build.
- As versões em `package.json` são uma referência. `npx expo install --fix` coloca as versões
  certas para o SDK.

## Fica para depois

- Enviar atestado pela câmera.
- Pedir ajuste de ponto pelo app (hoje: pelo site).
- Notificações push (lembrete de ronda, comunicado novo).
- Cadastro do MFA pelo app.
