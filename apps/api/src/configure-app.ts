import { type INestApplication, RequestMethod } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { setupOpenApi } from './common/openapi/setup-openapi';
import { AppConfig } from './config/app-config';

export const API_PREFIX = 'api/v1';

/**
 * Configuração HTTP comum ao `main.ts` e aos testes de integração.
 * Assim os testes exercitam o mesmo pipeline da produção.
 */
export function configureApp(app: NestExpressApplication): INestApplication {
  const config = app.get(AppConfig);

  app.useLogger(app.get(Logger));
  app.disable('x-powered-by');
  app.use(helmet());
  app.enableCors({
    origin: config.get('API_CORS_ORIGINS'),
    credentials: true,
    exposedHeaders: ['X-Request-Id'],
  });
  app.setGlobalPrefix(API_PREFIX, {
    exclude: [
      { path: 'health/live', method: RequestMethod.GET },
      { path: 'health/ready', method: RequestMethod.GET },
    ],
  });
  app.enableShutdownHooks();

  if (config.get('OPENAPI_ENABLED')) setupOpenApi(app);

  return app;
}
