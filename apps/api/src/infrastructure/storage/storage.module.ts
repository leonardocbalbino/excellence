import { S3Client } from '@aws-sdk/client-s3';
import { Global, Inject, Injectable, Module, type OnModuleDestroy } from '@nestjs/common';
import { AppConfig } from '../../config/app-config';

export const S3_CLIENT = Symbol('S3_CLIENT');

@Injectable()
class S3Lifecycle implements OnModuleDestroy {
  constructor(@Inject(S3_CLIENT) private readonly s3: S3Client) {}

  onModuleDestroy(): void {
    this.s3.destroy();
  }
}

/** Client do storage S3-compatível. As URLs pré-assinadas chegam na etapa 0.5. */
@Global()
@Module({
  providers: [
    {
      provide: S3_CLIENT,
      inject: [AppConfig],
      useFactory: (config: AppConfig) =>
        new S3Client({
          endpoint: config.get('S3_ENDPOINT'),
          region: config.get('S3_REGION'),
          forcePathStyle: config.get('S3_FORCE_PATH_STYLE'),
          credentials: {
            accessKeyId: config.get('S3_ACCESS_KEY'),
            secretAccessKey: config.get('S3_SECRET_KEY'),
          },
        }),
    },
    S3Lifecycle,
  ],
  exports: [S3_CLIENT],
})
export class StorageModule {}
