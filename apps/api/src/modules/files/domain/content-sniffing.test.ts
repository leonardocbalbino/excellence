import { describe, expect, it } from 'vitest';
import { asciiFileName } from '../application/files.service';
import { matchesDeclaredType } from './content-sniffing';

const bytes = (...values: (number | string)[]) =>
  Uint8Array.from(
    values.flatMap((v) => (typeof v === 'string' ? [...Buffer.from(v, 'latin1')] : [v])),
  );

describe('matchesDeclaredType', () => {
  it.each([
    ['application/pdf', bytes('%PDF-1.7')],
    ['image/jpeg', bytes(0xff, 0xd8, 0xff, 0xe0)],
    ['image/png', bytes(0x89, 'PNG', 0x0d, 0x0a, 0x1a, 0x0a)],
    ['image/webp', bytes('RIFF', 0, 0, 0, 0, 'WEBP')],
    ['image/heic', bytes(0, 0, 0, 0x18, 'ftypheic')],
    ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', bytes('PK', 3, 4)],
    ['text/csv', bytes('nome;cpf\n')],
  ])('reconhece %s', (contentType, content) => {
    expect(matchesDeclaredType(contentType, content)).toBe(true);
  });

  it.each([
    ['application/pdf', bytes('MZ', 0x90, 0)],
    ['image/png', bytes(0xff, 0xd8, 0xff)],
    ['text/csv', bytes('a', 0, 'b')],
    ['text/csv', bytes()],
    ['application/x-desconhecido', bytes('%PDF-')],
  ])('recusa %s com conteúdo incompatível', (contentType, content) => {
    expect(matchesDeclaredType(contentType, content)).toBe(false);
  });
});

describe('asciiFileName', () => {
  it('tira acentos e troca caracteres problemáticos', () => {
    expect(asciiFileName('Atestado "março" \\ ção.pdf')).toBe('Atestado _marco_ _ cao.pdf');
    expect(asciiFileName('日本.pdf')).toBe('__.pdf');
    expect(asciiFileName('linha\nquebrada.pdf')).toBe('linha_quebrada.pdf');
  });
});
