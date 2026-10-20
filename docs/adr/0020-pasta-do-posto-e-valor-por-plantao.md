# 0020 — Pasta do posto, valor por plantão e atestados anexados pela administração

- **Status:** aceito
- **Data:** 2026-10-17

## Contexto

A empresa trabalha por condomínio (posto de trabalho, ADR 0018). Quem administra precisa achar
tudo de um condomínio num lugar só: funcionários, escalas e turnos, o valor pago por tipo de
escala e um resumo do mês. O pagamento é por plantão, com valor próprio de cada condomínio e
reajustes que passam a valer na virada do mês.

Os atestados chegavam pelo app do funcionário. A operação decidiu que o funcionário entrega o
documento à administração, e a administração anexa ao sistema.

## Decisão

**Pasta do posto** (`/cadastros/postos/:id`)

- Abas: Funcionários, Escalas e turnos, Valores por plantão, Resumo mensal e Dados do posto. A
  aba fica no endereço (`?aba=resumo`). Cada aba aparece só com a permissão do módulo; valores e
  resumo exigem `payroll:manage`.
- A partir da pasta, "Novo funcionário", "Nova escala" e "Anexar atestado" já chegam com o posto
  e voltam para a pasta.
- "Adicionar já cadastrado" busca um funcionário ativo de outro posto e o traz para este
  (`PUT /employees/:id/unit`, `employees:manage`). O departamento do posto antigo sai do
  cadastro; o departamento geral fica. Quem está, ou vai entrar, numa escala do posto antigo
  precisa trocar de escala antes (422 com o nome da escala).

**Escalas e turnos do posto**

- `shifts.unit_id` e `work_schedules.unit_id`: o posto dono. Nulo = cadastro geral da empresa
  (os que já existiam continuam gerais).
- Nome único por posto e entre os gerais (índices com `NULLS NOT DISTINCT`, mantidos em SQL).
- Escala de posto usa turnos gerais ou do mesmo posto; escala geral, só turnos gerais.
- Funcionário só entra em escala geral ou do posto dele. Passar uma escala para um posto exige
  que ninguém de outro posto esteja nela.

**Valor por plantão** (`schedule_rates`)

- Valor em centavos por posto e escala, válido a partir de um mês (`valid_from`, AAAA-MM), até
  o mês anterior ao próximo valor. Cadastrar "a partir de novembro" é o reajuste: entra sozinho
  na virada, e os meses anteriores continuam com o valor antigo.
- Não se cadastra nem se exclui valor que começa num mês já fechado na folha.
- **Plantão trabalhado**: dia com turno previsto na escala e ao menos uma marcação (feriado
  trabalhado conta). O valor é plantões × valor vigente no mês, no posto atual do funcionário.
- Dia de turno coberto por atestado aceito aparece à parte ("com atestado"), sem valor; marcação
  em dia de folga não vira plantão. Ver pendência P-027.
- O fechamento mensal (ADR 0017) ganhou `shiftPay` em cada item, e o CSV da contabilidade as
  colunas de plantões. Itens gerados antes leem `shiftPay` vazio.

**Virada do mês**

- `PayrollAutoGenerator` confere de hora em hora e, a partir do dia 1 no fuso de cada empresa,
  gera o fechamento do mês que acabou como rascunho, se ele ainda não existir. O que o RH já
  gerou, publicou ou fechou não é tocado.
- Geração automática grava `generated_by` nulo e auditoria sem ator; a tela da folha indica
  "Gerado sozinho na virada do mês". `PAYROLL_AUTO_GENERATE=false` desliga; nos testes fica
  desligado.

**Resumo mensal do posto** (`GET /units/:id/monthly-summary?month=`)

- Calculado na hora, com o mesmo consolidado do fechamento, filtrado pelo posto: plantões e
  valores, faltas, dias com atestado, marcações incompletas, ajustes pendentes, mais os
  atestados e as trocas de escala do mês. Indica se o fechamento do mês já existe.

**Atestados** (muda o ADR 0013)

- Saem `POST /me/medical-certificates` e `POST /me/medical-certificates/:id/cancel`. O
  funcionário só consulta a lista e abre o documento.
- Quem tem `medical_certificates:manage` anexa pelo funcionário (`POST
/employees/:id/medical-certificates`). O atestado já entra como **válido**, com quem anexou
  como responsável pela análise. Se for o próprio atestado de quem anexa, fica pendente para
  outra pessoa analisar.
- Um atestado válido ainda pode ser marcado como inválido, com motivo.

## Consequências

- Postos com escalas e valores próprios não se misturam, e o reajuste não depende de alguém
  lembrar de trocar o valor no dia certo.
- O vínculo do funcionário ao posto não tem histórico (ADR 0018, pendente): quem muda de posto no
  meio do mês tem o mês todo valorado pelo posto atual.
- O resumo percorre o espelho de cada funcionário do posto, como o fechamento.
- Os testes de integração desta etapa foram escritos, mas não executados: o Docker não estava
  disponível na máquina de desenvolvimento.

## Alternativas consideradas

- **Escalas da empresa com valor por posto**: menos cadastro, mas o pedido foi de escalas
  próprias de cada condomínio. A tabela de valores aceita escala geral, então as duas formas
  convivem.
- **Valor mensal fixo ou por hora**: descartados pela operação; o pagamento é por plantão.
