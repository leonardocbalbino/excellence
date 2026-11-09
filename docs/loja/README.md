# Publicar o app na Google Play

O app sai pela **conta de desenvolvedor própria da empresa** (conta de organização, verificada
com D-U-N-S). Por ser conta de organização, não vale a regra do teste fechado com 12
testadores por 14 dias: a produção é liberada depois da revisão da Google.

A Play só aceita **AAB** (Android App Bundle), não APK. O APK do perfil `preview` serve só
para instalar à mão em aparelhos de teste.

Nesta pasta:

- [`ficha-da-loja.md`](ficha-da-loja.md): nome, descrições, categoria e imagens da página do
  app na loja.
- [`seguranca-dos-dados.md`](seguranca-dos-dados.md): respostas do formulário "Segurança dos
  dados".
- [`politica-de-privacidade.md`](politica-de-privacidade.md): a política fica no site em
  `/privacidade`, sem login. Os campos destacados dependem do jurídico.

## O que já está pronto no app

- Pacote `gestao.excellence`, versão `1.0.0`. O `versionCode` é controlado pelo EAS e
  sobe sozinho a cada build de produção.
- Perfil `production` no `eas.json`: gera o AAB (`app-bundle`) apontando para a API de
  produção.
- `eas submit` (perfil `production`) envia direto para a faixa **produção**: a versão vai
  para a revisão da Google e, aprovada, é liberada para todos. O perfil `internal` envia ao
  **teste interno** como rascunho, para testar antes.
- Chave de assinatura (keystore) gerada e guardada pelo EAS desde a primeira build.
- Permissões só do que o app usa: câmera, localização, biometria, notificações e vibração.
  - Microfone, armazenamento e mídia estão bloqueados. Assim a revisão não pede a declaração
    da política de fotos e vídeos.
  - A galeria usa o seletor de fotos do sistema, que não precisa de permissão.
- Backup automático do Android desligado: tokens e registros offline não vão para a nuvem.

## Passo a passo

### 1. Criar o app no Play Console

1. Abra o Play Console da conta da empresa e clique em **Criar app**.
2. Preencha:
   - **Nome:** Excellence: Ponto e Rondas
   - **Idioma padrão:** Português (Brasil)
   - **Tipo:** App
   - **Gratuito**
3. Aceite as declarações.

### 2. Conta de serviço para o EAS enviar versões (uma vez)

1. No [Google Cloud Console](https://console.cloud.google.com/), crie (ou escolha) um projeto
   e ative a **Google Play Android Developer API**.
2. Em **IAM e administrador › Contas de serviço**, crie uma conta de serviço (sem papel) e,
   na aba **Chaves**, crie uma chave **JSON**.
3. Salve o arquivo como `apps/mobile/google-play-service-account.json`. Ele está no
   `.gitignore`: **não commite**.
4. No Play Console, abra **Usuários e permissões › Convidar novos usuários**, informe o e-mail
   da conta de serviço (`…@….iam.gserviceaccount.com`) e, em **Permissões do app**, adicione o
   Excellence com permissão para lançar versões em teste e em produção.

Sem o passo 4, o `eas submit` responde "permissão negada".

### 3. Gerar o AAB

Na pasta `apps/mobile`:

```powershell
npx eas-cli@latest build --platform android --profile production
```

### 4. Enviar o primeiro AAB à mão

A Google não aceita o primeiro envio de um app novo pela API. Ele é feito uma vez, à mão:

1. Baixe o `.aab` na página da build no expo.dev.
2. No Console, abra **Testar e lançar › Teste interno › Criar nova versão** e envie o arquivo.
3. Adicione os testadores pelo e-mail da conta Google de cada um.

### 5. Próximas versões pelo EAS

```powershell
npx eas-cli@latest build --platform android --profile production
npx eas-cli@latest submit --platform android --profile production --latest
```

A versão vai direto para a produção (revisão da Google e, aprovada, liberada para todos).
Para testar antes no teste interno, envie com `--profile internal` e promova no Console.

### 6. Conteúdo do app (obrigatório antes de produção)

Em **Política › Conteúdo do app**:

| Item                     | Resposta                                                                                                                                                                                                                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Política de privacidade  | `https://gestaoexcellence.com.br/privacidade` (preencha antes os campos destacados; ver `politica-de-privacidade.md`)                                                                                                                                                                             |
| Anúncios                 | Não contém anúncios                                                                                                                                                                                                                                                                               |
| Acesso ao app            | Todo ou parte do app é restrito. Informe a conta de teste e uma instrução: "Entre com o e-mail e a senha abaixo. O app é para funcionários de empresas clientes; a conta tem escala e rota de ronda de exemplo". Antes, configure escala e rota de ronda para o funcionário de teste em produção. |
| Classificação etária     | Questionário IARC: ferramenta de trabalho, sem violência, sem conteúdo gerado público. Resultado esperado: Livre.                                                                                                                                                                                 |
| Público-alvo             | 18 anos ou mais. Não é voltado a crianças.                                                                                                                                                                                                                                                        |
| App de notícias          | Não                                                                                                                                                                                                                                                                                               |
| Segurança dos dados      | ver `seguranca-dos-dados.md`                                                                                                                                                                                                                                                                      |
| App governamental        | Não                                                                                                                                                                                                                                                                                               |
| Recursos financeiros     | Nenhum                                                                                                                                                                                                                                                                                            |
| Saúde                    | Nenhum                                                                                                                                                                                                                                                                                            |
| Permissão de localização | Só em primeiro plano. O formulário de localização em segundo plano não se aplica.                                                                                                                                                                                                                 |

### 7. Ficha da loja

Preencha com os textos de `ficha-da-loja.md`. Imagens obrigatórias:

- ícone de 512×512 (pode usar `apps/web/public/icon-512.png`);
- imagem de destaque de 1024×500;
- pelo menos 2 capturas de tela de celular (tire do app no aparelho, em produção).

## Pontos de atenção

- **Primeira revisão:** app novo costuma levar de alguns dias a uma semana na primeira
  revisão. As seguintes são mais rápidas.
- **Nome do desenvolvedor:** na loja, o Excellence aparece com o nome de desenvolvedor da conta
  da empresa.
- **Push:** a chave da Play serve só para publicar, não para entregar notificações. O push
  precisa de um projeto no Firebase e da chave de conta de serviço do FCM v1, enviada com:

  ```powershell
  npx eas-cli@latest credentials --platform android
  ```

  Escolha "Google Service Account Key for Push Notifications (FCM V1)". Sem essa chave, o app
  funciona, mas não recebe notificações.

- **HTTPS:** a API de produção é `https://gestaoexcellence.com.br/api/v1`. No formulário
  "Segurança dos dados", responda que os dados são **criptografados em trânsito**.
