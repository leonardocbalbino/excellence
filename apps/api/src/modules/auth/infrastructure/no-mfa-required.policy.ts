import { Injectable } from '@nestjs/common';
import type { MfaPolicy } from '../domain/mfa-policy';

/**
 * Política provisória até existirem perfis (etapa 0.4): o MFA é opcional para todos.
 * Substituída pela política baseada em `roles.requires_mfa`.
 */
@Injectable()
export class NoMfaRequiredPolicy implements MfaPolicy {
  isMfaRequired(): Promise<boolean> {
    return Promise.resolve(false);
  }
}
