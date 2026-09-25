import { z } from 'zod';

const commaSeparatedList = z.string().transform((value) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0),
);

/**
 * Variáveis de ambiente aceitas pela API. Se alguma for inválida, a API não inicia.
 * Os valores padrão servem ao ambiente local (docker-compose).
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  API_CORS_ORIGINS: commaSeparatedList.default(['http://localhost:5173']),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  OPENAPI_ENABLED: z.stringbool().default(true),
  // Valor do "trust proxy" do Express: false, true, nº de saltos ou lista de IPs/sub-redes.
  // Define de onde vem o IP do cliente (bloqueio de login, auditoria).
  TRUST_PROXY: z
    .string()
    .default('false')
    .transform((value): boolean | number | string => {
      if (value === 'true' || value === 'false') return value === 'true';
      return /^\d+$/.test(value) ? Number(value) : value;
    }),

  // Autenticação (ADR 0006)
  JWT_SECRET: z.string().min(32, 'Use pelo menos 32 caracteres aleatórios'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  AUTH_COOKIE_SECURE: z.stringbool().default(true),
  // Chave AES-256 em base64 (32 bytes) para cifrar os segredos TOTP.
  MFA_ENCRYPTION_KEY: z
    .base64()
    .refine((value) => Buffer.from(value, 'base64').length === 32, 'Deve ter 32 bytes em base64'),
  MFA_ISSUER: z.string().min(1).default('Excellence'),
  LOGIN_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(5),
  LOGIN_IP_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(50),
  LOGIN_LOCKOUT_MINUTES: z.coerce.number().int().min(1).default(15),

  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  REDIS_URL: z.url({ protocol: /^rediss?$/ }),

  S3_ENDPOINT: z.url(),
  S3_REGION: z.string().min(1).default('us-east-1'),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_BUCKET: z.string().min(3),
  // O MinIO exige path-style (http://host/bucket/chave).
  S3_FORCE_PATH_STYLE: z.stringbool().default(true),
});

export type Env = z.infer<typeof envSchema>;

export class InvalidEnvironmentError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(
      `Configuração de ambiente inválida:\n${issues.map((issue) => `  - ${issue}`).join('\n')}`,
    );
    this.name = 'InvalidEnvironmentError';
  }
}

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    throw new InvalidEnvironmentError(
      // Nunca inclui o valor recebido: pode ser um segredo.
      result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }
  return result.data;
}
