import { z } from 'zod';

/**
 * Identificadores estáveis de tipos de problema (campo `type` da RFC 7807).
 * O cliente decide o tratamento pelo `type`, nunca pelo texto de `title` ou `detail`.
 * Status sem tipo específico usam `about:blank`, e o `title` é a frase padrão do HTTP.
 */
export const ProblemType = {
  Default: 'about:blank',
  Validation: 'urn:excellence:problem:validation-error',
  UniqueViolation: 'urn:excellence:problem:unique-violation',
  ReferenceViolation: 'urn:excellence:problem:reference-violation',
  // Autenticação
  Unauthenticated: 'urn:excellence:problem:unauthenticated',
  InvalidCredentials: 'urn:excellence:problem:invalid-credentials',
  TooManyAttempts: 'urn:excellence:problem:too-many-attempts',
  InvalidRefreshToken: 'urn:excellence:problem:invalid-refresh-token',
  InvalidMfaCode: 'urn:excellence:problem:invalid-mfa-code',
  MfaAlreadyEnabled: 'urn:excellence:problem:mfa-already-enabled',
  MfaSetupNotStarted: 'urn:excellence:problem:mfa-setup-not-started',
} as const;

export type ProblemType = (typeof ProblemType)[keyof typeof ProblemType];

export const problemFieldErrorSchema = z.object({
  path: z.string(),
  message: z.string(),
});

export type ProblemFieldError = z.infer<typeof problemFieldErrorSchema>;

/**
 * Formato de erro padrão da API (RFC 7807, Problem Details for HTTP APIs).
 * `errors` traz as falhas de validação campo a campo, quando houver.
 * `requestId` repete o header `X-Request-Id` para correlacionar com os logs.
 */
export const problemDetailsSchema = z.object({
  type: z.string().default(ProblemType.Default),
  title: z.string(),
  status: z.number().int().min(400).max(599),
  detail: z.string().optional(),
  instance: z.string().optional(),
  requestId: z.string().optional(),
  errors: z.array(problemFieldErrorSchema).optional(),
});

export type ProblemDetails = z.infer<typeof problemDetailsSchema>;

export function isProblemDetails(value: unknown): value is ProblemDetails {
  return problemDetailsSchema.safeParse(value).success;
}
