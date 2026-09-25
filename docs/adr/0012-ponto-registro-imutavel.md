# 0012 — Ponto: registro imutável, encadeamento, NSR, idempotência e ajustes

- **Status:** aceito
- **Data:** 2026-09-25

## Contexto

A marcação de ponto é prova em processo trabalhista. Ela não pode ser alterada nem apagada,
precisa ter hora confiável e deve permitir detectar adulteração feita direto no banco. O
funcionário marca pelo celular, muitas vezes com rede instável, e o aplicativo reenvia a
requisição quando não recebe resposta. Erros (marcação esquecida ou duplicada) são corrigidos
por pedido de ajuste aprovado pelo gestor. A Portaria MTP 671/2021 regula o REP-P, o
comprovante e os arquivos AFD/AEJ; esses pontos formais ficam para a etapa 1C.1.

## Decisão

**Registro append-only**

- `time_entries` recebe só `INSERT`: um trigger (`forbid_mutation`) recusa `UPDATE`, `DELETE` e
  `TRUNCATE`, como em `audit_logs`.
- Três tipos de registro: `clock` (marcação do funcionário), `inclusion` (marcação incluída por
  ajuste aprovado) e `disregard` (anula uma marcação anterior, que continua no banco). Um
  índice único impede desconsiderar a mesma marcação duas vezes, e um CHECK exige a referência
  à marcação original no `disregard`.

**Hora oficial**

- A hora oficial é `clock_timestamp()` do Postgres dentro da transação de gravação (UTC,
  `timestamptz`). A hora do aparelho é guardada à parte, só para auditoria.
- A exibição usa o fuso da unidade do funcionário (ou da empresa).

**NSR e encadeamento**

- O NSR é sequencial por empresa (`nsr_counters`, `INSERT … ON CONFLICT … RETURNING`, que
  serializa por linha).
- Cada registro guarda `hash = sha256(hash anterior do mesmo funcionário + conteúdo canônico)`.
  A gravação obtém `pg_advisory_xact_lock` pelo funcionário, lê o último hash e grava na mesma
  transação, então duas marcações simultâneas não formam uma bifurcação.
- `GET /employees/:id/time-entries-verification` recalcula a cadeia e aponta o primeiro
  registro divergente. Não substitui a assinatura ICP-Brasil do AFD (1C.1).

**Idempotência**

- `POST /me/time-entries` aceita `Idempotency-Key` (8 a 200 caracteres). A chave é reservada
  antes de executar; a repetição devolve a mesma resposta; a mesma chave com outro corpo dá
  422, e com a primeira ainda em processamento dá 409.
- O web gera uma chave por tentativa de marcação e a reaproveita nos reenvios.
- As chaves não expiram por enquanto (pendência P-016).

**Localização e foto**

- A distância até a unidade é calculada por haversine e o resultado (`inside`, `outside`,
  `unknown`) fica no registro.
- `clock_settings` define por empresa se a marcação fora da cerca é aceita e sinalizada
  (padrão) ou recusada, e se localização e selfie são obrigatórias (pendência P-008). A selfie
  usa o fluxo de arquivos do ADR 0008.

**Espelho**

- O espelho junta o previsto (escala do ADR 0011) e as marcações efetivas (sem as
  desconsideradas). Marcações feitas até `overnightGraceMinutes` depois do fim de um turno
  que termina no dia seguinte contam para o dia em que o turno começou.
- O trabalhado soma pares entrada/saída. Um número ímpar de marcações sinaliza "falta
  marcação". Horas extras, adicional noturno e tolerâncias ficam para o motor de cálculo
  (1B.4).

**Ajustes**

- O funcionário (ou quem tem `time_entries:manage`) pede a inclusão de um horário ou que uma
  marcação seja desconsiderada, sempre com motivo.
- Quem tem `time_adjustments:approve`, dentro do seu escopo, aprova ou recusa (a recusa exige
  observação). Ninguém aprova o próprio pedido. A aprovação grava o registro de ajuste na mesma
  transação e gera auditoria.

## Consequências

- Nenhuma correção apaga o histórico, e a cadeia permite provar a integridade dos registros por
  funcionário.
- A gravação por funcionário é serializada; como cada um marca poucas vezes por dia, isso não
  limita a vazão.
- O registro como REP-P, o formato legal do comprovante e o AFD/AEJ assinados continuam
  pendentes (P-015, etapa 1C.1).
- Os testes de integração desta etapa não foram escritos nem executados, por falta de memória
  na máquina de desenvolvimento. Ficam para quando o ambiente permitir.
