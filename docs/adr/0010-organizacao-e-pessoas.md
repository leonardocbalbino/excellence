# 0010 — Organização, pessoas e importação por planilha

- **Status:** aceito
- **Data:** 2026-09-25

## Contexto

Ponto, rondas, ausências e medidas disciplinares dependem de saber onde cada pessoa trabalha
(unidade com localização), em que área, com qual cargo, de qual sindicato e quem é seu gestor.
Esse cadastro também define os escopos do RBAC (unidade, departamento, própria equipe e o próprio
registro).

## Decisão

**Estrutura**

- **Empresa:** nome, razão social, CNPJ (numérico ou alfanumérico, IN RFB 2.229/2024), fuso
  padrão e perfil atribuído às contas criadas para funcionários. Esse perfil é configurado pelo
  Admin; quem configura precisa ter as permissões do perfil (anti-escalada).
- **Unidades:** endereço, coordenadas, raio da cerca virtual (10 a 5000 m, opcional; exige
  coordenadas) e fuso próprio (opcional, herda o da empresa). O código é único por empresa, sem
  diferenciar maiúsculas.
- **Departamentos** (gerais ou de uma unidade), **cargos** (CBO opcional) e **sindicatos** (CNPJ e
  mês da data-base).
- Referências entre cadastros usam FK composta `(id, company_id)`. `role_scopes` ganhou FK para
  unidades e departamentos.
- Cadastros em uso não são excluídos, só inativados. Excluir responde 409 `in-use`.
- **Leitura** desses catálogos vale para a empresa inteira para quem tem a permissão de leitura,
  já que são opções de formulário. **Gestão** exige escopo de empresa.

**Funcionários**

- Dados: CPF (validado, guardado só com dígitos), PIS/NIS, matrícula (única por empresa), nome
  social (exibido quando existe), admissão, desligamento, unidade, departamento, cargo, sindicato,
  gestor direto e conta de acesso.
- **Situação:** o funcionário continua ativo até o dia do desligamento, inclusive; o "hoje" é
  calculado no fuso da empresa. Ver pendência P-009.
- **Escopo de dados**, aplicado em toda leitura e escrita:
  - `unit` e `department`: funcionários lotados ali;
  - `own_team`: liderados **diretos** do gestor, identificado pelo registro de funcionário ligado
    ao usuário (pendência P-007);
  - `self`: o próprio registro.

  Fora do escopo, a API responde 404 na leitura e 403 `out-of-scope` na escrita. Não dá para mover
  alguém para fora do próprio escopo.

- **Gestão:** o funcionário não pode ser gestor de si mesmo (CHECK no banco), e a cadeia de gestores
  não pode formar ciclo (checado pela aplicação).
- **Conta de acesso:** criada pelo RH com senha temporária de 12 caracteres, exibida uma única vez.
  A conta nasce com `must_change_password`, e até a troca a API só libera as rotas de pendência
  (`allowPendingSetup`). Recebe o perfil padrão da empresa. O e-mail de login é único no sistema.
- **Troca de senha:** `POST /auth/password`. O tamanho mínimo vem de `PASSWORD_MIN_LENGTH`
  (padrão 10; demais regras na pendência P-002). A troca encerra as outras sessões.

**Importação por planilha**

- CSV (`;` ou `,`, UTF-8 ou Windows-1252, com BOM) ou XLSX (primeira aba), até 5000 linhas. O
  arquivo chega pelo fluxo de upload com finalidade `spreadsheet_import`.
- Colunas por nome (sem acento nem diferença de caixa): unidade, departamento, cargo e sindicato
  aceitam código ou nome; o gestor é a matrícula, já cadastrada ou na mesma planilha. Datas em
  DD/MM/AAAA ou AAAA-MM-DD. Zeros à esquerda perdidos pelo Excel são recuperados em CPF e PIS.
- **Simulação primeiro:** o relatório aponta cada problema por linha e coluna (documento,
  referência, duplicidade no arquivo ou no cadastro, escopo, ciclo de gestão).
- **Tudo ou nada:** com qualquer erro, nada é gravado. A gravação é uma transação que cria todos e
  depois liga os gestores da própria planilha. A importação só cria funcionários; atualizar em
  lote fica para depois.

**Web**

- Telas: empresa, unidades (com "usar minha localização"), cadastros simples, funcionários (busca,
  filtros e paginação), cadastro com criação de acesso, importação em três passos e troca de
  senha.
- Os formulários só renderizam depois que as opções dos selects carregam. Um select renderizado
  sem a opção do valor atual perde o valor, e salvar apagaria o dado (ex.: o gestor). O e2e pegou
  esse caso; há teste de regressão.

## Consequências

- O escopo de dados de pessoas fica pronto para ponto, ausências e rondas reutilizarem
  (`employeeScopeWhere` e `isInScope`).
- Unidades com coordenadas e raio permitem a validação de localização no ponto (1A.3) e nas rondas
  (1B). O tratamento de registro fora da cerca no ponto ainda depende de decisão (pendência
  P-008).
- A lista de possíveis gestores no formulário mostra até 100 funcionários do escopo. Em empresas
  grandes, trocar por busca com autocompletar.

## Alternativas consideradas

- **Importação linha a linha com gravação parcial**: gera base meio importada e retrabalho; o
  tudo-ou-nada com simulação é mais previsível para o RH.
- **Biblioteca `exceljs` para XLSX**: sem manutenção desde 2023 e com dependências antigas;
  `read-excel-file` é mantida e mais leve.
- **Senha definida pelo funcionário via link por e-mail**: depende da definição do canal de primeiro
  acesso (pendência P-003); a senha temporária com troca obrigatória funciona sem e-mail.
