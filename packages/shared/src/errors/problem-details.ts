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
  // Autorização
  Forbidden: 'urn:excellence:problem:forbidden',
  MfaSetupRequired: 'urn:excellence:problem:mfa-setup-required',
  PrivilegeEscalation: 'urn:excellence:problem:privilege-escalation',
  LastAdministrator: 'urn:excellence:problem:last-administrator',
  MfaNotEnabled: 'urn:excellence:problem:mfa-not-enabled',
  OwnMfaReset: 'urn:excellence:problem:own-mfa-reset',
  RoleInUse: 'urn:excellence:problem:role-in-use',
  SystemRole: 'urn:excellence:problem:system-role',
  // Arquivos
  FileNotUploaded: 'urn:excellence:problem:file-not-uploaded',
  FileMismatch: 'urn:excellence:problem:file-mismatch',
  // Cadastros
  InUse: 'urn:excellence:problem:in-use',
  OutOfScope: 'urn:excellence:problem:out-of-scope',
  InvalidReference: 'urn:excellence:problem:invalid-reference',
  AccountAlreadyExists: 'urn:excellence:problem:account-already-exists',
  PasswordChangeRequired: 'urn:excellence:problem:password-change-required',
  WeakPassword: 'urn:excellence:problem:weak-password',
  WrongPassword: 'urn:excellence:problem:wrong-password',
  // Jornada
  AssignmentOverlap: 'urn:excellence:problem:assignment-overlap',
  // Ponto
  NoEmployeeRecord: 'urn:excellence:problem:no-employee-record',
  EmployeeTerminated: 'urn:excellence:problem:employee-terminated',
  LocationRequired: 'urn:excellence:problem:location-required',
  SelfieRequired: 'urn:excellence:problem:selfie-required',
  OutsideGeofence: 'urn:excellence:problem:outside-geofence',
  IdempotencyMismatch: 'urn:excellence:problem:idempotency-mismatch',
  OfflineEntryRejected: 'urn:excellence:problem:offline-entry-rejected',
  AdjustmentNotPending: 'urn:excellence:problem:adjustment-not-pending',
  SelfApproval: 'urn:excellence:problem:self-approval',
  MedicalCertificateNotPending: 'urn:excellence:problem:medical-certificate-not-pending',
  AnnouncementNotEditable: 'urn:excellence:problem:announcement-not-editable',
  MedicalCertificateOverlap: 'urn:excellence:problem:medical-certificate-overlap',
  BenefitOverlap: 'urn:excellence:problem:benefit-overlap',
  ConversationClosed: 'urn:excellence:problem:conversation-closed',
  PayrollClosed: 'urn:excellence:problem:payroll-closed',
  // Rondas
  PatrolNotAssigned: 'urn:excellence:problem:patrol-not-assigned',
  PatrolRunOpen: 'urn:excellence:problem:patrol-run-open',
  PatrolRunFinished: 'urn:excellence:problem:patrol-run-finished',
  PatrolInvalidCode: 'urn:excellence:problem:patrol-invalid-code',
  PatrolPointNotInRun: 'urn:excellence:problem:patrol-point-not-in-run',
  PatrolPointAlreadyChecked: 'urn:excellence:problem:patrol-point-already-checked',
  PatrolOutOfOrder: 'urn:excellence:problem:patrol-out-of-order',
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
