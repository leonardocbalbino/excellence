# 0014 — Comunicados: público, conteúdo congelado e ciência append-only

- **Status:** aceito
- **Data:** 2026-09-25

## Contexto

O RH e os gestores precisam avisar os funcionários (mudança de escala, regras internas,
campanhas) e, em alguns casos, provar que cada um tomou ciência. Para a prova valer, o texto
lido não pode mudar depois, e o registro de leitura não pode ser alterado nem apagado
(regra 2).

## Decisão

**Ciclo de vida**

- Situações: `draft` → `published` → `archived`. O rascunho pode ser editado e excluído.
- Publicado, o comunicado congela. Um trigger recusa alterar título, texto, exigência de
  ciência, data e autor da publicação, voltar a rascunho ou excluir. Outro trigger recusa
  mudar o público (`announcement_units`, `announcement_departments`).
- Correção de um publicado = novo comunicado. Arquivar tira do mural e mantém as leituras.
- `expires_at` opcional: depois dele o comunicado sai do mural e continua na gestão.

**Público**

- Sem unidades nem departamentos, o comunicado vai para toda a empresa, inclusive usuários sem
  cadastro de funcionário (ex.: administradores).
- Com unidades ou departamentos, vai para quem está lotado em alguma delas (união), avaliado
  no momento da consulta.
- Quem gerencia (`announcements:manage`) só escreve para o próprio escopo:
  - escopo da empresa: qualquer público;
  - escopo de unidade ou departamento: só públicos contidos nele, nunca a empresa toda;
  - equipe própria e próprios registros não delimitam público.
- Na gestão, cada um vê o que criou e o que está dentro do seu escopo.

**Leitura e ciência**

- `announcement_reads` é append-only (trigger `forbid_mutation`). Guarda um registro por
  usuário e tipo (`viewed`, `acknowledged`), com IP, user agent e o funcionário do usuário no
  momento.
- Abrir o comunicado registra a leitura. "Li e estou ciente" registra a ciência (e a leitura,
  se faltar). Repetir não cria registro nem altera o existente (`ON CONFLICT DO NOTHING`).
- O relatório de leituras lista os funcionários do público ativos na data da publicação, dentro
  do escopo de quem consulta, e indica quem não tem conta de acesso.
- Criar, editar, publicar, arquivar e excluir geram `audit_logs`. As leituras não, porque o
  próprio registro de leitura é a trilha.

## Consequências

- A ciência registrada aponta para um texto que o banco garante não ter mudado.
- O público é avaliado na consulta: quem muda de lotação passa a ver os comunicados da nova
  lotação e deixa de ver os da antiga. As leituras já feitas continuam registradas.
- Notificação por e-mail ou push fica para quando houver fila de envio (BullMQ) e o aplicativo
  mobile.
- A validade jurídica da ciência eletrônica para comunicados com efeito contratual está na
  pendência P-019.
- Os testes de integração não foram escritos nem executados, por falta de memória na máquina.
  O teste unitário do público também não foi executado.
