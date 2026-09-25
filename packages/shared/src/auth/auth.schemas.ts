import { z } from 'zod';

/** Origem do cliente: define onde o refresh token trafega (cookie no web, corpo no mobile). */
export const authClientSchema = z.enum(['web', 'mobile']);
export type AuthClient = z.infer<typeof authClientSchema>;

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: 'E-mail inválido' }));

export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Informe a senha').max(256),
  client: authClientSchema.default('web'),
});
export type LoginRequest = z.input<typeof loginRequestSchema>;

/** Código TOTP de 6 dígitos ou código de recuperação no formato XXXXX-XXXXX. */
export const mfaCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^(\d{6}|[A-Z0-9]{5}-[A-Z0-9]{5})$/, 'Código inválido');

export const mfaCodeRequestSchema = z.object({ code: mfaCodeSchema });
export type MfaCodeRequest = z.input<typeof mfaCodeRequestSchema>;

export const refreshRequestSchema = z.object({
  // Mobile envia no corpo; o web usa o cookie httpOnly e não envia nada.
  refreshToken: z.string().min(1).max(512).optional(),
  client: authClientSchema.default('web'),
});
export type RefreshRequest = z.input<typeof refreshRequestSchema>;

export const authUserSchema = z.object({
  id: z.uuid(),
  companyId: z.uuid(),
  name: z.string(),
  email: z.string(),
  mfaEnabled: z.boolean(),
});
export type AuthUser = z.infer<typeof authUserSchema>;

export const authenticatedResponseSchema = z.object({
  status: z.literal('authenticated'),
  accessToken: z.string(),
  /** Validade do access token, em segundos. */
  expiresIn: z.number().int(),
  /** Presente só para `client: 'mobile'`. */
  refreshToken: z.string().optional(),
  user: authUserSchema,
});
export type AuthenticatedResponse = z.infer<typeof authenticatedResponseSchema>;

/**
 * Próxima etapa exigida antes da sessão:
 * - `mfa_required`: informar código TOTP ou de recuperação em `/auth/mfa/verify`;
 * - `mfa_enrollment_required`: o perfil exige MFA e o usuário ainda não configurou
 *   (`/auth/mfa/setup` e depois `/auth/mfa/activate`).
 * O `mfaToken` vai no header Authorization dessas chamadas.
 */
export const mfaPendingResponseSchema = z.object({
  status: z.enum(['mfa_required', 'mfa_enrollment_required']),
  mfaToken: z.string(),
  expiresIn: z.number().int(),
});
export type MfaPendingResponse = z.infer<typeof mfaPendingResponseSchema>;

export const loginResponseSchema = z.discriminatedUnion('status', [
  authenticatedResponseSchema,
  mfaPendingResponseSchema,
]);
export type LoginResponse = z.infer<typeof loginResponseSchema>;

export const mfaSetupResponseSchema = z.object({
  /** Segredo em base32, para digitação manual no aplicativo autenticador. */
  secret: z.string(),
  /** URI otpauth:// para gerar o QR code. */
  otpauthUrl: z.string(),
});
export type MfaSetupResponse = z.infer<typeof mfaSetupResponseSchema>;

export const mfaActivateResponseSchema = z.object({
  /** Exibidos uma única vez; o servidor guarda só o hash. */
  recoveryCodes: z.array(z.string()),
  /** Presente quando a ativação foi feita durante o login (cadastro obrigatório). */
  session: authenticatedResponseSchema.optional(),
});
export type MfaActivateResponse = z.infer<typeof mfaActivateResponseSchema>;
