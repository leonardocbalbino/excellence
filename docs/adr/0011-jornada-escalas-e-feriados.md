# 0011 — Jornada: turnos, escalas em ciclo, feriados e vínculo com histórico

- **Status:** aceito
- **Data:** 2026-09-25

## Contexto

O ponto (1A.3) e o motor de cálculo (1B.4) precisam saber o que era esperado de cada
funcionário em cada dia. As escalas variam (5x2, 6x1 com folga fixa ou rotativa, 12x36,
flexível), mudam ao longo do tempo e convivem com feriados de abrangências diferentes. As
regras legais (intervalos mínimos, jornada máxima, compensação de feriado na 12x36, DSR)
dependem de lei e convenção coletiva.

## Decisão

**Turnos**

- Início e fim em minutos do dia (0 a 1439). Um fim menor ou igual ao início termina no dia
  seguinte.
- O intervalo é informado em minutos, e o trabalho previsto é a duração menos o intervalo.
- A validação é só estrutural (fim diferente do início, intervalo menor que a duração). Limites
  legais não são checados aqui (pendência P-012).

**Escalas**

- **Ciclo:** uma lista de dias, cada um com um turno ou folga, que se repete. A âncora define
  onde o ciclo começa:
  - `monday`: o dia 1 é a segunda-feira. Serve para 5x2 e 6x1 com folga em dia fixo, e o ciclo
    deve ter semanas completas;
  - `assignment`: o dia 1 é uma data definida para cada funcionário. Serve para 12x36 e folgas
    rotativas, e permite alternar equipes.
- **Flexível:** sem horários, só a carga semanal de referência.
- Uma escala com vínculos, mesmo encerrados, não é excluída, só inativada, porque o histórico é
  usado no ponto.

**Feriados**

- Cadastrados pela empresa com abrangência nacional, estadual (UF), municipal (UF e município),
  da empresa ou de uma unidade. Um CHECK no banco garante a coerência dos campos.
- Estadual e municipal se aplicam pela UF e pelo município da unidade do funcionário. Unidade
  sem endereço não recebe esses feriados.
- A tela oferece a **sugestão** dos feriados nacionais de data fixa, cada um com a lei de origem,
  para o RH conferir e escolher. Religiosos municipais e pontos facultativos são cadastrados pela
  empresa (pendência P-011).

**Vínculo funcionário-escala**

- O histórico fica em `employee_schedule_assignments`. Um novo vínculo encerra o vigente na
  véspera. Não é possível criar vínculo antes de um que já existe, nem antes da admissão.
- O banco impede períodos sobrepostos com `EXCLUDE USING gist` (`btree_gist`).
- Só um vínculo que ainda não começou pode ser removido, e isso reabre o anterior. Vínculos já
  em vigor são histórico.

**Escala prevista**

- A função pura `planDays` diz, para cada dia, se há escala, qual é o turno, a carga flexível e o
  feriado aplicável.
- Ela **não** interpreta nada em horas: se o feriado em dia de trabalho é folga, compensação ou
  hora extra, e como fica o DSR, é decisão do motor de cálculo com parâmetros (P-012 a P-014).
- Acesso:
  - `GET /employees/:id/planned-schedule` exige `employees:read` e segue o escopo;
  - `GET /me/planned-schedule` mostra a escala do próprio usuário;
  - vincular e desvincular exigem `schedules:assign`, também com escopo.

## Consequências

- O ponto pode comparar marcações com o turno previsto no fuso da unidade. As datas são de
  calendário (DATE), e os horários do turno são interpretados no fuso da unidade.
- O motor de cálculo recebe um previsto neutro e aplica as regras parametrizadas.
- Os testes de integração desta etapa foram escritos, mas **não executados**: a máquina de
  desenvolvimento ficou sem memória. Por decisão do usuário, o desenvolvimento seguiu sem
  testes. Rodar `pnpm test:integration` quando houver memória disponível.

## Alternativas consideradas

- **Escala por dia da semana (sem ciclo)**: não representa 12x36 nem folga rotativa.
- **Gerar e gravar a escala dia a dia (materializar)**: facilita consultas, mas precisa ser
  refeita a cada mudança. O cálculo sob demanda por ciclo é simples e barato para períodos de
  até 62 dias.
