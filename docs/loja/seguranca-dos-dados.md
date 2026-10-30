# Segurança dos dados (formulário da Google Play)

Respostas a partir do que o app realmente envia ao servidor (ADR 0019, 0022 e 0023). "Coleta"
na Play significa dado que sai do aparelho. O que o app só **mostra**, como valores de
benefícios e espelho de ponto, não entra no formulário.

## Perguntas gerais

| Pergunta                                       | Resposta                                                                                                                                                |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| O app coleta ou compartilha dados do usuário?  | Sim                                                                                                                                                     |
| Todos os dados são criptografados em trânsito? | **Não** enquanto a API estiver em HTTP (P-029). Mude para **Sim** quando o domínio com HTTPS estiver no ar.                                             |
| O usuário pode pedir a exclusão dos dados?     | Sim, pelo RH da empresa. Informe um link ou um e-mail para o pedido.                                                                                    |
| Os dados são compartilhados com terceiros?     | Não. Os dados vão só para o servidor do sistema, contratado pela empresa empregadora. Os provedores de infraestrutura não contam como compartilhamento. |

## Tipos de dados

| Tipo na Play                          | Coletado | Compartilhado | Obrigatório                                | Finalidade                                    | O que é                                                                   |
| ------------------------------------- | -------- | ------------- | ------------------------------------------ | --------------------------------------------- | ------------------------------------------------------------------------- |
| Localização › Local exato             | Sim      | Não           | Opcional (obrigatório se a empresa exigir) | Funcionalidade do app                         | posição no registro do ponto e no check-in da ronda (cerca do posto)      |
| Informações pessoais › Nome           | Sim      | Não           | Obrigatório                                | Funcionalidade do app, gerenciamento da conta | cadastro do funcionário                                                   |
| Informações pessoais › E-mail         | Sim      | Não           | Obrigatório                                | Gerenciamento da conta                        | login                                                                     |
| Informações pessoais › IDs do usuário | Sim      | Não           | Obrigatório                                | Funcionalidade do app                         | matrícula e CPF do cadastro                                               |
| Fotos e vídeos › Fotos                | Sim      | Não           | Opcional                                   | Funcionalidade do app                         | selfie do ponto (se a empresa exigir), foto de perfil, fotos dos chamados |
| Mensagens › Outras mensagens no app   | Sim      | Não           | Opcional                                   | Funcionalidade do app                         | mensagens dos chamados com o RH                                           |
| IDs do dispositivo ou outros IDs      | Sim      | Não           | Opcional                                   | Funcionalidade do app                         | token de notificação (push)                                               |

**Não coletados:** dados financeiros, saúde, contatos, agenda, áudio, arquivos e documentos,
histórico de navegação, atividade no app para análise, anúncios.

**Biometria:** a digital e o rosto são verificados pelo próprio sistema do celular e nunca
saem do aparelho. Não entram no formulário.

## Observações

- O registro de ponto guarda data, hora, localização e, se houver, a foto. Isso faz parte da
  obrigação legal do empregador (Portaria MTP 671/2021).
- Não há SDK de análise, anúncios ou rastreamento no app.
