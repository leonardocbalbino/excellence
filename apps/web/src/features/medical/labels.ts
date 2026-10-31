import type { MedicalCertificate } from '@excellence/shared';
import { formatDate } from '@/lib/format';

export const CERTIFICATE_STATUS: Record<MedicalCertificate['status'], string> = {
  pending: 'Em análise',
  accepted: 'Válido',
  rejected: 'Inválido',
  cancelled: 'Cancelado',
};

export const certificatesQueryKey = ['medical-certificates'] as const;

/** "25/09/2026 a 27/09/2026 (3 dias)" ou "25/09/2026, 08:00–10:00". */
export function certificatePeriod(certificate: MedicalCertificate): string {
  if (certificate.startTime && certificate.endTime) {
    return `${formatDate(certificate.startDate)}, ${certificate.startTime}–${certificate.endTime}`;
  }
  if (certificate.days === 1) return `${formatDate(certificate.startDate)} (1 dia)`;
  return `${formatDate(certificate.startDate)} a ${formatDate(certificate.endDate)} (${certificate.days} dias)`;
}
