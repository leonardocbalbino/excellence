# 0017 — Benefícios, links úteis, salário do cargo e fechamento mensal

- **Status:** aceito
- **Data:** 2026-09-26

## Contexto

A folha de pagamento é calculada por um escritório de contabilidade externo. O RH precisa:

- consolidar o mês de cada funcionário (ponto, faltas, atestados, salário e benefícios);
- mandar esse consolidado para a contabilidade;
- deixar o funcionário conferir antes (prévia).

O RH também administra os benefícios. Os funcionários precisam ver os próprios benefícios e
links úteis da empresa.

## Decisão

**Salário do cargo**

- O cargo tem salário base (`positions.base_salary_cents`, em centavos). A API troca valores em
  reais com até 2 casas (`moneySchema`).
- Só quem tem `payroll:manage` vê e altera o salário. Para os demais, a API devolve `null` e
  ignora o valor enviado, mantendo o atual. Gestores têm `positions:read` e não devem ver a
  tabela salarial.
- Não há salário individual: o funcionário usa o do cargo (P-024).

**Benefícios (`benefits:manage`)**

- Catálogo com tipo, fornecedor, descrição, "como usar" e valores sugeridos.
- A atribuição ao funcionário tem:
  - valor pago pela empresa e desconto do funcionário (por mês);
  - vigência (início e fim opcional);
  - observação.
- O mesmo benefício não pode valer em dois períodos que se sobrepõem. O banco garante isso com
  uma restrição de exclusão (`EXCLUDE USING gist`).
- A atribuição segue o escopo da permissão. O catálogo exige escopo da empresa.
- O funcionário vê os benefícios vigentes em "Benefícios e links" (`GET /me/benefits`).
- Regras legais, como o desconto de 6% do vale-transporte e a proporcionalidade por dias, não
  são calculadas. O valor informado é o que vai para a contabilidade (P-023).

**Links úteis (`useful_links:manage`)**

- Título, endereço (só `http(s)`), grupo, descrição e ordem.
- Todos os usuários veem os ativos em `GET /me/useful-links`.

**Fechamento mensal (`payroll:manage`, permissão sensível)**

- `POST /payroll-periods { month }` gera o mês para os funcionários ativos em algum dia dele.
  Cada linha (`payroll_items.data`) guarda:
  - cadastro, cargo e salário base;
  - horas previstas e trabalhadas e o saldo;
  - faltas (dias com turno, sem marcação e sem atestado aceito);
  - dias com atestado, dias com marcação incompleta e ajustes pendentes;
  - benefícios vigentes no mês com os totais.
- O ponto é contado até a data de corte: o último dia do mês, ou ontem se o mês não acabou. Só
  entram dias entre a admissão e o desligamento.
- Os números vêm do espelho de ponto (ADR 0012), sem regra legal. Horas extras, adicionais,
  DSR, impostos e encargos são calculados pela contabilidade.
- Situações:
  - **rascunho**: só o RH vê; pode ser recalculado;
  - **prévia publicada**: cada funcionário vê a própria linha em "Folha"
    (`GET /me/payroll-previews`); ainda pode ser recalculado;
  - **fechado**: definitivo. Triggers recusam mudanças no período e nos itens, até por fora
    da API.
- `GET /payroll-periods/:id/export` gera o CSV para a contabilidade:
  - separador `;`, decimais com vírgula, horas em `HH:MM` e BOM (para o Excel);
  - células que começariam uma fórmula são protegidas contra injeção de CSV.
- Gerar, publicar, fechar e exportar ficam na auditoria.

**Atestados**

- Na análise, o RH vê o documento na própria tela: PDF num quadro e imagens direto. Também
  pode baixar.
- O link de visualização usa `Content-Disposition: inline` e só é gerado para tipos que o
  navegador abre (PDF, JPEG, PNG, WebP). HEIC só baixando.
- A leitura continua auditada como dado sensível.
- "Aceitar/Recusar" virou "Válido/Inválido" na tela. A API não mudou (`accepted`/`rejected`).

**Área pessoal**

- "Meu ponto" saiu do menu. O espelho virou "Visualizar espelho de ponto", dentro de "Registrar
  ponto" (`/ponto/espelho`). O endereço antigo redireciona.
- Entram no menu "Folha" (prévia) e "Benefícios" (benefícios e links úteis).

## Consequências

- A contabilidade recebe um arquivo único por mês, com o que o sistema sabe, sem retrabalho de
  digitação.
- O funcionário confere faltas e horas antes do fechamento e pede ajuste pelo espelho.
- O fechamento percorre o espelho de cada funcionário: em empresas grandes, gerar o mês leva
  alguns segundos.
- O holerite oficial continua vindo da contabilidade. Publicar o PDF do holerite no sistema
  fica para uma próxima etapa.

## Alternativas consideradas

- Calcular a folha no sistema: exige regras legais e de convenção ainda em aberto (P-017), e a
  contabilidade já faz isso.
- Leiaute de arquivo de um sistema de folha específico: não sabemos qual o escritório usa
  (P-025). O CSV simples serve para qualquer um e pode ganhar leiautes específicos depois.
