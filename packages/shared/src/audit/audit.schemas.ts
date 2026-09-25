import { z } from 'zod';

export const auditLogSchema = z.object({
  id: z.uuid(),
  occurredAt: z.iso.datetime({ offset: true }),
  actorUserId: z.uuid().nullable(),
  actorIp: z.string().nullable(),
  requestId: z.string().nullable(),
  action: z.string(),
  resourceType: z.string().nullable(),
  resourceId: z.string().nullable(),
  metadata: z.unknown().nullable(),
});
export type AuditLog = z.infer<typeof auditLogSchema>;

export const auditLogQuerySchema = z.object({
  action: z.string().max(100).optional(),
  resourceType: z.string().max(100).optional(),
  resourceId: z.string().max(100).optional(),
  actorUserId: z.uuid().optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  /** Cursor opaco devolvido em `nextCursor` da página anterior. */
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type AuditLogQuery = z.input<typeof auditLogQuerySchema>;

export const auditLogPageSchema = z.object({
  items: z.array(auditLogSchema),
  nextCursor: z.string().nullable(),
});
export type AuditLogPage = z.infer<typeof auditLogPageSchema>;
