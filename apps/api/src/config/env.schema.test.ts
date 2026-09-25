import { describe, expect, it } from 'vitest';
import { InvalidEnvironmentError, validateEnv } from './env.schema';

const minimal = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_ACCESS_KEY: 'key',
  S3_SECRET_KEY: 'secret',
  S3_BUCKET: 'bucket',
  JWT_SECRET: 'x'.repeat(32),
  MFA_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'),
};

describe('validateEnv', () => {
  it('aplica padrões ao ambiente mínimo', () => {
    const env = validateEnv(minimal);
    expect(env).toMatchObject({
      NODE_ENV: 'development',
      API_PORT: 3000,
      API_CORS_ORIGINS: ['http://localhost:5173'],
      LOG_LEVEL: 'info',
      OPENAPI_ENABLED: true,
      S3_REGION: 'us-east-1',
      S3_FORCE_PATH_STYLE: true,
    });
  });

  it('converte tipos a partir de strings', () => {
    const env = validateEnv({
      ...minimal,
      API_PORT: '8080',
      OPENAPI_ENABLED: 'false',
      API_CORS_ORIGINS: 'https://a.example, https://b.example ,',
    });
    expect(env.API_PORT).toBe(8080);
    expect(env.OPENAPI_ENABLED).toBe(false);
    expect(env.API_CORS_ORIGINS).toEqual(['https://a.example', 'https://b.example']);
  });

  it('lista todas as variáveis inválidas sem expor valores', () => {
    const secret = 'mysql://root:super-secret@db/x';
    let thrown: unknown;
    try {
      validateEnv({ ...minimal, DATABASE_URL: secret, S3_BUCKET: undefined });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(InvalidEnvironmentError);
    const { issues, message } = thrown as InvalidEnvironmentError;
    expect(issues.map((issue) => issue.split(':')[0])).toEqual(['DATABASE_URL', 'S3_BUCKET']);
    expect(message).not.toContain('super-secret');
  });

  it('exige JWT_SECRET longo e chave MFA de 32 bytes', () => {
    expect(() => validateEnv({ ...minimal, JWT_SECRET: 'curto' })).toThrow(/JWT_SECRET/);
    expect(() =>
      validateEnv({ ...minimal, MFA_ENCRYPTION_KEY: Buffer.alloc(16).toString('base64') }),
    ).toThrow(/MFA_ENCRYPTION_KEY/);
  });

  it.each([
    ['false', false],
    ['true', true],
    ['2', 2],
    ['10.0.0.0/8, loopback', '10.0.0.0/8, loopback'],
  ])('interpreta TRUST_PROXY=%j', (raw, expected) => {
    expect(validateEnv({ ...minimal, TRUST_PROXY: raw }).TRUST_PROXY).toEqual(expected);
  });

  it('rejeita porta fora da faixa', () => {
    expect(() => validateEnv({ ...minimal, API_PORT: '70000' })).toThrow(InvalidEnvironmentError);
  });
});
