import type { ModuleMetadata } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { inject } from 'vitest';

export interface TestAppOptions extends Pick<ModuleMetadata, 'imports' | 'controllers'> {
  /** Variáveis que substituem as da infraestrutura compartilhada. */
  env?: Record<string, string>;
  /** Providers substituídos (ex.: política de MFA). */
  overrides?: { token: unknown; useValue: unknown }[];
}

/**
 * Monta a API com o mesmo pipeline HTTP do `main.ts`, contra a infraestrutura do
 * global-setup.
 *
 * O ambiente precisa estar em `process.env` antes do import do AppModule, porque o
 * `ConfigModule.forRoot` valida as variáveis quando o módulo é carregado. Por isso os
 * imports aqui são dinâmicos. Cada arquivo de teste roda isolado, com sua própria
 * configuração.
 */
export async function createTestApp(options: TestAppOptions = {}): Promise<NestExpressApplication> {
  Object.assign(process.env, inject('infraEnv'), options.env);

  const { AppModule } = await import('../../../src/app.module.js');
  const { configureApp } = await import('../../../src/configure-app.js');

  let builder = Test.createTestingModule({
    imports: [AppModule, ...(options.imports ?? [])],
    controllers: options.controllers ?? [],
  });
  for (const { token, useValue } of options.overrides ?? []) {
    builder = builder.overrideProvider(token).useValue(useValue);
  }
  const moduleRef = await builder.compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
  configureApp(app);
  await app.init();
  return app;
}
