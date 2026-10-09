# 0016 — Rondas: pontos com QR, rotas, horários e check-ins append-only

- **Status:** aceito
- **Data:** 2026-09-26

## Contexto

Vigilantes percorrem rotas pela unidade em horários definidos. A gestão precisa ver em tempo
real quem está em ronda, quais pontos já foram visitados e quais rondas atrasaram ou não
foram feitas. Também precisa de prova de que o vigilante esteve em cada ponto. O registro de
passagem não pode ser alterado depois (regra 2).

## Decisão

**Cadastro (`patrols:manage`, escopo da empresa)**

- **Ponto**: local de uma unidade, com localização e raio opcionais. Cada ponto tem um QR
  impresso com o conteúdo `EXR1.<id do ponto>.<token>`.
- O token tem 128 bits aleatórios e fica no banco. O servidor compara o token em tempo
  constante. Sem acesso ao banco, não há como forjar o QR de um ponto.
- "Gerar novo QR" troca o token e soma a versão. O QR impresso antes deixa de valer na hora.
  O check-in guarda a versão do QR usada.
- Não usamos HMAC com chave do servidor. Isso exigiria um novo segredo de ambiente, e a
  rotação de um ponto só seria possível guardando a versão. O token por ponto dá a mesma
  garantia, é mais simples e permite reimprimir quando quiser.
- **Rota**: unidade, pontos em ordem e tempo previsto (5 a 720 min). Também define:
  - se exige a ordem dos pontos;
  - horários de início (minutos do dia, no fuso da unidade) e dias da semana;
  - os funcionários responsáveis.
- Só os responsáveis veem a rota e iniciam a ronda.
- Os pontos da rota precisam ser ativos e da mesma unidade.
- Ponto em rota ou com check-in e rota com ronda não podem ser excluídos. A alternativa é
  inativar.

**Execução (área pessoal)**

- O funcionário inicia a ronda (`POST /me/patrol-runs`, com idempotência). Pode haver só uma
  em andamento por funcionário (índice parcial único).
- A ronda guarda os pontos que a rota tinha no início (`point_ids`). Mudar a rota depois não
  altera rondas já iniciadas.
- O término previsto é o início mais o tempo previsto. Passou disso, a ronda está atrasada.
- A ronda cumpre o horário previsto mais cedo que ainda esteja livre. Um horário aceita início
  de 30 min antes até o fim do tempo previsto (P-020). Fora dessa janela, a ronda fica "fora
  de horário". Cada horário é cumprido por uma só ronda (índice parcial único).
- Check-in (`POST /me/patrol-runs/:id/checkins`, com idempotência):
  - o horário oficial é o do servidor;
  - valida o QR, se o ponto é da ronda e se ainda não foi lido;
  - fora de ordem é recusado se a rota exige ordem; senão, é aceito e sinalizado;
  - a localização do aparelho é opcional e conferida com a do ponto, quando ele tem uma. O
    resultado (dentro, fora, sem localização) fica registrado.
- O último ponto encerra a ronda como `completed`.
- Encerrar faltando pontos exige motivo e marca `incomplete`.
- No web, o QR é lido pela câmera traseira com `jsqr`. O `BarcodeDetector` não existe no
  Safari do iOS. Se a câmera falhar, dá para digitar o código impresso abaixo do QR.

**Integridade no banco**

- `patrol_checkins` é append-only (`forbid_mutation`).
- `patrol_runs` só aceita uma alteração: o encerramento de uma ronda em andamento (situação,
  horário e observação do fim). Não pode ser excluída nem reaberta (trigger
  `patrol_runs_finish_only`).
- As situações ficam coerentes por CHECK: em andamento ⇔ sem horário de fim.

**Acompanhamento (`patrols:read`)**

- `GET /patrol-runs/board?date=` devolve as rondas iniciadas na data (fuso da unidade) e os
  horários previstos. Cada horário tem uma situação: previsto, em andamento, feito ou não
  iniciado. "Não iniciado" quer dizer que o horário mais o tempo previsto passou sem ronda.
- O escopo é o do funcionário que faz a ronda. O gestor (equipe própria) vê a equipe; RH e
  Administrador veem a empresa.
- Como nas demais telas de gestão (ADR 0015), as rondas de quem consulta ficam de fora.
- Perfis padrão:
  - RH: `patrols:read` e `patrols:manage`;
  - Gestor: `patrols:read`;
  - Administrador: todas as permissões.
- `GET /me/access` informa `hasPatrolRoutes`. O item "Rondas" da área pessoal só aparece para
  quem tem rota atribuída.

## Consequências

- A passagem por um ponto só é registrada com o QR original. Uma foto do QR tirada por outra
  pessoa ainda funciona: a localização opcional e o novo QR mitigam isso, mas não impedem.
  Por isso a checagem de localização existe.
- Rondas e horários perdidos ficam visíveis para a gestão, mas o sistema ainda não avisa
  ninguém (P-021).
- Ocorrências com foto durante a ronda ficam para uma próxima etapa (P-022).
- A ronda exige conexão. O modo offline é escopo do app mobile (ADR 0009, fase 2).

## Alternativas consideradas

- QR com HMAC de chave do servidor: veja acima.
- NFC nos pontos: exige hardware e não funciona no web em iOS.
- Qualquer vigilante da unidade faz qualquer rota: sem responsáveis, não há como mostrar a
  próxima ronda de cada um nem cobrar horários.
