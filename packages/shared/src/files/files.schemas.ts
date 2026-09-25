import { z } from 'zod';

const MB = 1024 * 1024;
const IMAGES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'] as const;

/**
 * Finalidades de upload e o que cada uma aceita. O limite de tamanho e o tipo são
 * garantidos pelo próprio storage (política do presigned POST), não só pelo cliente.
 */
export const FILE_PURPOSES = {
  medical_certificate: { contentTypes: ['application/pdf', ...IMAGES], maxBytes: 10 * MB },
  selfie: { contentTypes: ['image/jpeg', 'image/png', 'image/webp'], maxBytes: 5 * MB },
  patrol_occurrence: { contentTypes: IMAGES, maxBytes: 10 * MB },
  document: { contentTypes: ['application/pdf'], maxBytes: 20 * MB },
  spreadsheet_import: {
    contentTypes: ['text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    maxBytes: 10 * MB,
  },
} as const satisfies Record<string, { contentTypes: readonly string[]; maxBytes: number }>;

export type FilePurpose = keyof typeof FILE_PURPOSES;

export const filePurposeSchema = z.enum(
  Object.keys(FILE_PURPOSES) as [FilePurpose, ...FilePurpose[]],
);

export const uploadRequestSchema = z
  .object({
    purpose: filePurposeSchema,
    fileName: z.string().trim().min(1).max(255),
    contentType: z.string().trim().toLowerCase().max(100),
    sizeBytes: z.number().int().positive(),
  })
  .superRefine((value, ctx) => {
    const rules: { contentTypes: readonly string[]; maxBytes: number } =
      FILE_PURPOSES[value.purpose];
    if (!rules.contentTypes.includes(value.contentType)) {
      ctx.addIssue({
        code: 'custom',
        path: ['contentType'],
        message: `Tipo não aceito para esta finalidade. Aceitos: ${rules.contentTypes.join(', ')}`,
      });
    }
    if (value.sizeBytes > rules.maxBytes) {
      ctx.addIssue({
        code: 'custom',
        path: ['sizeBytes'],
        message: `Arquivo acima do limite de ${Math.round(rules.maxBytes / MB)} MB`,
      });
    }
  });
export type UploadRequest = z.input<typeof uploadRequestSchema>;

/** Envio direto ao storage: POST multipart para `url` com `fields` + o arquivo no campo `file`. */
export const uploadTicketSchema = z.object({
  fileId: z.uuid(),
  url: z.string(),
  fields: z.record(z.string(), z.string()),
  expiresAt: z.iso.datetime({ offset: true }),
});
export type UploadTicket = z.infer<typeof uploadTicketSchema>;

export const storedFileSchema = z.object({
  id: z.uuid(),
  purpose: filePurposeSchema,
  originalName: z.string(),
  contentType: z.string(),
  sizeBytes: z.number().int(),
  status: z.enum(['pending', 'uploaded']),
  createdAt: z.iso.datetime({ offset: true }),
});
export type StoredFileInfo = z.infer<typeof storedFileSchema>;

export const downloadLinkSchema = z.object({
  url: z.string(),
  expiresAt: z.iso.datetime({ offset: true }),
});
export type DownloadLink = z.infer<typeof downloadLinkSchema>;
