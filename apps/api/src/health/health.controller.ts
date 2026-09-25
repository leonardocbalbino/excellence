import { HeadBucketCommand, type S3Client } from '@aws-sdk/client-s3';
import { Controller, Get, Inject, Res, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  type HealthCheckResult,
  HealthCheckService,
  HealthIndicatorService,
} from '@nestjs/terminus';
import type { Response } from 'express';
import type { Redis } from 'ioredis';
import { AppConfig } from '../config/app-config';
import { PrismaService } from '../infrastructure/prisma/prisma.service';
import { REDIS_CLIENT } from '../infrastructure/redis/redis.module';
import { S3_CLIENT } from '../infrastructure/storage/storage.module';

const CHECK_TIMEOUT_MS = 3000;

/**
 * Probes de liveness e readiness. As respostas seguem o formato do Terminus, não o
 * RFC 7807, porque orquestradores e monitores esperam esse corpo inclusive no 503.
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly indicators: HealthIndicatorService,
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(S3_CLIENT) private readonly s3: S3Client,
    private readonly config: AppConfig,
  ) {}

  @Get('live')
  @HealthCheck()
  @ApiOperation({ summary: 'Processo em execução (sem checar dependências)' })
  live(): Promise<HealthCheckResult> {
    return this.health.check([]);
  }

  @Get('ready')
  @HealthCheck()
  @ApiOperation({ summary: 'Pronto para receber tráfego: Postgres, Redis e storage acessíveis' })
  async ready(@Res({ passthrough: true }) res: Response): Promise<unknown> {
    try {
      return await this.health.check([
        () =>
          this.indicators
            .check('database')
            .attempt(async () => {
              await this.prisma.$queryRaw`SELECT 1`;
            })
            .withTimeout(CHECK_TIMEOUT_MS),
        () =>
          this.indicators
            .check('redis')
            .attempt(async () => {
              await this.redis.ping();
            })
            .withTimeout(CHECK_TIMEOUT_MS),
        () =>
          this.indicators
            .check('storage')
            .attempt(async ({ signal }) => {
              await this.s3.send(new HeadBucketCommand({ Bucket: this.config.get('S3_BUCKET') }), {
                abortSignal: signal,
              });
            })
            .withTimeout(CHECK_TIMEOUT_MS),
      ]);
    } catch (error) {
      if (!(error instanceof ServiceUnavailableException)) throw error;
      res.status(error.getStatus());
      return error.getResponse();
    }
  }
}
