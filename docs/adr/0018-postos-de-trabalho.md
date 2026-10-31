# 0018 — Postos de trabalho

- **Status:** aceito (parte implementada; ver "Pendente")
- **Data:** 2026-09-26

## Contexto

O endereço da empresa é uma coisa; o local onde cada funcionário trabalha é outra. Numa empresa
de vigilância, a maior parte das pessoas fica alocada em postos (clientes, sedes, portarias), e
o posto é o "guarda-chuva" que reúne todos os funcionários.

O cadastro de **unidades** já tinha tudo o que um posto precisa:

- todo funcionário pertence a uma unidade;
- a unidade tem endereço, cerca virtual do ponto e fuso;
- as rondas, os feriados por local e o escopo dos perfis são por unidade.

No seed de exemplo, a "Matriz" usava o endereço da empresa, o que misturava os dois conceitos.

## Decisão

- A **unidade passa a se chamar posto de trabalho** no produto: menu, telas, mensagens da API,
  descrições de permissão e exportação da folha. O menu leva o item para o topo de "Pessoas e
  ponto".
- No código e no banco o nome continua `unit` / `units`, e as permissões seguem `units:read` e
  `units:manage`. Renomear tabelas, rotas da API e permissões mexeria em quase todos os módulos
  e nos perfis gravados, sem ganho para quem usa. Este ADR registra a equivalência.
- As telas passaram de `/cadastros/unidades` para `/cadastros/postos`. O endereço antigo
  redireciona.
- A coluna `unidade` da planilha de importação continua aceita, para não quebrar planilhas
  existentes.
- O endereço da empresa fica no cadastro da Empresa, separado dos postos.

## Pendente

Estes itens precisam de migration e estão aguardando espaço em disco no ambiente de
desenvolvimento:

- Endereço da empresa (sede) no cadastro da Empresa.
- Contratante (cliente) e contato no posto de trabalho.
- Histórico de alocação: transferência entre postos com data de início, mantendo o posto atual
  no cadastro do funcionário.
- Seed com o endereço da sede na Empresa e postos de exemplo separados.

## Consequências

- Quem usa o sistema passa a ver "Posto de trabalho" onde antes via "Unidade".
- Os documentos antigos (ADRs 0007 a 0017) continuam falando em "unidade". Leia como "posto de
  trabalho".
