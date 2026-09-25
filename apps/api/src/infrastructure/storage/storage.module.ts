import { S3Client } from '@aws-sdk/client-s3';
import { Global, Inject, Injectable, Module, type OnModuleDestroy } from '@nestjs/common';
import { AppConfig } from '../../config/app-config';

export const S3_CLIENT = Symbol('S3_CLIENT');
/** Client usado só para assinar URLs entregues ao navegador (endpoint público). */
export const S3_PRESIGN_CLIENT = Symbol('S3_PRESIGN_CLIENT');

function createClient(config: AppConfig, endpoint: string): S3Client {
  return new S3Client({
    endpoint,
    region: config.get('S3_REGION'),
    forcePathStyle: config.get('S3_FORCE_PATH_STYLE'),
    credentials: {
      accessKeyId: config.get('S3_ACCESS_KEY'),
      secretAccessKey: config.get('S3_SECRET_KEY'),
    },
  });
}

@Injectable()
class S3Lifecycle implements OnModuleDestroy {
  constructor(
    @Inject(S3_CLIENT) private readonly s3: S3Client,
    @Inject(S3_PRESIGN_CLIENT) private readonly presign: S3Client,
  ) {}

  onModuleDestroy(): void {
    this.s3.destroy();
    this.presign.destroy();
  }
}

/** Clients do storage S3-compatível (ADR 0008). */
@Global()
@Module({
  providers: [
    {
      provide: S3_CLIENT,
      inject: [AppConfig],
      useFactory: (config: AppConfig) => createClient(config, config.get('S3_ENDPOINT')),
    },
    {
      provide: S3_PRESIGN_CLIENT,
      inject: [AppConfig],
      useFactory: (config: AppConfig) =>
        createClient(config, config.get('S3_PUBLIC_ENDPOINT') ?? config.get('S3_ENDPOINT')),
    },
    S3Lifecycle,
  ],
  exports: [S3_CLIENT, S3_PRESIGN_CLIENT],
})
export class StorageModule {}
