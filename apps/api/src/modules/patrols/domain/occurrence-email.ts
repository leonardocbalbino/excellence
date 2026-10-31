import { formatOccurrenceNumber } from '@excellence/shared';

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
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * E-mail da ocorrência aos destinatários do posto (administração, síndico…). Texto puro e
 * HTML simples; a foto vai como anexo. Todo texto do usuário é escapado no HTML.
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
  const text = [
    ...rows.map(([label, value]) => `${label}: ${value}`),
    '',
    'Registro:',
    data.description,
    '',
    data.hasPhoto ? 'Foto em anexo.' : 'Sem foto.',
  ].join('\n');
  const html = [
    `<h2 style="font-family:Arial,sans-serif;color:#0f5a52;margin:0 0 12px">Ocorrência ${escapeHtml(number)}</h2>`,
    '<table style="font-family:Arial,sans-serif;font-size:14px;border-collapse:collapse">',
    ...rows.map(
      ([label, value]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#5f6663">${escapeHtml(label)}</td><td style="padding:4px 0"><strong>${escapeHtml(value)}</strong></td></tr>`,
    ),
    '</table>',
    '<h3 style="font-family:Arial,sans-serif;margin:16px 0 6px">Registro</h3>',
    `<p style="font-family:Arial,sans-serif;font-size:14px;white-space:pre-wrap;margin:0">${escapeHtml(data.description)}</p>`,
    `<p style="font-family:Arial,sans-serif;font-size:13px;color:#5f6663;margin-top:16px">${data.hasPhoto ? 'Foto em anexo.' : 'Sem foto.'} Enviado pelo sistema Excellence.</p>`,
  ].join('\n');
  return { subject, text, html };
}
