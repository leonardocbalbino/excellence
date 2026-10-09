import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  authenticatedResponseSchema,
  createdAccountSchema,
  type EmployeeInput,
  employeeImportReportSchema,
  employeePageSchema,
  employeeSchema,
  myAccessSchema,
  PERMISSION_KEYS,
  type Permission,
  problemDetailsSchema,
  ProblemType,
  type RoleScope,
  uploadTicketSchema,
} from '@excellence/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../../src/generated/prisma/client';
import { authHeader, createRole, grantRole } from './support/access';
import { createTestPrisma, createTestUser } from './support/db';
import { createDepartment, createEmployee, createUnit, nextCpf } from './support/organization';
import { createTestApp } from './support/test-app';

describe('Funcionários (integração)', () => {
  let app: NestExpressApplication | undefined;
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = createTestPrisma();
    app = await createTestApp();
  });

  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
  });

  const http = () => {
    if (!app) throw new Error('App não inicializada');
    return request(app.getHttpServer());
  };
  const problemOf = (body: unknown) => problemDetailsSchema.parse(body);

  /** Empresa com duas unidades, um departamento em cada e um administrador. */
  async function scenario() {
    const admin = await createTestUser(prisma);
    const companyId = admin.companyId;
    await grantRole(
      prisma,
      admin,
      await createRole(prisma, companyId, { permissions: [...PERMISSION_KEYS] }),
    );
    const [unitA, unitB] = await Promise.all([
      createUnit(prisma, companyId),
      createUnit(prisma, companyId),
    ]);
    const [depA, depB] = await Promise.all([
      createDepartment(prisma, companyId, { unitId: unitA.id }),
      createDepartment(prisma, companyId, { unitId: unitB.id }),
    ]);
    return {
      companyId,
      admin,
      auth: await authHeader(http, admin.email),
      unitA,
      unitB,
      depA,
      depB,
    };
  }

  async function userWith(companyId: string, permissions: Permission[], scopes: RoleScope[]) {
    const user = await createTestUser(prisma, { companyId });
    await grantRole(prisma, user, await createRole(prisma, companyId, { permissions, scopes }));
    return user;
  }

  const input = (overrides: Partial<EmployeeInput> & { unitId: string }): EmployeeInput => ({
    registrationNumber: `R${Math.random().toString(36).slice(2, 8)}`,
    name: 'Joana Pereira',
    socialName: null,
    cpf: nextCpf(),
    pis: null,
    birthDate: '1990-05-10',
    email: null,
    phone: null,
    hireDate: '2024-03-01',
    terminationDate: null,
    departmentId: null,
    positionId: null,
    unionId: null,
    managerId: null,
    ...overrides,
  });

  describe('cadastro', () => {
    it('cria, valida documentos e referências, impede duplicados e ciclos de gestão', async () => {
      const { auth, unitA, unitB, depB } = await scenario();

      const cpf = nextCpf();
      const created = employeeSchema.parse(
        (
          await http()
            .post('/api/v1/employees')
            .set(auth)
            .send(
              input({
                unitId: unitA.id,
                cpf: cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4'),
                socialName: 'Jô',
              }),
            )
            .expect(201)
        ).body,
      );
      expect(created).toMatchObject({
        cpf,
        status: 'active',
        socialName: 'Jô',
        unit: { id: unitA.id },
      });

      const invalid = await http()
        .post('/api/v1/employees')
        .set(auth)
        .send(
          input({
            unitId: unitA.id,
            cpf: '123.456.789-00',
            hireDate: '2024-03-01',
            birthDate: '2030-01-01',
          }),
        )
        .expect(400);
      expect(
        problemOf(invalid.body)
          .errors?.map((e) => e.path)
          .sort(),
      ).toEqual(['birthDate', 'cpf']);

      const dupCpf = await http()
        .post('/api/v1/employees')
        .set(auth)
        .send(input({ unitId: unitA.id, cpf }))
        .expect(409);
      expect(problemOf(dupCpf.body).errors?.[0]?.path).toBe('cpf');

      // Departamento de outra unidade.
      const wrongDep = await http()
        .post('/api/v1/employees')
        .set(auth)
        .send(input({ unitId: unitA.id, departmentId: depB.id }))
        .expect(422);
      expect(problemOf(wrongDep.body).errors?.[0]).toMatchObject({ path: 'departmentId' });

      // Ciclo: A gere B; tentar fazer B gerir A.
      const b = employeeSchema.parse(
        (
          await http()
            .post('/api/v1/employees')
            .set(auth)
            .send(input({ unitId: unitB.id, managerId: created.id }))
            .expect(201)
        ).body,
      );
      const {
        id: _id,
        status: _s,
        unit: _u,
        department: _d,
        position: _p,
        union: _un,
        manager: _m,
        userId: _uid,
        ...rest
      } = created;
      const cycle = await http()
        .put(`/api/v1/employees/${created.id}`)
        .set(auth)
        .send({
          ...rest,
          unitId: unitA.id,
          departmentId: null,
          positionId: null,
          unionId: null,
          managerId: b.id,
        })
        .expect(422);
      expect(problemOf(cycle.body).errors?.[0]?.path).toBe('managerId');
    });

    it('desligamento: ativo até o último dia, depois fica como desligado', async () => {
      const { auth, companyId, unitA } = await scenario();
      await createEmployee(prisma, companyId, {
        unitId: unitA.id,
        name: 'Antigo',
        terminationDate: '2020-01-31',
      });
      await createEmployee(prisma, companyId, { unitId: unitA.id, name: 'Atual' });

      const active = employeePageSchema.parse(
        (await http().get('/api/v1/employees').set(auth).expect(200)).body,
      );
      expect(active.items.map((e) => e.name)).toContain('Atual');
      expect(active.items.map((e) => e.name)).not.toContain('Antigo');
      const terminated = employeePageSchema.parse(
        (await http().get('/api/v1/employees?status=terminated').set(auth).expect(200)).body,
      );
      expect(terminated.items).toEqual([
        expect.objectContaining({ name: 'Antigo', status: 'terminated' }),
      ]);
    });

    it('busca por nome, matrícula e CPF, com paginação', async () => {
      const { auth, companyId, unitA } = await scenario();
      const target = await createEmployee(prisma, companyId, {
        unitId: unitA.id,
        name: 'Zuleide Brandão',
        registrationNumber: 'Z-900',
      });
      for (let i = 0; i < 3; i++) await createEmployee(prisma, companyId, { unitId: unitA.id });

      const byName = employeePageSchema.parse(
        (await http().get('/api/v1/employees?search=zuleide').set(auth)).body,
      );
      expect(byName.items.map((e) => e.id)).toEqual([target.id]);
      const byCpf = employeePageSchema.parse(
        (
          await http()
            .get(`/api/v1/employees?search=${target.cpf.slice(0, 6)}`)
            .set(auth)
        ).body,
      );
      expect(byCpf.items.map((e) => e.id)).toContain(target.id);

      const page = employeePageSchema.parse(
        (await http().get('/api/v1/employees?pageSize=2&page=2').set(auth)).body,
      );
      expect(page).toMatchObject({ total: 4, page: 2, pageSize: 2 });
      expect(page.items).toHaveLength(2);
    });
  });

  describe('escopo de dados', () => {
    it('unidade, equipe e próprio registro enxergam só o que devem', async () => {
      const { companyId, unitA, unitB } = await scenario();

      const unitReader = await userWith(
        companyId,
        ['employees:read', 'employees:manage'],
        [{ type: 'unit', unitId: unitA.id }],
      );
      const manager = await userWith(companyId, ['employees:read'], [{ type: 'own_team' }]);
      const self = await userWith(companyId, ['employees:read'], [{ type: 'self' }]);

      const managerRecord = await createEmployee(prisma, companyId, {
        unitId: unitB.id,
        userId: manager.id,
        name: 'Gerente',
      });
      const report = await createEmployee(prisma, companyId, {
        unitId: unitB.id,
        managerId: managerRecord.id,
        name: 'Liderado',
      });
      const inA = await createEmployee(prisma, companyId, {
        unitId: unitA.id,
        name: 'Da unidade A',
      });
      const selfRecord = await createEmployee(prisma, companyId, {
        unitId: unitB.id,
        userId: self.id,
        name: 'Eu mesmo',
      });

      // O login vem antes de montar a requisição: o supertest não aceita duas abertas juntas.
      const names = async (user: { email: string }) => {
        const auth = await authHeader(http, user.email);
        const res = await http().get('/api/v1/employees').set(auth);
        return employeePageSchema
          .parse(res.body)
          .items.map((e) => e.name)
          .sort();
      };

      expect(await names(unitReader)).toEqual(['Da unidade A']);
      expect(await names(manager)).toEqual(['Liderado']);
      expect(await names(self)).toEqual(['Eu mesmo']);

      // Fora do escopo responde como inexistente.
      const unitAuth = await authHeader(http, unitReader.email);
      await http().get(`/api/v1/employees/${report.id}`).set(unitAuth).expect(404);
      await http().get(`/api/v1/employees/${inA.id}`).set(unitAuth).expect(200);
      const selfAuth = await authHeader(http, self.email);
      await http().get(`/api/v1/employees/${selfRecord.id}`).set(selfAuth).expect(200);

      // Quem gerencia a unidade A não cadastra na unidade B.
      const res = await http()
        .post('/api/v1/employees')
        .set(unitAuth)
        .send(input({ unitId: unitB.id }))
        .expect(403);
      expect(problemOf(res.body).type).toBe(ProblemType.OutOfScope);
      await http()
        .post('/api/v1/employees')
        .set(unitAuth)
        .send(input({ unitId: unitA.id }))
        .expect(201);
    });

    it('não enxerga funcionários de outra empresa', async () => {
      const a = await scenario();
      const b = await scenario();
      const employeeA = await createEmployee(prisma, a.companyId, { unitId: a.unitA.id });
      await http().get(`/api/v1/employees/${employeeA.id}`).set(b.auth).expect(404);
      const page = employeePageSchema.parse(
        (await http().get('/api/v1/employees').set(b.auth)).body,
      );
      expect(page.items.map((e) => e.id)).not.toContain(employeeA.id);
    });
  });

  describe('conta de acesso', () => {
    it('senha temporária, troca obrigatória e perfil padrão da empresa', async () => {
      const { auth, companyId, unitA } = await scenario();
      const defaultRole = await createRole(prisma, companyId, {
        permissions: ['units:read'],
        scopes: [{ type: 'self' }],
      });
      await prisma.company.update({
        where: { id: companyId },
        data: { defaultEmployeeRoleId: defaultRole.id },
      });
      const employee = await createEmployee(prisma, companyId, {
        unitId: unitA.id,
        name: 'Nova Pessoa',
      });
      const email = `nova-${employee.id}@teste.com.br`;

      const account = createdAccountSchema.parse(
        (
          await http()
            .post(`/api/v1/employees/${employee.id}/account`)
            .set(auth)
            .send({ email })
            .expect(201)
        ).body,
      );
      expect(account.temporaryPassword).toHaveLength(12);
      await http()
        .post(`/api/v1/employees/${employee.id}/account`)
        .set(auth)
        .send({ email: `x${email}` })
        .expect(409);

      const login = authenticatedResponseSchema.parse(
        (
          await http()
            .post('/api/v1/auth/login')
            .send({ email, password: account.temporaryPassword })
        ).body,
      );
      const tempAuth = { Authorization: `Bearer ${login.accessToken}` };

      // Acesso restrito até trocar a senha.
      const blocked = await http().get('/api/v1/units').set(tempAuth).expect(403);
      expect(problemOf(blocked.body).type).toBe(ProblemType.PasswordChangeRequired);
      const access = myAccessSchema.parse(
        (await http().get('/api/v1/me/access').set(tempAuth)).body,
      );
      expect(access).toMatchObject({
        passwordChangeRequired: true,
        permissions: ['units:read'],
        hasEmployeeRecord: true,
      });

      const weak = await http()
        .post('/api/v1/auth/password')
        .set(tempAuth)
        .send({ currentPassword: account.temporaryPassword, newPassword: 'curta123' })
        .expect(400);
      expect(problemOf(weak.body).type).toBe(ProblemType.WeakPassword);
      await http()
        .post('/api/v1/auth/password')
        .set(tempAuth)
        .send({ currentPassword: 'errada', newPassword: 'Senha-bem-grande-1' })
        .expect(400);
      await http()
        .post('/api/v1/auth/password')
        .set(tempAuth)
        .send({ currentPassword: account.temporaryPassword, newPassword: 'Senha-bem-grande-1' })
        .expect(204);

      await http().get('/api/v1/units').set(tempAuth).expect(200);
      const mine = employeeSchema.parse(
        (await http().get('/api/v1/me/employee').set(tempAuth).expect(200)).body,
      );
      expect(mine).toMatchObject({ id: employee.id, userId: account.userId });

      const actions = (
        await prisma.auditLog.findMany({ where: { companyId }, select: { action: true } })
      ).map((l) => l.action);
      expect(actions).toEqual(
        expect.arrayContaining(['employee.account_created', 'auth.password_changed']),
      );
    });

    it('e-mail já usado por qualquer conta é recusado', async () => {
      const { auth, companyId, unitA, admin } = await scenario();
      const employee = await createEmployee(prisma, companyId, { unitId: unitA.id });
      const res = await http()
        .post(`/api/v1/employees/${employee.id}/account`)
        .set(auth)
        .send({ email: admin.email })
        .expect(409);
      expect(problemOf(res.body).errors?.[0]?.path).toBe('email');
    });
  });

  describe('importação por planilha', () => {
    async function upload(auth: { Authorization: string }, csv: string): Promise<string> {
      const content = Buffer.from(csv, 'utf8');
      const ticket = uploadTicketSchema.parse(
        (
          await http()
            .post('/api/v1/files/uploads')
            .set(auth)
            .send({
              purpose: 'spreadsheet_import',
              fileName: 'funcionarios.csv',
              contentType: 'text/csv',
              sizeBytes: content.length,
            })
            .expect(201)
        ).body,
      );
      const form = new FormData();
      for (const [key, value] of Object.entries(ticket.fields)) form.append(key, value);
      form.append('file', new Blob([content], { type: 'text/csv' }));
      expect((await fetch(ticket.url, { method: 'POST', body: form })).status).toBe(204);
      await http().post(`/api/v1/files/${ticket.fileId}/confirm`).set(auth).expect(201);
      return ticket.fileId;
    }

    const header =
      'matricula;nome;nome_social;cpf;pis;data_nascimento;email;telefone;data_admissao;unidade;departamento;cargo;sindicato;matricula_gestor';

    it('simula, aponta erros linha a linha e não grava nada', async () => {
      const { auth, companyId, unitA } = await scenario();
      const existing = await createEmployee(prisma, companyId, {
        unitId: unitA.id,
        registrationNumber: 'JA-1',
      });
      const csv = [
        header,
        `I-1;Ana;;${nextCpf()};;;;;01/02/2024;${unitA.code ?? ''};;;;`,
        `I-2;Bruno;;123.456.789-00;;;;;01/02/2024;${unitA.code ?? ''};;;;`,
        `JA-1;Carla;;${nextCpf()};;;;;01/02/2024;NAO-EXISTE;;;;`,
        `I-4;Davi;;${existing.cpf};;;;;31/02/2024;${unitA.code ?? ''};;;;I-99`,
      ].join('\n');
      const fileId = await upload(auth, csv);

      const report = employeeImportReportSchema.parse(
        (
          await http()
            .post('/api/v1/employees/imports')
            .set(auth)
            .send({ fileId, dryRun: false })
            .expect(201)
        ).body,
      );
      expect(report).toMatchObject({ totalRows: 4, validRows: 1, imported: 0, dryRun: false });
      const byRow = (row: number) =>
        report.errors.filter((e) => e.row === row).map((e) => `${e.column}: ${e.message}`);
      expect(byRow(3)).toEqual(['cpf: CPF inválido']);
      expect(byRow(4)).toEqual(
        expect.arrayContaining([
          'unidade: "NAO-EXISTE" não encontrado no cadastro',
          'matricula: Matrícula já cadastrada',
        ]),
      );
      expect(byRow(5)).toEqual(
        expect.arrayContaining([
          'data_admissao: Data inválida (use AAAA-MM-DD)',
          'matricula_gestor: Gestor não encontrado (nem no cadastro, nem na planilha)',
        ]),
      );
      expect(await prisma.employee.count({ where: { companyId } })).toBe(1);
    });

    it('importa tudo, ligando gestores da própria planilha', async () => {
      const { auth, companyId, unitA, depA } = await scenario();
      const csv = [
        header,
        `G-1;Gerente Importado;;${nextCpf()};;15/03/1985;;;01/02/2024;${unitA.code ?? ''};${depA.code ?? ''};;;`,
        `L-1;Liderado Um;;${nextCpf()};;;;;2024-02-05;${unitA.name};;;;G-1`,
        `L-2;Liderado Dois;Duda;${nextCpf()};;;;;05/02/2024;${unitA.code ?? ''};;;;g-1`,
      ].join('\n');
      const fileId = await upload(auth, csv);

      const dry = employeeImportReportSchema.parse(
        (await http().post('/api/v1/employees/imports').set(auth).send({ fileId, dryRun: true }))
          .body,
      );
      expect(dry).toMatchObject({ validRows: 3, errors: [], imported: 0 });

      const report = employeeImportReportSchema.parse(
        (await http().post('/api/v1/employees/imports').set(auth).send({ fileId, dryRun: false }))
          .body,
      );
      expect(report).toMatchObject({ imported: 3, errors: [] });

      const manager = await prisma.employee.findFirstOrThrow({
        where: { companyId, registrationNumber: 'G-1' },
      });
      const reports = await prisma.employee.findMany({
        where: { companyId, managerId: manager.id },
        orderBy: { registrationNumber: 'asc' },
      });
      expect(reports.map((r) => [r.registrationNumber, r.socialName])).toEqual([
        ['L-1', null],
        ['L-2', 'Duda'],
      ]);
      expect(manager.departmentId).toBe(depA.id);
      expect(
        await prisma.auditLog.count({ where: { companyId, action: 'employees.imported' } }),
      ).toBe(1);
    });

    it('detecta ciclo de gestão dentro da planilha', async () => {
      const { auth, unitA } = await scenario();
      const csv = [
        header,
        `C-1;Primeiro;;${nextCpf()};;;;;01/02/2024;${unitA.code ?? ''};;;;C-2`,
        `C-2;Segundo;;${nextCpf()};;;;;01/02/2024;${unitA.code ?? ''};;;;C-1`,
      ].join('\n');
      const fileId = await upload(auth, csv);
      const report = employeeImportReportSchema.parse(
        (await http().post('/api/v1/employees/imports').set(auth).send({ fileId, dryRun: true }))
          .body,
      );
      expect(report.errors.map((e) => e.message)).toEqual([
        'Ciclo de gestão entre funcionários da planilha',
        'Ciclo de gestão entre funcionários da planilha',
      ]);
    });

    it('modelo de planilha e colunas obrigatórias', async () => {
      const { auth } = await scenario();
      const template = await http().get('/api/v1/employees/imports/template').set(auth).expect(200);
      expect(template.headers['content-type']).toMatch(/text\/csv/);
      expect(template.text.split('\n')[0]).toBe(header);

      const fileId = await upload(auth, 'nome;cpf\nAna;1\n');
      const res = await http()
        .post('/api/v1/employees/imports')
        .set(auth)
        .send({ fileId })
        .expect(400);
      expect(problemOf(res.body).detail).toContain('matricula, data_admissao, unidade');
    });
  });
});
