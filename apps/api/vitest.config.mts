import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// SWC é necessário para emitir metadata de decorators (DI do NestJS).
const plugins = [swc.vite({ module: { type: 'es6' } })];

// Ambiente mínimo e válido para testes que montam o AppModule sem infraestrutura real.
// Nada conecta no boot (Prisma, Redis e S3 são preguiçosos).
const unitEnv = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL: 'postgresql://test:test@127.0.0.1:1/test',
  REDIS_URL: 'redis://127.0.0.1:1',
  S3_ENDPOINT: 'http://127.0.0.1:1',
  S3_ACCESS_KEY: 'test',
  S3_SECRET_KEY: 'test-secret',
  S3_BUCKET: 'test-bucket',
};

export default defineConfig({
  test: {
    projects: [
      {
        plugins,
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts', 'test/unit/**/*.test.ts'],
          env: unitEnv,
          // Montar o AppModule com cache frio (CI) passa dos 5 s padrão.
          testTimeout: 15_000,
        },
      },
      {
        plugins,
        test: {
          name: 'integration',
          include: ['test/integration/**/*.int.test.ts'],
          env: { NODE_ENV: 'test', LOG_LEVEL: 'silent' },
          // Subir containers leva tempo, principalmente no primeiro pull de imagens.
          hookTimeout: 180_000,
          testTimeout: 30_000,
          fileParallelism: false,
        },
      },
    ],
  },
});
