import { Global, Inject, Injectable, Module, type OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { AppConfig } from '../../config/app-config';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

@Injectable()
class RedisLifecycle implements OnModuleDestroy {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async onModuleDestroy(): Promise<void> {
    if (this.redis.status === 'wait' || this.redis.status === 'end') {
      this.redis.disconnect();
      return;
    }
    await this.redis.quit();
  }
}

/** Conexão Redis compartilhada (cache e rate limit). O BullMQ terá conexões próprias. */
@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [AppConfig],
      useFactory: (config: AppConfig) =>
        new Redis(config.get('REDIS_URL'), {
          lazyConnect: true,
          // Sem fila infinita de comandos quando o Redis cai: falha rápido.
          maxRetriesPerRequest: 2,
          enableOfflineQueue: true,
        }),
    },
    RedisLifecycle,
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
