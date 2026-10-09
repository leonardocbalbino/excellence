import { z } from 'zod';

const isoInstant = z.iso.datetime({ offset: true });

/**
 * Conversa entre o funcionário e o RH (ADR 0020): ocorrências e demais assuntos, em formato
 * de bate-papo. As mensagens não são editadas nem excluídas (são o registro do atendimento).
 */
export const conversationCategorySchema = z.enum([
  'occurrence',
  'time_tracking',
  'benefits',
  'payroll',
  'documents',
  'other',
]);
export type ConversationCategory = z.infer<typeof conversationCategorySchema>;

export const CONVERSATION_CATEGORY_LABELS: Record<ConversationCategory, string> = {
  occurrence: 'Ocorrência',
  time_tracking: 'Ponto e jornada',
  benefits: 'Benefícios',
  payroll: 'Folha e pagamento',
  documents: 'Documentos',
  other: 'Outro assunto',
};

/** `open`: em atendimento; `closed`: encerrada (pode ser reaberta com nova mensagem). */
export const conversationStatusSchema = z.enum(['open', 'closed']);
export type ConversationStatus = z.infer<typeof conversationStatusSchema>;

const messageBody = z.string().trim().min(1, 'Escreva a mensagem').max(4000);

export const conversationStartSchema = z.object({
  category: conversationCategorySchema,
  subject: z.string().trim().min(3, 'Informe o assunto').max(120),
  message: messageBody,
  /** Foto ou PDF já enviado com a finalidade `conversation_attachment`. */
  attachmentFileId: z.uuid().nullish(),
});
export type ConversationStart = z.input<typeof conversationStartSchema>;

export const conversationMessageInputSchema = z.object({
  body: messageBody,
  attachmentFileId: z.uuid().nullish(),
});
export type ConversationMessageInput = z.input<typeof conversationMessageInputSchema>;

export const conversationMessageSchema = z.object({
  id: z.uuid(),
  /** Quem escreveu: o funcionário ou alguém do RH. */
  side: z.enum(['employee', 'hr']),
  author: z.object({ id: z.uuid(), name: z.string() }),
  body: z.string(),
  attachment: z.object({ id: z.uuid(), name: z.string(), contentType: z.string() }).nullable(),
  createdAt: isoInstant,
});
export type ConversationMessage = z.infer<typeof conversationMessageSchema>;

export const conversationSummarySchema = z.object({
  id: z.uuid(),
  category: conversationCategorySchema,
  subject: z.string(),
  status: conversationStatusSchema,
  employee: z.object({ id: z.uuid(), name: z.string(), registrationNumber: z.string() }),
  unit: z.object({ id: z.uuid(), name: z.string() }),
  lastMessage: z.object({
    side: z.enum(['employee', 'hr']),
    preview: z.string(),
    at: isoInstant,
  }),
  /** Mensagens do outro lado ainda não lidas por quem consulta. */
  unread: z.number().int(),
  createdAt: isoInstant,
  closedAt: isoInstant.nullable(),
});
export type ConversationSummary = z.infer<typeof conversationSummarySchema>;

export const conversationDetailSchema = conversationSummarySchema.extend({
  messages: z.array(conversationMessageSchema),
});
export type ConversationDetail = z.infer<typeof conversationDetailSchema>;

export const conversationListQuerySchema = z.object({
  status: conversationStatusSchema.optional(),
  category: conversationCategorySchema.optional(),
});
export type ConversationListQuery = z.input<typeof conversationListQuerySchema>;

/** Total de conversas com mensagens não lidas (selo do menu). */
export const conversationUnreadSchema = z.object({ conversations: z.number().int() });

// ─── Push (app mobile) ────────────────────────────────────────────────────────────

export const pushDeviceInputSchema = z.object({
  /** Token do Expo Push (`ExponentPushToken[...]`). */
  token: z
    .string()
    .trim()
    .regex(/^(Exponent|Expo)PushToken\[[\w-]+\]$/, 'Token de push inválido'),
  platform: z.enum(['ios', 'android']),
});
export type PushDeviceInput = z.input<typeof pushDeviceInputSchema>;
