import { z } from 'zod';

/**
 * Notificações push do app do funcionário (ADR 0022). O registro do aparelho usa
 * `pushDeviceInputSchema` (em conversations) e `api.push.register`.
 */

/** O que gerou a notificação. O app usa para abrir a tela certa ao tocar. */
export const pushKindSchema = z.enum([
  'patrol_upcoming',
  'patrol_late',
  'clock_in_reminder',
  'clock_out_reminder',
  'announcement',
  'adjustment_decided',
  'certificate_reviewed',
]);
export type PushKind = z.infer<typeof pushKindSchema>;

/** Dados que acompanham a notificação (`data` do Expo). */
export const pushDataSchema = z.object({
  kind: pushKindSchema,
  /** Rota do app a abrir ao tocar (ex.: "/rondas"). */
  url: z.string(),
});
export type PushData = z.infer<typeof pushDataSchema>;
