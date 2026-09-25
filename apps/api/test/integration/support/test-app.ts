import type { ModuleMetadata } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';

/**
 * Monta a API com o mesmo pipeline HTTP do `main.ts`.
 *
 * O ambiente precisa estar em `process.env` antes do import do AppModule, porque o
 * `ConfigModule.forRoot` valida as variáveis quando o módulo é carregado. Por isso os
 * imports aqui são dinâmicos.
 */
export async function createTestApp(
  env: Record<string, string>,
  extra: ModuleMetadata = {},
): Promise<NestExpressApplication> {
  Object.assign(process.env, env);

  const { AppModule } = await import('../../../src/app.module.js');
  const { configureApp } = await import('../../../src/configure-app.js');

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule, ...(extra.imports ?? [])],
    controllers: extra.controllers ?? [],
  }).compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
  configureApp(app);
  await app.init();
  return app;
}
