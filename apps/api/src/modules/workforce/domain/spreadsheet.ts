import { parse } from 'csv-parse/sync';
import { readSheet } from 'read-excel-file/node';

export interface SheetRow {
  /** Número da linha na planilha (cabeçalho = 1, primeira linha de dados = 2). */
  row: number;
  values: Record<string, string>;
}

export interface ParsedSheet {
  headers: string[];
  rows: SheetRow[];
}

export const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Cabeçalho normalizado: minúsculo, sem acento, com "_" no lugar de espaços e hífens. */
export function normalizeHeader(header: string): string {
  return header
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

/** CSV exportado pelo Excel em português costuma vir em Windows-1252, não UTF-8. */
export function decodeText(buffer: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('windows-1252').decode(buffer);
  }
}

function cellToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  // Células de data do Excel chegam como Date (meia-noite UTC).
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return typeof value === 'string' ? value.trim() : '';
}

function toSheet(matrix: unknown[][]): ParsedSheet {
  const [headerRow = [], ...dataRows] = matrix;
  const headers = headerRow.map((cell) => normalizeHeader(cellToString(cell)));
  const rows: SheetRow[] = [];
  dataRows.forEach((cells, index) => {
    const values: Record<string, string> = {};
    headers.forEach((header, column) => {
      if (header) values[header] = cellToString(cells[column]);
    });
    // Linhas totalmente vazias (comuns no fim de planilhas) são ignoradas.
    if (Object.values(values).some((value) => value !== '')) {
      rows.push({ row: index + 2, values });
    }
  });
  return { headers, rows };
}

export async function parseSpreadsheet(buffer: Buffer, contentType: string): Promise<ParsedSheet> {
  if (contentType === XLSX_TYPE) {
    return toSheet(await readSheet(buffer));
  }
  const records = parse(decodeText(buffer), {
    delimiter: [';', ','],
    bom: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  });
  return toSheet(records);
}

/** Data em DD/MM/AAAA ou AAAA-MM-DD → AAAA-MM-DD (ou null se não reconhecer). */
export function parseSheetDate(value: string): string | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  const [year, month, day] = iso
    ? [iso[1], iso[2], iso[3]]
    : br
      ? [br[3], br[2]?.padStart(2, '0'), br[1]?.padStart(2, '0')]
      : [];
  if (!year || !month || !day) return null;
  const date = new Date(`${year}-${month}-${day}T00:00:00Z`);
  // Recusa datas impossíveis (ex.: 31/02).
  return date.toISOString().slice(0, 10) === `${year}-${month}-${day}`
    ? `${year}-${month}-${day}`
    : null;
}

/** Número de documento que o Excel pode ter lido como número (perdendo zeros à esquerda). */
export function padDocument(value: string, length: number): string {
  const digits = value.replace(/\D/g, '');
  return digits.length > 0 && digits.length < length ? digits.padStart(length, '0') : value;
}
