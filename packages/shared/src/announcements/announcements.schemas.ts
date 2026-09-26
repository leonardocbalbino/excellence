import { z } from 'zod';

const isoInstant = z.iso.datetime({ offset: true });

export const announcementStatusSchema = z.enum(['draft', 'published', 'archived']);
export type AnnouncementStatus = z.infer<typeof announcementStatusSchema>;

/**
 * Público do comunicado: sem unidades nem departamentos, vale para toda a empresa; senão,
 * para quem está lotado em alguma das unidades ou em algum dos departamentos.
 */
export const announcementAudienceSchema = z.object({
  unitIds: z.array(z.uuid()).max(200).default([]),
  departmentIds: z.array(z.uuid()).max(200).default([]),
});

export const announcementInputSchema = z.object({
  title: z.string().trim().min(3, 'Informe o título').max(200),
  /** Texto simples; quebras de linha são preservadas na exibição. */
  body: z.string().trim().min(1, 'Escreva o comunicado').max(20_000),
  requiresAcknowledgment: z.boolean().default(false),
  expiresAt: isoInstant.nullish(),
  audience: announcementAudienceSchema.default({ unitIds: [], departmentIds: [] }),
});
export type AnnouncementInput = z.input<typeof announcementInputSchema>;

const namedRef = z.object({ id: z.uuid(), name: z.string() });

/** Visão de gestão do comunicado, com contagem de leituras. */
export const announcementSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  body: z.string(),
  requiresAcknowledgment: z.boolean(),
  status: announcementStatusSchema,
  publishedAt: isoInstant.nullable(),
  expiresAt: isoInstant.nullable(),
  archivedAt: isoInstant.nullable(),
  audience: z.object({
    companyWide: z.boolean(),
    units: z.array(namedRef),
    departments: z.array(namedRef),
  }),
  createdBy: z.uuid(),
  createdAt: isoInstant,
  updatedAt: isoInstant,
  stats: z.object({ viewed: z.number().int(), acknowledged: z.number().int() }),
});
export type Announcement = z.infer<typeof announcementSchema>;

export const announcementListQuerySchema = z.object({
  status: announcementStatusSchema.optional(),
});

/** Comunicado no mural do funcionário, com a situação de leitura dele. */
export const myAnnouncementSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  body: z.string(),
  requiresAcknowledgment: z.boolean(),
  publishedAt: isoInstant,
  expiresAt: isoInstant.nullable(),
  viewedAt: isoInstant.nullable(),
  acknowledgedAt: isoInstant.nullable(),
});
export type MyAnnouncement = z.infer<typeof myAnnouncementSchema>;

export const myAnnouncementFeedSchema = z.object({
  items: z.array(myAnnouncementSchema),
  /** Não lidos, ou lidos sem a ciência exigida. */
  pending: z.number().int(),
});
export type MyAnnouncementFeed = z.infer<typeof myAnnouncementFeedSchema>;

/** Situação de cada funcionário do público (no escopo de quem consulta). */
export const announcementReceiptSchema = z.object({
  employee: z.object({ id: z.uuid(), name: z.string(), registrationNumber: z.string() }),
  unit: z.string(),
  department: z.string().nullable(),
  /** Funcionário sem conta de acesso não consegue ler pelo sistema. */
  hasAccount: z.boolean(),
  viewedAt: isoInstant.nullable(),
  acknowledgedAt: isoInstant.nullable(),
});
export type AnnouncementReceipt = z.infer<typeof announcementReceiptSchema>;
