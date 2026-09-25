import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { AppConfig } from './config/app-config';
import { configureApp } from './configure-app';

async function bootstrap(): Promise<void> {
  // bufferLogs segura os logs do boot até o logger estruturado assumir.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  configureApp(app);

  const port = app.get(AppConfig).get('API_PORT');
  await app.listen(port);
  app.get(Logger).log(`API ouvindo na porta ${port}`, 'Bootstrap');
}

void bootstrap();
