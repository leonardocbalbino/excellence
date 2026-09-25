import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppConfig } from './app-config';
import { validateEnv } from './env.schema';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      // O .env fica na raiz do monorepo; o processo roda a partir de apps/api.
      envFilePath: ['.env', '../../.env'],
      // Nos testes, o ambiente é definido explicitamente, sem ler o .env local.
      ignoreEnvFile: process.env.NODE_ENV === 'test',
      validate: validateEnv,
      cache: true,
    }),
  ],
  providers: [AppConfig],
  exports: [AppConfig],
})
export class AppConfigModule {}
