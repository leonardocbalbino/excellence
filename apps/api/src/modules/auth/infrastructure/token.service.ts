import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { AuthClient } from '@excellence/shared';
import { errors, jwtVerify, SignJWT } from 'jose';
import { AppConfig } from '../../../config/app-config';
import type { AuthPrincipal, TokenType } from '../domain/auth-principal';

const ISSUER = 'excellence-api';
const AUDIENCE = 'excellence';
const ALGORITHM = 'HS256';
export const MFA_TOKEN_TTL_SECONDS = 300;

const TOKEN_TYPES: readonly TokenType[] = ['access', 'mfa_challenge', 'mfa_enrollment'];

export class InvalidTokenError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'InvalidTokenError';
  }
}

export interface IssuedToken {
  token: string;
  expiresIn: number;
}

/** Emite e valida JWTs de curta duração (ADR 0006). */
@Injectable()
export class TokenService {
  private readonly key: Uint8Array;
  private readonly accessTtl: number;

  constructor(config: AppConfig) {
    this.key = new TextEncoder().encode(config.get('JWT_SECRET'));
    this.accessTtl = config.get('ACCESS_TOKEN_TTL_SECONDS');
  }

  issueAccessToken(subject: { userId: string; companyId: string; sessionId: string }) {
    return this.sign('access', subject, this.accessTtl, { sid: subject.sessionId });
  }

  issueMfaToken(
    type: 'mfa_challenge' | 'mfa_enrollment',
    subject: { userId: string; companyId: string },
    client: AuthClient,
  ): Promise<IssuedToken> {
    return this.sign(type, subject, MFA_TOKEN_TTL_SECONDS, { cl: client });
  }

  async verify(token: string): Promise<AuthPrincipal> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        issuer: ISSUER,
        audience: AUDIENCE,
        algorithms: [ALGORITHM],
        requiredClaims: ['sub', 'jti', 'exp'],
      });
      const { sub, jti, cid, typ, sid, cl } = payload;
      if (
        typeof sub !== 'string' ||
        typeof jti !== 'string' ||
        typeof cid !== 'string' ||
        !TOKEN_TYPES.includes(typ as TokenType)
      ) {
        throw new InvalidTokenError('Claims inválidas');
      }
      return {
        userId: sub,
        companyId: cid,
        tokenType: typ as TokenType,
        tokenId: jti,
        ...(typeof sid === 'string' ? { sessionId: sid } : {}),
        ...(cl === 'web' || cl === 'mobile' ? { client: cl } : {}),
      };
    } catch (error) {
      if (error instanceof InvalidTokenError) throw error;
      if (error instanceof errors.JOSEError) throw new InvalidTokenError(error.code);
      throw error;
    }
  }

  private async sign(
    type: TokenType,
    subject: { userId: string; companyId: string },
    ttlSeconds: number,
    extra: Record<string, string>,
  ): Promise<IssuedToken> {
    const token = await new SignJWT({ cid: subject.companyId, typ: type, ...extra })
      .setProtectedHeader({ alg: ALGORITHM })
      .setSubject(subject.userId)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setJti(randomUUID())
      .setIssuedAt()
      .setExpirationTime(`${ttlSeconds}s`)
      .sign(this.key);
    return { token, expiresIn: ttlSeconds };
  }
}
