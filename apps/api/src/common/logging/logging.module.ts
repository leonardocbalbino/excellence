import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { AppConfig } from '../../config/app-config';
import { resolveRequestId } from './request-id';

/**
 * Caminhos removidos dos logs. Cobre credenciais e dados pessoais comuns.
 * Dado sensível de domínio (CID, histórico disciplinar) nunca deve ir para log.
 */
export const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["idempotency-key"]',
  'res.headers["set-cookie"]',
  '*.password',
  '*.passwordHash',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.totpSecret',
  '*.cpf',
];

// Probes chamam o /health a cada poucos segundos e poluiriam o log.
const QUIET_PATHS = new Set(['/health/live', '/health/ready']);

@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        pinoHttp: {
          level: config.get('LOG_LEVEL'),
          genReqId: resolveRequestId,
          redact: { paths: REDACTED_PATHS, censor: '[REDACTED]' },
          autoLogging: { ignore: (req) => QUIET_PATHS.has(req.url ?? '') },
          customLogLevel: (_req, res, err) => {
            if (err || res.statusCode >= 500) return 'error';
            if (res.statusCode >= 400) return 'warn';
            return 'info';
          },
          // Loga só o essencial da requisição; o corpo nunca é logado.
          serializers: {
            req: (req: { id: string; method: string; url: string }) => ({
              id: req.id,
              method: req.method,
              url: req.url,
            }),
            res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
          },
          transport:
            config.get('NODE_ENV') === 'development'
              ? {
                  target: 'pino-pretty',
                  options: { singleLine: true, translateTime: 'SYS:HH:MM:ss.l' },
                }
              : undefined,
        },
      }),
    }),
  ],
})
export class LoggingModule {}
