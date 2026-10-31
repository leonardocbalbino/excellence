import { formatOccurrenceNumber } from '@excellence/shared';
import { systemEmailHtml } from '../../notifications/domain/system-email';

export interface OccurrenceEmailData {
  number: number;
  unit: string;
  route: string | null;
  point: string | null;
  employee: string;
  /** Data e hora no fuso do posto, já formatadas (ex.: "30/10/2026 22:14"). */
  when: string;
  description: string;
  hasPhoto: boolean;
  /** Tela de ocorrências no site; sem ela, o e-mail sai sem botão. */
  actionUrl?: string | null;
}

/**
 * E-mail da ocorrência aos destinatários do posto (administração, síndico…), no modelo do
 * sistema. Texto puro e HTML; a foto vai como anexo. Todo texto do usuário é escapado.
 */
export function occurrenceEmail(data: OccurrenceEmailData): {
  subject: string;
  text: string;
  html: string;
} {
  const number = formatOccurrenceNumber(data.number);
  const rows: [string, string][] = [
    ['Ocorrência', number],
    ['Posto', data.unit],
    ['Ronda', data.route ?? 'fora de rota'],
    ['Ponto', data.point ?? 'não informado'],
    ['Registrada por', data.employee],
    ['Data e hora', data.when],
  ];
  const subject = `Ocorrência ${number} · ${data.unit}`;
  const photo = data.hasPhoto ? 'Foto em anexo.' : 'Sem foto.';
  const text = [
    ...rows.map(([label, value]) => `${label}: ${value}`),
    '',
    'Registro:',
    data.description,
    '',
    photo,
    ...(data.actionUrl ? ['', `Ver no sistema: ${data.actionUrl}`] : []),
  ].join('\n');
  const html = systemEmailHtml({
    category: 'Ocorrência de ronda',
    title: `Ocorrência ${number} · ${data.unit}`,
    message: rows
      .slice(2)
      .map(([label, value]) => `${label}: ${value}`)
      .join('\n'),
    info: { label: 'Registro', content: `${data.description}\n\n${photo}` },
    action: data.actionUrl ? { url: data.actionUrl, text: 'Ver ocorrência' } : null,
  });
  return { subject, text, html };
}
