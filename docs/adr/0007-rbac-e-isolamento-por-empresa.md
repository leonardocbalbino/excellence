# 0007 — RBAC com permissões atômicas, escopos e isolamento por empresa

- **Status:** aceito
- **Data:** 2026-09-25

## Contexto

O Administrador configura perfis, permissões e o escopo de dados que cada perfil enxerga,
inclusive o do RH. As regras 1 e 6 exigem que toda consulta filtre pela empresa e pelo escopo
do usuário, e que o código nunca verifique papel pelo nome.

## Decisão

**Modelo**

- **Permissões atômicas** `recurso:ação`. O catálogo está em código (`PERMISSIONS` em
  `@excellence/shared`), para web e mobile usarem as mesmas chaves, e é sincronizado com a
  tabela global `permissions` quando a API sobe (upsert idempotente). É a única tabela sem
  `company_id`, porque é catálogo do sistema e não dado da empresa. Permissões marcadas
  `sensitive` exigem auditoria de leitura (regra 7, etapa 0.5).
- **Perfis** (`roles`) por empresa, com nome único sem diferenciar maiúsculas, `requires_mfa` e
  `is_system`. Os perfis padrão são criados a partir de modelos em código (`DEFAULT_ROLE_TEMPLATES`)
  e podem ser editados, mas não excluídos.
- **Escopos** (`role_scopes`): `company`, `unit` (com `unit_id`), `department` (com
  `department_id`), `own_team` e `self`. Um perfil tem um ou mais escopos, e o acesso é a união
  deles. Um CHECK garante a coerência entre o tipo e as colunas. A FK para unidades e
  departamentos entra na etapa 1A.1.
- **Escopo efetivo:** o escopo de uma permissão para um usuário é a união dos escopos dos perfis
  que a concedem. Um perfil com escopo amplo não amplia permissões que vêm de outro perfil.
- `role_permissions`, `role_scopes` e `user_roles` têm `company_id` e **FKs compostas**
  `(id, company_id)`. Assim o próprio banco impede atribuir a um usuário um perfil de outra
  empresa.

**Autorização em requisição**

- Dois guards globais registrados juntos no `DomainModule`, para a ordem ficar explícita:
  `AuthGuard` (quem é) e depois `PermissionGuard` (o que pode).
- A regra é **negar por padrão**: toda rota não pública declara `@RequirePermission('x:y')` ou
  `@AnyAuthenticated()`. Uma rota sem declaração responde 403 e gera log de erro.
- O `PermissionGuard` calcula o acesso a partir dos perfis gravados, a cada requisição. Com a
  permissão concedida, anexa o `DataScope` correspondente, que o serviço recebe via `@Access()`.
- Um perfil que passa a exigir MFA vale imediatamente: sem MFA ativo, o usuário só acessa as
  rotas marcadas `allowPendingMfa` (cadastro do MFA, `/me/access`, `/auth/me`). No login
  seguinte, a `RoleBasedMfaPolicy` exige o cadastro.

**Regras de gestão**

- Criar ou editar perfis e atribuir perfis exige a permissão com escopo `company`. Quem só
  enxerga uma unidade não cria perfis que enxergam a empresa.
- **Anti-escalada:** só se concede o que se tem. Isso vale para as permissões acrescentadas a
  um perfil e para as permissões dos perfis atribuídos a um usuário.
- **Último administrador:** a transação é desfeita se a empresa ficar sem nenhum usuário ativo
  com `roles:manage` e `users:manage` em escopo de empresa.

**Isolamento por empresa (regra 1)**

- `RequestContext` (AsyncLocalStorage) guarda empresa, usuário, request ID e IP. É aberto por
  um interceptor global para requisições com token de acesso.
- `TenantPrismaService.client` é uma Prisma Client Extension que, em todo modelo com
  `companyId` (lista derivada do client gerado):
  - acrescenta `AND companyId = <empresa do contexto>` em toda consulta, alteração e exclusão.
    Se a consulta pedir outra empresa, o resultado é vazio;
  - preenche o `companyId` nas criações e lança erro ao tentar gravar em outra empresa;
  - restringe `Company` à própria empresa.
- Sem contexto, o client isolado lança erro: falha fechado.
- O `PrismaService` sem filtro fica restrito a autenticação, ao resolvedor de acesso, à
  infraestrutura e a jobs que definem a empresa explicitamente.

## Consequências

- O filtro por **empresa** é automático. O filtro por **escopo** (unidades, departamentos,
  equipe, próprio) é responsabilidade de cada repositório, que recebe o `DataScope`. Cada módulo
  deve ter testes de integração de escopo.
- Escritas aninhadas não passam pela extensão; as FKs compostas cobrem vínculos entre empresas.
- Resolver o acesso custa uma consulta por requisição. Se virar gargalo, cachear no Redis por
  usuário com invalidação na alteração de perfis.
- A listagem de usuários ainda é da empresa inteira. O filtro por escopo entra quando usuários
  forem ligados a funcionários, unidades e departamentos (1A.1).
- A tela de gestão de perfis depende do layout, das rotas e do login do web (0.6) e será entregue
  junto com essa etapa.

## Alternativas consideradas

- **Row Level Security do Postgres**: é a defesa mais forte, mas exige `SET` de variável de
  sessão por transação com o pool do Prisma, e o custo operacional é alto nesta fase. Pode entrar
  como segunda camada.
- **Permissões só como texto em `role_permissions`, sem tabela**: perderia a FK e a validação no
  banco.
- **Escopo por atribuição (`user_roles`) em vez de por perfil**: mais flexível, mas o requisito
  diz que o Admin define o escopo de cada perfil. Pode ser acrescentado depois como restrição
  adicional.
