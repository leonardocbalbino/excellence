import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { AppConfig } from '../../../config/app-config';
import { REDIS_CLIENT } from '../../../infrastructure/redis/redis.module';

export interface ThrottleStatus {
  blocked: boolean;
  /** Segundos até liberar, quando bloqueado. */
  retryAfterSeconds: number;
}

/**
 * Limita tentativas de login com falha, em janela fixa no Redis:
 * - por e-mail + IP (`LOGIN_MAX_ATTEMPTS`): trava o ataque a uma conta sem permitir que
 *   um terceiro bloqueie a conta de outra pessoa a partir de outro IP;
 * - por IP (`LOGIN_IP_MAX_ATTEMPTS`): trava o ataque a muitas contas a partir do mesmo IP.
 * Também limita códigos MFA errados por token de desafio.
 */
@Injectable()
export class LoginThrottler {
  private readonly windowSeconds: number;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: AppConfig,
  ) {
    this.windowSeconds = config.get('LOGIN_LOCKOUT_MINUTES') * 60;
  }

  checkLogin(email: string, ip: string): Promise<ThrottleStatus> {
    return this.check([
      [this.accountKey(email, ip), this.config.get('LOGIN_MAX_ATTEMPTS')],
      [this.ipKey(ip), this.config.get('LOGIN_IP_MAX_ATTEMPTS')],
    ]);
  }

  async registerLoginFailure(email: string, ip: string): Promise<void> {
    await Promise.all([this.increment(this.accountKey(email, ip)), this.increment(this.ipKey(ip))]);
  }

  async clearLogin(email: string, ip: string): Promise<void> {
    await this.redis.del(this.accountKey(email, ip));
  }

  checkMfa(tokenId: string): Promise<ThrottleStatus> {
    return this.check([[this.mfaKey(tokenId), this.config.get('LOGIN_MAX_ATTEMPTS')]]);
  }

  async registerMfaFailure(tokenId: string): Promise<void> {
    await this.increment(this.mfaKey(tokenId));
  }

  private async check(limits: [key: string, max: number][]): Promise<ThrottleStatus> {
    const counts = await this.redis.mget(...limits.map(([key]) => key));
    const exceeded = limits.filter(([, max], i) => Number(counts[i] ?? 0) >= max);
    if (exceeded.length === 0) return { blocked: false, retryAfterSeconds: 0 };
    const ttls = await Promise.all(exceeded.map(([key]) => this.redis.ttl(key)));
    return { blocked: true, retryAfterSeconds: Math.max(1, ...ttls) };
  }

  private async increment(key: string): Promise<void> {
    // A janela começa na primeira falha (NX) e não é renovada a cada tentativa.
    await this.redis.multi().incr(key).expire(key, this.windowSeconds, 'NX').exec();
  }

  private accountKey(email: string, ip: string): string {
    return `auth:fail:account:${email}:${ip}`;
  }

  private ipKey(ip: string): string {
    return `auth:fail:ip:${ip}`;
  }

  private mfaKey(tokenId: string): string {
    return `auth:fail:mfa:${tokenId}`;
  }
}
