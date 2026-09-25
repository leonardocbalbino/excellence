import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { Controller, HttpCode, Post } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { isProblemDetails, problemDetailsSchema, ProblemType } from '@excellence/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ZodBody, ZodResponse } from '../../src/common/openapi/zod-openapi';
import { startInfra, type TestInfra } from './support/infra';
import { createTestApp } from './support/test-app';

const echoSchema = z.object({
  name: z.string().min(2),
  shift: z.enum(['day', 'night']).default('day'),
});

// Controller só de teste: exercita validação Zod, 7807 e OpenAPI de ponta a ponta.
@Controller('test-echo')
class EchoController {
  @Post()
  @HttpCode(200)
  @ZodResponse(200, echoSchema)
  echo(@ZodBody(echoSchema) body: z.output<typeof echoSchema>) {
    return body;
  }
}

describe('Fundação HTTP da API (integração)', () => {
  let infra: TestInfra | undefined;
  let app: NestExpressApplication | undefined;

  beforeAll(async () => {
    infra = await startInfra();
    app = await createTestApp(infra.env, { controllers: [EchoController] });
  });

  afterAll(async () => {
    await app?.close();
    await infra?.stop();
  });

  const http = () => {
    if (!app) throw new Error('App não inicializada');
    return request(app.getHttpServer());
  };
  const env = () => {
    if (!infra) throw new Error('Infra não inicializada');
    return infra.env;
  };
  const problemOf = (body: unknown) => problemDetailsSchema.parse(body);

  describe('health', () => {
    it('liveness responde 200 fora do prefixo /api/v1', async () => {
      const res = await http().get('/health/live').expect(200);
      expect(res.body).toMatchObject({ status: 'ok' });
    });

    it('readiness responde 503 no formato do Terminus quando o bucket não existe', async () => {
      const res = await http().get('/health/ready').expect(503);
      expect(res.body).toMatchObject({
        status: 'error',
        info: { database: { status: 'up' }, redis: { status: 'up' } },
        error: { storage: { status: 'down' } },
      });
    });

    it('readiness responde 200 com todas as dependências acessíveis', async () => {
      const s3 = new S3Client({
        endpoint: env().S3_ENDPOINT,
        region: 'us-east-1',
        forcePathStyle: true,
        credentials: {
          accessKeyId: env().S3_ACCESS_KEY ?? '',
          secretAccessKey: env().S3_SECRET_KEY ?? '',
        },
      });
      await s3.send(new CreateBucketCommand({ Bucket: env().S3_BUCKET }));
      s3.destroy();

      const res = await http().get('/health/ready').expect(200);
      expect(res.body).toMatchObject({
        status: 'ok',
        info: { database: { status: 'up' }, redis: { status: 'up' }, storage: { status: 'up' } },
      });
    });
  });

  describe('erros RFC 7807', () => {
    it('rota inexistente responde 404 como application/problem+json', async () => {
      const res = await http().get('/api/v1/nao-existe?x=1').expect(404);
      expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
      expect(isProblemDetails(res.body)).toBe(true);
      expect(res.body).toMatchObject({
        status: 404,
        title: 'Not Found',
        instance: '/api/v1/nao-existe',
      });
    });

    it('propaga o X-Request-Id recebido para a resposta e o corpo do erro', async () => {
      const res = await http()
        .get('/api/v1/nao-existe')
        .set('X-Request-Id', 'integ-req-0001')
        .expect(404);
      expect(res.headers['x-request-id']).toBe('integ-req-0001');
      expect(problemOf(res.body).requestId).toBe('integ-req-0001');
    });

    it('corpo inválido responde 400 com erros por campo', async () => {
      const res = await http()
        .post('/api/v1/test-echo')
        .send({ name: 'A', shift: 'evening' })
        .expect(400);
      expect(res.body).toMatchObject({ type: ProblemType.Validation, status: 400 });
      expect(problemOf(res.body).errors?.map((e) => e.path)).toEqual(['name', 'shift']);
    });

    it('corpo válido é transformado pelo schema (defaults aplicados)', async () => {
      const res = await http().post('/api/v1/test-echo').send({ name: 'Ana' }).expect(200);
      expect(res.body).toEqual({ name: 'Ana', shift: 'day' });
    });
  });

  describe('segurança HTTP', () => {
    it('aplica headers do helmet e oculta X-Powered-By', async () => {
      const res = await http().get('/health/live');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-powered-by']).toBeUndefined();
    });

    it('libera CORS só para as origens configuradas', async () => {
      const allowed = await http().get('/health/live').set('Origin', 'http://localhost:5173');
      expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
      const denied = await http().get('/health/live').set('Origin', 'https://evil.example');
      expect(denied.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('OpenAPI', () => {
    it('publica /openapi.json com schemas gerados a partir do Zod', async () => {
      const res = await http().get('/openapi.json').expect(200);
      const json = (schema: object) => ({ content: { 'application/json': { schema } } });
      expect(res.body).toMatchObject({
        paths: {
          '/api/v1/test-echo': {
            post: {
              requestBody: json({
                type: 'object',
                required: ['name'],
                properties: { shift: { enum: ['day', 'night'], default: 'day' } },
              }),
              responses: { '200': json({ required: ['name', 'shift'] }) },
            },
          },
        },
      });
      expect(res.body).toHaveProperty(['paths', '/health/ready']);
      expect(res.body).toHaveProperty(['components', 'schemas', 'ProblemDetails']);
    });

    it('serve a interface em /docs', async () => {
      await http().get('/docs').expect(200);
    });
  });
});
