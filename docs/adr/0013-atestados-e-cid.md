# 0013 — Atestados: envio, análise e CID como dado sensível

- **Status:** aceito
- **Data:** 2026-09-25

## Contexto

O funcionário precisa entregar atestados e declarações de comparecimento sem ir ao RH, e o RH
precisa analisá-los. O diagnóstico (CID) e o próprio documento, que costuma trazê-lo, são dados
pessoais sensíveis de saúde (LGPD, art. 5º, II): só quem precisa pode ver, e cada acesso deve
ficar registrado (regra 7). O efeito do atestado na folha (abono, DSR, afastamento
previdenciário) depende de lei e de convenção coletiva, e fica para o motor de cálculo (1B.4).

## Decisão

**Modelo**

- `medical_certificates`: funcionário, documento (`files`, finalidade `medical_certificate`,
  um arquivo por atestado), período em dias inteiros ou, num único dia, uma faixa de horário
  (declaração de horas), emissor, registro profissional, CID opcional e observações.
- Situação: `pending` → `accepted` | `rejected` (pelo RH) ou `cancelled` (pelo funcionário,
  enquanto pendente). CHECKs no banco garantem o período, a faixa de horário e que toda
  decisão tem autor.
- Não há sobreposição: um atestado pendente ou aceito bloqueia outro no mesmo período. Duas
  declarações de horas no mesmo dia só conflitam se as faixas se cruzarem.

**Permissões**

- `medical_certificates:read`: período, situação, emissor e se há CID (`hasCid`), sem o valor.
  O perfil Gestor recebe esta permissão para a própria equipe.
- `medical_certificates:read_sensitive` (**sensível**): CID e link temporário do documento, só
  pela rota `GET /medical-certificates/:id/sensitive`. O interceptor de leitura sensível
  (ADR 0008) grava `sensitive_data.read` antes de a resposta sair. O web só busca esses dados
  quando a pessoa pede.
- `medical_certificates:manage`: registrar em nome do funcionário (atestado entregue em
  papel).
- `medical_certificates:review`: aceitar ou recusar (a recusa exige observação). Ninguém
  analisa o próprio atestado. Quem registrou em nome do funcionário pode analisar, porque o
  documento é a prova.
- O perfil RH recebe as quatro permissões. O Administrador pode separar a leitura sensível num
  perfil próprio (ex.: medicina do trabalho).

**Dados sensíveis fora de outros caminhos**

- A trilha de auditoria registra envio, análise e cancelamento sem o CID.
- As listagens selecionam o CID só para calcular `hasCid`, e o valor não sai do serviço.
- O funcionário sempre pode abrir o documento que enviou (`/me/medical-certificates/:id/document`).
- Informar o CID é opcional no formulário (pendência P-018).

**Espelho de ponto**

- Os dias com atestado aceito mostram a justificativa (`justifications`), sem mudar o
  trabalhado nem o previsto. O cálculo fica para a etapa 1B.4 (pendência P-017).

## Consequências

- O CID só aparece para quem tem a permissão sensível, e cada acesso deixa registro.
- O efeito financeiro e o afastamento previdenciário continuam pendentes (P-017), sem regra
  inventada no código.
- Os testes de integração desta etapa não foram escritos nem executados, por falta de memória
  na máquina de desenvolvimento. O teste unitário do período também não foi executado.
