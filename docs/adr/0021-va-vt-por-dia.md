# 0021 — VA e VT calculados por dia, com ajuste antes do fechamento

- **Status:** aceito
- **Data:** 2026-10-21

## Contexto

O RH pediu uma tela única para o vale-alimentação (VA) e o vale-transporte (VT), com os campos
de cada um separados:

- quantidade de dias;
- valor-base diário;
- valor total do benefício.

O sistema deve calcular os valores pelo ponto e pelas regras de cada benefício. A tela mostra o
total geral VA + VT por colaborador e um resumo mensal da empresa. O RH precisa ajustar os
valores nas exceções antes de fechar o mês.

Até aqui, todo benefício tinha valor fixo por mês, informado na atribuição (ADR 0017, P-023).

## Decisão

**Regra no catálogo** (`benefits.calculation`)

- `monthly`: valor fixo por mês (como antes; é o padrão).
- `per_worked_day`: dias com marcação no ponto × valor diário.
- `per_worked_or_justified_day`: idem, contando também os dias de turno cobertos por atestado
  aceito.
- Só VA (`food`) e VT (`transport`) podem ser por dia. O banco garante com uma restrição.
- O catálogo tem um valor diário sugerido (`default_daily_value_cents`).

**Valor diário por funcionário** (`employee_benefits.daily_value_cents`)

- Na atribuição de um benefício por dia, o RH informa o valor diário. O VT varia com o trajeto
  de cada um. Vazio: usa o sugerido do catálogo.
- O valor mensal fixo fica zerado: o valor do mês sai do ponto.
- Quando um benefício passa a ser por dia, quem já o tinha recebe o valor diário sugerido.

**Cálculo** (`summarizeDailyBenefits`)

- Conta os dias entre a admissão (ou o 1º dia do mês) e a data de corte do fechamento (ADR
  0017), dentro da vigência de cada atribuição.
- Marcação em folga ou feriado conta: a pessoa foi trabalhar.
- Com dois benefícios do mesmo tipo no mesmo dia (ex.: ônibus + metrô), os valores somam. O
  dia conta uma vez.
- O valor-base diário mostrado é o total dividido pelos dias.

**Exceções** (`benefit_day_adjustments`)

- Um ajuste por funcionário, mês e tipo. Troca os dias e/ou o valor diário. O que ficar vazio
  segue o cálculo. O total passa a ser dias × valor diário.
- O motivo é obrigatório. O sistema guarda o calculado ao lado, e a mudança fica na auditoria.
- Com o mês fechado na folha, a API e um trigger no banco recusam incluir, mudar ou excluir
  ajustes.

**Fechamento** (ADR 0017)

- Cada linha do fechamento guarda o VA e o VT do mês (`dailyBenefits`), já com os ajustes.
- O VA e o VT também entram na lista de benefícios com o valor do mês, e por isso no total da
  empresa. Assim, a prévia do funcionário e as telas existentes não precisam mudar.
- O CSV para a contabilidade ganha, no fim, as colunas de dias, valor diário e total de VA e
  VT, e a soma VA + VT.
- Ajustar depois de gerar o fechamento exige "Recalcular" na Folha. A tela de VA/VT avisa.

**Tela** (Remuneração › VA/VT, `payroll:manage`, `GET /benefit-days?month=`)

- Uma linha por colaborador com VA ou VT no mês. Para cada um: dias, valor diário e total. Depois
  vem o total VA + VT.
- No fim, o resumo mensal da empresa e de cada posto.
- Mês aberto: calculado na hora. Mês fechado: os valores congelados no fechamento, sem ajuste.

## Consequências

- O RH confere e corrige o VA/VT do mês numa tela só. O valor que vai para a contabilidade é
  o mesmo que aparece na tela.
- A tela percorre o espelho de cada funcionário, como o fechamento. Em empresas grandes, leva
  alguns segundos.
- Desconto legal do VT (6%), antecipação pelos dias previstos e o efeito de férias continuam
  fora do sistema (P-023, P-028). O desconto informado na atribuição segue como valor mensal.
- Só aparece quem tem VA ou VT por dia atribuído no mês. Para pagar uma exceção a quem não tem,
  atribua o benefício.

## Alternativas consideradas

- Tela e cadastro próprios de VA/VT, fora do catálogo de benefícios: duplicaria vigência,
  valores e a prévia do funcionário, que o catálogo já tem.
- Ajustar o valor total direto: perderia a relação dias × valor diário pedida para a
  conferência. Para um valor fora do padrão, ajuste o valor diário.
