import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  type AuthClient,
  type AuthenticatedResponse,
  type AuthUser,
  type LoginResponse,
  type MfaActivateResponse,
  ProblemType,
} from '@excellence/shared';
import { ProblemException } from '../../../common/errors/problem.exception';
import type { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { AuditService } from '../../audit/application/audit.service';
import type { AuthPrincipal } from '../domain/auth-principal';
import { MFA_POLICY, type MfaPolicy } from '../domain/mfa-policy';
import { LoginThrottler, type ThrottleStatus } from '../infrastructure/login-throttler';
import { PasswordHasher } from '../infrastructure/password-hasher';
import {
  type ClientMetadata,
  type IssuedRefreshToken,
  InvalidRefreshTokenError,
  RefreshTokenService,
} from '../infrastructure/refresh-token.service';
import { TokenService } from '../infrastructure/token.service';
import { invalidMfaCode, MfaService } from './mfa.service';

/** Sessão criada: corpo da resposta + refresh token, que o controller entrega por cookie ou corpo. */
export interface SessionResult {
  body: Omit<AuthenticatedResponse, 'refreshToken'>;
  refresh: IssuedRefreshToken;
  client: AuthClient;
}

export type LoginResult =
  { kind: 'session'; session: SessionResult } | { kind: 'mfa'; body: LoginResponse };

export interface ActivateResult {
  recoveryCodes: MfaActivateResponse['recoveryCodes'];
  session?: SessionResult;
}

interface UserRecord {
  id: string;
  companyId: string;
  name: string;
  email: string;
  mfaEnabled: boolean;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hasher: PasswordHasher,
    private readonly throttler: LoginThrottler,
    private readonly tokens: TokenService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly mfa: MfaService,
    @Inject(MFA_POLICY) private readonly mfaPolicy: MfaPolicy,
    private readonly audit: AuditService,
  ) {}

  async login(
    input: { email: string; password: string; client: AuthClient },
    meta: ClientMetadata,
  ): Promise<LoginResult> {
    assertNotThrottled(await this.throttler.checkLogin(input.email, meta.ip));

    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    const passwordOk = await this.hasher.verify(user?.passwordHash ?? null, input.password);
    if (!user || !passwordOk || !user.isActive) {
      await this.throttler.registerLoginFailure(input.email, meta.ip);
      // E-mail inexistente não tem empresa para auditar; fica só no log de acesso.
      if (user) {
        await this.recordAuth('auth.login_failed', user, meta, {
          reason: passwordOk ? 'inactive_user' : 'wrong_password',
        });
      }
      // Mesma resposta para e-mail inexistente, senha errada ou usuário inativo.
      throw new ProblemException(
        {
          type: ProblemType.InvalidCredentials,
          title: 'Unauthorized',
          status: HttpStatus.UNAUTHORIZED,
          detail: 'E-mail ou senha inválidos.',
        },
        { 'WWW-Authenticate': 'Bearer' },
      );
    }
    await this.throttler.clearLogin(input.email, meta.ip);

    const subject = { userId: user.id, companyId: user.companyId };
    if (user.mfaEnabled) {
      const { token, expiresIn } = await this.tokens.issueMfaToken(
        'mfa_challenge',
        subject,
        input.client,
      );
      return { kind: 'mfa', body: { status: 'mfa_required', mfaToken: token, expiresIn } };
    }
    if (await this.mfaPolicy.isMfaRequired(user)) {
      const { token, expiresIn } = await this.tokens.issueMfaToken(
        'mfa_enrollment',
        subject,
        input.client,
      );
      return {
        kind: 'mfa',
        body: { status: 'mfa_enrollment_required', mfaToken: token, expiresIn },
      };
    }
    return { kind: 'session', session: await this.createSession(user, input.client, meta) };
  }

  /** Conclui o login com o segundo fator (token `mfa_challenge`). */
  async verifyMfa(
    principal: AuthPrincipal,
    code: string,
    meta: ClientMetadata,
  ): Promise<SessionResult> {
    assertNotThrottled(await this.throttler.checkMfa(principal.tokenId));
    if (!(await this.mfa.verifyAndConsume(principal.userId, code))) {
      await this.throttler.registerMfaFailure(principal.tokenId);
      await this.recordAuth(
        'auth.mfa_failed',
        { id: principal.userId, companyId: principal.companyId },
        meta,
      );
      throw invalidMfaCode();
    }
    const user = await this.findActiveUser(principal.userId);
    return this.createSession(user, principal.client ?? 'web', meta, { mfa: true });
  }

  /**
   * Ativa o MFA. Se a chamada veio do cadastro obrigatório durante o login (token
   * `mfa_enrollment`), já abre a sessão.
   */
  async activateMfa(
    principal: AuthPrincipal,
    code: string,
    meta: ClientMetadata,
  ): Promise<ActivateResult> {
    const recoveryCodes = await this.mfa.activate(principal.userId, code);
    await this.recordAuth(
      'auth.mfa_enabled',
      { id: principal.userId, companyId: principal.companyId },
      meta,
    );
    if (principal.tokenType !== 'mfa_enrollment') return { recoveryCodes };
    const user = await this.findActiveUser(principal.userId);
    return {
      recoveryCodes,
      session: await this.createSession(user, principal.client ?? 'web', meta, { mfa: true }),
    };
  }

  async refresh(
    refreshToken: string,
    client: AuthClient,
    meta: ClientMetadata,
  ): Promise<SessionResult> {
    let rotated;
    try {
      rotated = await this.refreshTokens.rotate(refreshToken, meta);
    } catch (error) {
      if (error instanceof InvalidRefreshTokenError) throw invalidRefreshToken();
      throw error;
    }
    const user = await this.findActiveUser(rotated.userId);
    return this.sessionFor(user, rotated, client);
  }

  async logout(refreshToken: string | undefined, meta: ClientMetadata): Promise<void> {
    if (!refreshToken) return;
    const session = await this.refreshTokens.revokeByToken(refreshToken, 'logout');
    if (session) {
      await this.recordAuth(
        'auth.logout',
        { id: session.userId, companyId: session.companyId },
        meta,
      );
    }
  }

  async me(principal: AuthPrincipal): Promise<AuthUser> {
    return toAuthUser(await this.findActiveUser(principal.userId));
  }

  private async createSession(
    user: UserRecord,
    client: AuthClient,
    meta: ClientMetadata,
    details: { mfa: boolean } = { mfa: false },
  ): Promise<SessionResult> {
    const refresh = await this.refreshTokens.issue(user, meta);
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.recordAuth('auth.login_succeeded', user, meta, {
      client,
      mfa: details.mfa,
      sessionId: refresh.familyId,
    });
    return this.sessionFor(user, refresh, client);
  }

  /** Eventos de autenticação acontecem antes do contexto da requisição: tudo explícito. */
  private recordAuth(
    action: string,
    user: { id: string; companyId: string },
    meta: ClientMetadata,
    metadata?: Prisma.InputJsonObject,
  ): Promise<void> {
    return this.audit.record({
      action,
      resourceType: 'user',
      resourceId: user.id,
      companyId: user.companyId,
      actorUserId: user.id,
      actorIp: meta.ip,
      requestId: meta.requestId ?? null,
      metadata: { ...metadata, userAgent: meta.userAgent ?? null },
    });
  }

  private async sessionFor(
    user: UserRecord,
    refresh: IssuedRefreshToken,
    client: AuthClient,
  ): Promise<SessionResult> {
    const access = await this.tokens.issueAccessToken({
      userId: user.id,
      companyId: user.companyId,
      sessionId: refresh.familyId,
    });
    return {
      body: {
        status: 'authenticated',
        accessToken: access.token,
        expiresIn: access.expiresIn,
        user: toAuthUser(user),
      },
      refresh,
      client,
    };
  }

  private async findActiveUser(userId: string): Promise<UserRecord> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.isActive) {
      throw new ProblemException(
        {
          type: ProblemType.Unauthenticated,
          title: 'Unauthorized',
          status: HttpStatus.UNAUTHORIZED,
        },
        { 'WWW-Authenticate': 'Bearer' },
      );
    }
    return user;
  }
}

function toAuthUser(user: UserRecord): AuthUser {
  return {
    id: user.id,
    companyId: user.companyId,
    name: user.name,
    email: user.email,
    mfaEnabled: user.mfaEnabled,
  };
}

function assertNotThrottled(status: ThrottleStatus): void {
  if (!status.blocked) return;
  throw new ProblemException(
    {
      type: ProblemType.TooManyAttempts,
      title: 'Too Many Requests',
      status: HttpStatus.TOO_MANY_REQUESTS,
      detail: 'Muitas tentativas. Aguarde antes de tentar novamente.',
    },
    { 'Retry-After': String(status.retryAfterSeconds) },
  );
}

function invalidRefreshToken(): ProblemException {
  return new ProblemException({
    type: ProblemType.InvalidRefreshToken,
    title: 'Unauthorized',
    status: HttpStatus.UNAUTHORIZED,
    detail: 'Sessão expirada ou encerrada. Entre novamente.',
  });
}
