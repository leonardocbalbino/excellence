# Publicar o app na Google Play

O app sai pela **mesma conta de desenvolvedor da Google Play do Cartão Colaborativa**. A conta
de serviço que o Cartão já usa para enviar versões pelo EAS serve também para o Excellence:
falta só dar a ela acesso ao app novo.

Nesta pasta:

- [`ficha-da-loja.md`](ficha-da-loja.md): nome, descrições, categoria e imagens da página do
  app na loja.
- [`seguranca-dos-dados.md`](seguranca-dos-dados.md): respostas do formulário "Segurança dos
  dados".
- [`politica-de-privacidade.md`](politica-de-privacidade.md): a política fica no site em
  `/privacidade`, sem login. Os campos destacados dependem do jurídico.

## O que já está pronto no app

- Pacote `br.com.excellence.app`, versão `1.0.0`. O `versionCode` é controlado pelo EAS e
  sobe sozinho a cada build de produção.
- Perfil `production` no `eas.json`: gera o AAB (`app-bundle`) apontando para a API de
  produção.
- `eas submit` configurado para a faixa **teste interno**, como **rascunho**. Nenhuma versão
  vai ao público sem você promover no Console.
- Chave de assinatura (keystore) gerada e guardada pelo EAS desde a primeira build.
- Permissões só do que o app usa: câmera, localização, biometria, notificações e vibração.
  - Microfone, armazenamento e mídia estão bloqueados. Assim a revisão não pede a declaração
    da política de fotos e vídeos.
  - A galeria usa o seletor de fotos do sistema, que não precisa de permissão.
- Backup automático do Android desligado: tokens e registros offline não vão para a nuvem.

## Passo a passo

### 1. Chave da conta de serviço (uma vez)

Copie a chave do Cartão Colaborativa para o app. O arquivo está no `.gitignore`: **não
commite**.

```powershell
Copy-Item "C:\Users\leona\Projetos\cartao-colaborativa-monorepo\colaborativa-monorepo\apps\mobile\cartao-colaborativa-play-65b4114437a5.json" `
  "C:\Users\leona\Projetos\excellence\apps\mobile\google-play-service-account.json"
```

### 2. Criar o app no Play Console

1. Abra o Play Console da conta do Cartão Colaborativa e clique em **Criar app**.
2. Preencha:
   - **Nome:** Excellence
   - **Idioma padrão:** Português (Brasil)
   - **Tipo:** App
   - **Gratuito**
3. Aceite as declarações.

### 3. Dar acesso à conta de serviço

1. Abra **Usuários e permissões**.
2. Escolha a conta de serviço que o Cartão já usa (o e-mail `…@…iam.gserviceaccount.com`).
3. Em **Permissões do app**, adicione o Excellence com permissão para gerenciar versões de
   teste e de produção.

Sem isso, o `eas submit` responde "permissão negada".

### 4. Gerar o AAB

Na pasta `apps/mobile`:

```powershell
npx eas-cli@latest build --platform android --profile production
```

### 5. Enviar o primeiro AAB à mão

A Google não aceita o primeiro envio de um app novo pela API. Ele é feito uma vez, à mão:

1. Baixe o `.aab` na página da build no expo.dev.
2. No Console, abra **Testar e lançar › Teste interno › Criar nova versão** e envie o arquivo.
3. Adicione os testadores pelo e-mail da conta Google de cada um.

### 6. Próximas versões pelo EAS

```powershell
npx eas-cli@latest build --platform android --profile production
npx eas-cli@latest submit --platform android --profile production --latest
```

A versão chega ao teste interno como rascunho. Para publicar, abra a versão no Console e
promova para teste fechado ou para produção.

### 7. Conteúdo do app (obrigatório antes de produção)

Em **Política › Conteúdo do app**:

| Item                     | Resposta                                                                                                                                                                                                                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Política de privacidade  | `http://169.58.37.26:8200/privacidade` (preencha antes os campos destacados; ver `politica-de-privacidade.md`)                                                                                                                                                                                    |
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

### 8. Ficha da loja

Preencha com os textos de `ficha-da-loja.md`. Imagens obrigatórias:

- ícone de 512×512 (pode usar `apps/web/public/icon-512.png`);
- imagem de destaque de 1024×500;
- pelo menos 2 capturas de tela de celular (tire do app no aparelho, em produção).

## Pontos de atenção

- **Teste fechado antes da produção:** contas pessoais de desenvolvedor criadas depois de
  novembro de 2023 precisam de um teste fechado com 12 testadores por 14 dias antes de
  liberar a produção. Se a conta do Cartão Colaborativa for de **organização**, essa regra não
  vale. Confira em **Configurações › Detalhes da conta**.
- **Nome do desenvolvedor:** na loja, o Excellence aparece com o nome de desenvolvedor da conta
  do Cartão Colaborativa.
- **Push:** a chave da Play serve só para publicar, não para entregar notificações. O push
  precisa de um projeto no Firebase e da chave de conta de serviço do FCM v1, enviada com:

  ```powershell
  npx eas-cli@latest credentials --platform android
  ```

  Escolha "Google Service Account Key for Push Notifications (FCM V1)". Sem essa chave, o app
  funciona, mas não recebe notificações.

- **HTTPS (P-029):** a API ainda é HTTP. A Play aceita, mas o formulário "Segurança dos dados"
  pergunta se os dados são criptografados em trânsito, e hoje a resposta é **não**. Com o
  domínio e o certificado, troque a resposta e o endereço da API (`app.config.ts` e
  `eas.json`).
