import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  conversationDetailSchema,
  conversationMessageSchema,
  conversationSummarySchema,
  conversationUnreadSchema,
  problemDetailsSchema,
  ProblemType,
} from '@excellence/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { PrismaClient } from '../../src/generated/prisma/client';
import { authHeader, createRole, grantRole } from './support/access';
import { createTestPrisma, createTestUser } from './support/db';
import { createEmployee, createUnit } from './support/organization';
import { createTestApp } from './support/test-app';

describe('Atendimento: chamados com o RH (integração)', () => {
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

  /** RH (empresa toda) e um funcionário com conta. */
  async function scenario() {
    const hr = await createTestUser(prisma);
    const companyId = hr.companyId;
    await grantRole(
      prisma,
      hr,
      await createRole(prisma, companyId, { permissions: ['conversations:manage'] }),
    );
    const unit = await createUnit(prisma, companyId);
    const employeeUser = await createTestUser(prisma, { companyId });
    const employee = await createEmployee(prisma, companyId, {
      unitId: unit.id,
      userId: employeeUser.id,
      name: 'Vera Vigia',
    });
    return {
      companyId,
      employee,
      hrAuth: await authHeader(http, hr.email),
      employeeAuth: await authHeader(http, employeeUser.email),
    };
  }

  it('cada chamado recebe um número único e sequencial na empresa', async () => {
    const { employeeAuth } = await scenario();
    const open = async (subject: string) =>
      conversationDetailSchema.parse(
        (
          await http()
            .post('/api/v1/me/conversations')
            .set(employeeAuth)
            .send({ category: 'time_tracking', subject, message: 'Esqueci de bater a saída.' })
            .expect(201)
        ).body,
      );
    const [first, second, third] = await Promise.all([
      open('Ponto de ontem'),
      open('Ponto de hoje'),
      open('Outro ponto'),
    ]);
    const numbers = [first, second, third].map((c) => c.number).sort((a, b) => a - b);
    expect(new Set(numbers).size).toBe(3);
    expect(Math.max(...numbers) - Math.min(...numbers)).toBe(2);
    expect(first.messages).toHaveLength(1);
    expect(first.status).toBe('open');
  });

  it('RH responde, funcionário vê como não lido; encerrado só reabre com nova mensagem', async () => {
    const { hrAuth, employeeAuth } = await scenario();
    const conversation = conversationDetailSchema.parse(
      (
        await http()
          .post('/api/v1/me/conversations')
          .set(employeeAuth)
          .send({ category: 'benefits', subject: 'VA do mês', message: 'Veio menos dias.' })
          .expect(201)
      ).body,
    );

    const hrUnread = conversationUnreadSchema.parse(
      (await http().get('/api/v1/conversations/unread').set(hrAuth).expect(200)).body,
    );
    expect(hrUnread.conversations).toBeGreaterThanOrEqual(1);

    const list = z
      .array(conversationSummarySchema)
      .parse((await http().get('/api/v1/conversations').set(hrAuth).expect(200)).body);
    expect(list.find((c) => c.id === conversation.id)?.number).toBe(conversation.number);

    conversationMessageSchema.parse(
      (
        await http()
          .post(`/api/v1/conversations/${conversation.id}/messages`)
          .set(hrAuth)
          .send({ body: 'Vamos conferir no ponto.' })
          .expect(201)
      ).body,
    );
    const mine = z
      .array(conversationSummarySchema)
      .parse((await http().get('/api/v1/me/conversations').set(employeeAuth).expect(200)).body);
    expect(mine.find((c) => c.id === conversation.id)?.unread).toBe(1);

    const opened = conversationDetailSchema.parse(
      (
        await http()
          .get(`/api/v1/me/conversations/${conversation.id}`)
          .set(employeeAuth)
          .expect(200)
      ).body,
    );
    expect(opened.unread).toBe(0);
    expect(opened.messages.map((m) => m.side)).toEqual(['employee', 'hr']);

    await http().post(`/api/v1/conversations/${conversation.id}/close`).set(hrAuth).expect(201);
    const blocked = await http()
      .post(`/api/v1/conversations/${conversation.id}/messages`)
      .set(hrAuth)
      .send({ body: 'Mais uma coisa.' })
      .expect(409);
    expect(problemDetailsSchema.parse(blocked.body).type).toBe(ProblemType.ConversationClosed);

    // A mensagem do funcionário reabre o chamado.
    await http()
      .post(`/api/v1/me/conversations/${conversation.id}/messages`)
      .set(employeeAuth)
      .send({ body: 'Ainda não resolveu.' })
      .expect(201);
    const reopened = conversationDetailSchema.parse(
      (await http().get(`/api/v1/conversations/${conversation.id}`).set(hrAuth).expect(200)).body,
    );
    expect(reopened.status).toBe('open');
  });

  it('chamado de outra pessoa responde como inexistente; sem permissão, o RH não lista', async () => {
    const { companyId, employeeAuth } = await scenario();
    const conversation = conversationDetailSchema.parse(
      (
        await http()
          .post('/api/v1/me/conversations')
          .set(employeeAuth)
          .send({ category: 'other', subject: 'Dúvida', message: 'Olá.' })
          .expect(201)
      ).body,
    );
    const otherUser = await createTestUser(prisma, { companyId });
    const unit = await createUnit(prisma, companyId);
    await createEmployee(prisma, companyId, { unitId: unit.id, userId: otherUser.id });
    const otherAuth = await authHeader(http, otherUser.email);
    await http().get(`/api/v1/me/conversations/${conversation.id}`).set(otherAuth).expect(404);
    await http().get('/api/v1/conversations').set(otherAuth).expect(403);

    // As mensagens são o registro: o banco recusa alterar.
    await expect(
      prisma.conversationMessage.updateMany({
        where: { conversationId: conversation.id },
        data: { body: 'editado' },
      }),
    ).rejects.toThrow();
  });
});
