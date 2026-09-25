import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../../../config/app-config';
import { InvalidTokenError, TokenService } from './token.service';

function service(secret = 'a'.repeat(32), ttl = 900): TokenService {
  const values: Record<string, unknown> = { JWT_SECRET: secret, ACCESS_TOKEN_TTL_SECONDS: ttl };
  return new TokenService({ get: (key: string) => values[key] } as unknown as AppConfig);
}

const subject = {
  userId: '01900000-0000-7000-8000-000000000101',
  companyId: '01900000-0000-7000-8000-000000000001',
};

describe('TokenService', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('emite e valida token de acesso com sessão', async () => {
    const tokens = service();
    const { token, expiresIn } = await tokens.issueAccessToken({
      ...subject,
      sessionId: 'family-1',
    });
    expect(expiresIn).toBe(900);
    await expect(tokens.verify(token)).resolves.toMatchObject({
      ...subject,
      tokenType: 'access',
      sessionId: 'family-1',
    });
  });

  it('emite token de MFA com o cliente de origem', async () => {
    const tokens = service();
    const { token, expiresIn } = await tokens.issueMfaToken('mfa_challenge', subject, 'mobile');
    expect(expiresIn).toBe(300);
    const principal = await tokens.verify(token);
    expect(principal).toMatchObject({ tokenType: 'mfa_challenge', client: 'mobile' });
    expect(principal.sessionId).toBeUndefined();
  });

  it('gera jti único por token', async () => {
    const tokens = service();
    const a = await tokens.verify(
      (await tokens.issueMfaToken('mfa_challenge', subject, 'web')).token,
    );
    const b = await tokens.verify(
      (await tokens.issueMfaToken('mfa_challenge', subject, 'web')).token,
    );
    expect(a.tokenId).not.toBe(b.tokenId);
  });

  it('rejeita token assinado com outro segredo', async () => {
    const { token } = await service('b'.repeat(32)).issueAccessToken({
      ...subject,
      sessionId: 's',
    });
    await expect(service().verify(token)).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it('rejeita token expirado', async () => {
    vi.useFakeTimers({ now: Date.UTC(2026, 8, 25, 12) });
    const tokens = service('a'.repeat(32), 60);
    const { token } = await tokens.issueAccessToken({ ...subject, sessionId: 's' });
    vi.setSystemTime(Date.UTC(2026, 8, 25, 12, 1, 1));
    await expect(tokens.verify(token)).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it('rejeita lixo e token adulterado', async () => {
    const tokens = service();
    await expect(tokens.verify('nao-e-jwt')).rejects.toBeInstanceOf(InvalidTokenError);
    const { token } = await tokens.issueAccessToken({ ...subject, sessionId: 's' });
    const [header, , signature] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ sub: 'outro', typ: 'access' })).toString(
      'base64url',
    );
    await expect(tokens.verify(`${header}.${forged}.${signature}`)).rejects.toBeInstanceOf(
      InvalidTokenError,
    );
  });
});
