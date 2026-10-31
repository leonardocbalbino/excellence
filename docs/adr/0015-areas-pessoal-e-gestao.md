# 0015 — Área pessoal e área de gestão

- **Status:** aceito
- **Data:** 2026-09-26

## Contexto

O menu único misturava o próprio ponto com as funções de gestão. Isso causava três problemas:

- O Administrador via "Bater ponto", "Meu ponto" e "Meus atestados", mas não é funcionário e
  não registra jornada. O papel dele é ver os dados de todos.
- O gestor que também bate ponto via o próprio ponto e o da equipe na mesma lista.
- As filas de aprovação mostravam os pedidos do próprio aprovador, que ele não pode decidir
  (a API já recusava com `self-approval`).

## Decisão

**Quem tem área pessoal**

- A área pessoal existe para quem está ligado a um cadastro de funcionário
  (`employees.user_id`). `GET /me/access` informa isso em `hasEmployeeRecord`.
- A regra continua sem depender de nome ou chave de perfil (ADR 0007). Um usuário sem cadastro,
  como o Administrador do seed, não tem ponto, escala nem atestados próprios. A API já
  recusava essas ações com `no-employee-record`.
- Comunicados para a empresa toda também chegam a quem não tem cadastro (ADR 0014). Para
  essas pessoas, o mural fica no menu de gestão, em "Comunicados recebidos".

**Duas áreas no web**

- Cada rota declara a sua área (`handle.area`):
  - pessoal: início, registrar ponto, meu ponto, escala, atestados e comunicados;
  - gestão: visão geral (`/gestao`), ponto do dia, funcionários, ajustes, atestados,
    jornada, cadastros e administração.
- Conta e comprovante são comuns às duas áreas e usam a área principal do usuário.
- A área pessoal usa menu no topo. A de gestão usa menu lateral escuro, agrupado por assunto.
- `/` abre a área pessoal de quem tem cadastro. Quem só administra vai para `/gestao`.
- A troca é explícita: "Área de gestão" no topo e "Meu espaço" no menu lateral. Só aparece
  para quem tem as duas áreas.

**Segregação nos dados de gestão**

- As telas de gestão mostram os outros funcionários. O próprio registro de quem consulta fica
  fora de:
  - `GET /time-adjustments`, a fila de aprovação de ajustes;
  - `GET /medical-certificates`, a lista de atestados da gestão;
  - `GET /time-entries/daily`, o novo quadro do dia.
- O próprio registro continua visível na área pessoal (`/me/...`).

**Quadro do dia**

- `GET /time-entries/daily?date=&unitId=` exige `time_entries:read` e respeita o escopo.
- Para cada funcionário ativo na data, devolve a escala prevista, as marcações efetivas do dia
  de trabalho (mesma regra do espelho, incluindo turno que atravessa a meia-noite), as horas
  trabalhadas e uma situação: `present`, `finished`, `no_entries`, `justified` ou `off`.
- A situação sai só das marcações e da escala, sem tolerância. "Sem registro" na tela quer
  dizer que o turno já começou e não houve marcação. Não é atraso no sentido legal (motor de
  cálculo, P-017).
- A escala de vários funcionários sai de uma consulta em lote (`AssignmentsService.planMany`).
- O quadro tem teto de 1.000 funcionários por consulta. Acima disso, consulta-se por unidade.

## Consequências

- O Administrador cai na visão geral e vê os dados de toda a empresa, sem itens de ponto
  próprio.
- O gestor vê o próprio ponto separado do da equipe. As filas de aprovação só mostram o que
  ele pode decidir.
- Quem tinha acesso à própria linha pelas listas de gestão passa a vê-la só na área pessoal.
- Bancos criados por seeds antigos tinham o Administrador ligado a um cadastro. O seed agora
  desfaz essa ligação e renomeia o registro 0001 para "Marina Analista".

## Alternativas consideradas

- Decidir pela chave do perfil (`admin`) — contraria o ADR 0007. Um Administrador que também
  seja funcionário deixaria de bater ponto.
- Nova permissão `time_entries:clock` — duplicaria o que o cadastro de funcionário já
  informa. Também exigiria migrar os perfis de todas as empresas.
- Manter um menu único com seções — ainda misturaria o próprio ponto com o da equipe, que é
  o problema relatado.
