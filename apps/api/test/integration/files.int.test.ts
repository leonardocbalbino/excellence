import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  downloadLinkSchema,
  problemDetailsSchema,
  ProblemType,
  storedFileSchema,
  type UploadTicket,
  uploadTicketSchema,
} from '@excellence/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../../src/generated/prisma/client';
import { authHeader } from './support/access';
import { createTestPrisma, createTestUser } from './support/db';
import { createTestApp } from './support/test-app';

const PDF = Buffer.from('%PDF-1.4\n% arquivo de teste\n');

/** Envia direto ao storage, como o navegador faria, com os campos da política. */
async function uploadToStorage(ticket: UploadTicket, content: Buffer, contentType: string) {
  const form = new FormData();
  for (const [key, value] of Object.entries(ticket.fields)) form.append(key, value);
  form.append('file', new Blob([content], { type: contentType }), 'arquivo');
  return fetch(ticket.url, { method: 'POST', body: form });
}

describe('Arquivos (integração)', () => {
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

  async function startUpload(
    auth: { Authorization: string },
    overrides: Record<string, unknown> = {},
  ) {
    const res = await http()
      .post('/api/v1/files/uploads')
      .set(auth)
      .send({
        purpose: 'medical_certificate',
        fileName: 'Atestado "março".pdf',
        contentType: 'application/pdf',
        sizeBytes: PDF.length,
        ...overrides,
      })
      .expect(201);
    return uploadTicketSchema.parse(res.body);
  }

  it('fluxo completo: política de upload, envio direto, confirmação e download', async () => {
    const user = await createTestUser(prisma);
    const auth = await authHeader(http, user.email);
    const ticket = await startUpload(auth);

    const stored = await prisma.storedFile.findUniqueOrThrow({ where: { id: ticket.fileId } });
    expect(stored.storageKey).toMatch(
      new RegExp(`^${user.companyId}/medical_certificate/\\d{4}/\\d{2}/${ticket.fileId}$`),
    );
    expect(stored.status).toBe('pending');

    // Antes do envio, a confirmação falha.
    const early = await http().post(`/api/v1/files/${ticket.fileId}/confirm`).set(auth).expect(409);
    expect(problemDetailsSchema.parse(early.body).type).toBe(ProblemType.FileNotUploaded);

    const upload = await uploadToStorage(ticket, PDF, 'application/pdf');
    expect(upload.status).toBe(204);

    const confirmed = storedFileSchema.parse(
      (await http().post(`/api/v1/files/${ticket.fileId}/confirm`).set(auth).expect(201)).body,
    );
    expect(confirmed).toMatchObject({ status: 'uploaded', sizeBytes: PDF.length });

    const link = downloadLinkSchema.parse(
      (await http().get(`/api/v1/files/${ticket.fileId}/download-link`).set(auth).expect(200)).body,
    );
    const download = await fetch(link.url);
    expect(download.status).toBe(200);
    expect(Buffer.from(await download.arrayBuffer())).toEqual(PDF);
    expect(download.headers.get('content-disposition')).toContain(
      'attachment; filename="Atestado _marco_.pdf"',
    );
  });

  it('o storage recusa arquivo com tamanho diferente ou política adulterada', async () => {
    const user = await createTestUser(prisma);
    const auth = await authHeader(http, user.email);

    const bigger = await startUpload(auth);
    const tooBig = await uploadToStorage(
      bigger,
      Buffer.concat([PDF, Buffer.from('x')]),
      'application/pdf',
    );
    expect(tooBig.ok).toBe(false);

    // Trocar o Content-Type dos campos invalida a assinatura da política.
    const ticket = await startUpload(auth);
    const tampered = { ...ticket, fields: { ...ticket.fields, 'Content-Type': 'image/png' } };
    expect((await uploadToStorage(tampered, PDF, 'image/png')).ok).toBe(false);
  });

  it('a confirmação recusa conteúdo que não corresponde ao tipo declarado', async () => {
    const user = await createTestUser(prisma);
    const auth = await authHeader(http, user.email);
    // Cabeçalho de executável do Windows (MZ) declarado como PDF.
    const fake = Buffer.concat([Buffer.from([0x4d, 0x5a, 0x90, 0x00]), Buffer.from(' disfarçado')]);
    const ticket = await startUpload(auth, { sizeBytes: fake.length });
    expect((await uploadToStorage(ticket, fake, 'application/pdf')).status).toBe(204);

    const res = await http().post(`/api/v1/files/${ticket.fileId}/confirm`).set(auth).expect(409);
    expect(problemDetailsSchema.parse(res.body).type).toBe(ProblemType.FileMismatch);
  });

  it('valida finalidade, tipo e tamanho antes de emitir a política', async () => {
    const user = await createTestUser(prisma);
    const auth = await authHeader(http, user.email);
    const res = await http()
      .post('/api/v1/files/uploads')
      .set(auth)
      .send({
        purpose: 'selfie',
        fileName: 'a.pdf',
        contentType: 'application/pdf',
        sizeBytes: 50 * 1024 * 1024,
      })
      .expect(400);
    expect(problemDetailsSchema.parse(res.body).errors?.map((e) => e.path)).toEqual([
      'contentType',
      'sizeBytes',
    ]);
  });

  it('outro usuário, mesmo da mesma empresa, não vê nem confirma o arquivo', async () => {
    const owner = await createTestUser(prisma);
    const other = await createTestUser(prisma, { companyId: owner.companyId });
    const ownerAuth = await authHeader(http, owner.email);
    const otherAuth = await authHeader(http, other.email);
    const ticket = await startUpload(ownerAuth);
    await uploadToStorage(ticket, PDF, 'application/pdf');

    await http().post(`/api/v1/files/${ticket.fileId}/confirm`).set(otherAuth).expect(404);
    await http().get(`/api/v1/files/${ticket.fileId}`).set(otherAuth).expect(404);
    await http().get(`/api/v1/files/${ticket.fileId}/download-link`).set(otherAuth).expect(404);
  });

  it('exige autenticação', async () => {
    await http().post('/api/v1/files/uploads').send({}).expect(401);
  });
});
