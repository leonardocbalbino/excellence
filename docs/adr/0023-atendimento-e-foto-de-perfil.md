# 0023 — Atendimento com o RH (chamados numerados) e foto de perfil

- **Status:** aceito
- **Data:** 2026-10-25

## Contexto

O funcionário quer:

- trocar a foto de perfil no app;
- falar com o RH pelo app, como num chat.

No RH, cada conversa vira um chamado com número único.

O `@excellence/shared` já tinha o contrato da conversa (`conversations.schemas`,
`api.conversations`, permissão `conversations:manage`), sem implementação na API nem no web.

## Decisão

**Chamado** (`conversations`, `conversation_messages`)

- O funcionário abre o chamado no app com:
  - assunto (`occurrence`, `time_tracking`, `benefits`, `payroll`, `documents`, `other`);
  - título e primeira mensagem;
  - foto opcional (finalidade `conversation_attachment`).
- **Número único na empresa:** sequencial, nunca reaproveitado. Sai de um contador com
  incremento atômico (`conversation_counters`, o mesmo padrão do NSR do ponto). O banco ainda
  garante `UNIQUE (company_id, number)`. Exibição: `#000042` (`formatTicketNumber`).
- **Mensagens:** são o registro do atendimento, então não são editadas nem excluídas. Um
  trigger no banco recusa `UPDATE` e `DELETE`.
- **Situações:**
  - em atendimento ou encerrado;
  - o RH encerra e reabre;
  - a mensagem do funcionário num chamado encerrado reabre o chamado;
  - o RH só responde com o chamado aberto.
- **Não lidas:** cada lado guarda até quando leu (`employee_read_at`, `hr_read_at`). O RH conta
  como um lado só: o que um atendente abriu fica lido para todos.

**Quem atende**

- `conversations:manage`, no escopo da permissão (empresa, unidades ou departamentos), como
  os demais módulos (ADR 0007).
- Quem atende não vê os próprios chamados, como no quadro do ponto.
- O perfil padrão **RH** passa a ter `conversations:manage`. Perfis de RH já criados recebem
  a permissão pelo Administrador, em Perfis de acesso.
- Anexos: o link temporário é emitido para o funcionário do chamado ou para o RH no escopo, e só
  para arquivos de mensagens do próprio chamado.

**Avisos**

- Resposta do RH: push ao funcionário (`conversation_reply`). O toque abre a conversa no app
  (ADR 0022).
- O RH vê as mensagens novas no web: lista e conversa se atualizam sozinhas a cada 10 a 20 s.

**Telas**

- App: Mais › "Falar com o RH" e o atalho no Início, com o selo de chamados com resposta.
  - Lista com número, situação e não lidas.
  - Novo chamado.
  - Conversa em bolhas, com foto e atualização automática.
- Web: Comunicação › **Atendimento**.
  - Lista com filtros de situação e assunto, e busca por número, funcionário ou assunto.
  - Conversa com resposta (e anexo), encerrar e reabrir.

**Foto de perfil** (`users.avatar_file_id`)

- O app tira a foto ou escolhe da galeria, com recorte quadrado, e envia direto ao storage
  (finalidade `avatar`, até 5 MB, JPEG/PNG/WebP). Depois aponta o perfil para o arquivo
  (`PUT /me/avatar`).
- A leitura é por link temporário (`GET /me/avatar`). O app renova antes de vencer.
- Trocar ou remover não apaga a foto antiga do storage: a guarda segue a política de arquivos
  (P-006).
- A troca e a remoção ficam na auditoria.

## Consequências

- O funcionário tem um canal registrado e numerado com o RH. O número serve de protocolo nas
  duas pontas.
- Sem push para o RH: ele trabalha no web, que se atualiza sozinho. Avisar o RH por e-mail fica
  para depois, se for pedido.
- A foto aparece no app (Início, Mais e Perfil). Mostrar a foto no web (lista de funcionários,
  atendimento) fica para uma próxima etapa.

## Alternativas consideradas

- Número aleatório (protocolo): não diz a ordem dos chamados e é mais difícil de ditar por
  telefone.
- `MAX(number) + 1`: dois chamados ao mesmo tempo podem pegar o mesmo número. O contador com
  incremento atômico não tem esse risco.
- WebSocket para o chat: mais infraestrutura (mais um processo, sessões persistentes atrás do
  nginx). A atualização periódica e o push bastam para o volume de um RH.
