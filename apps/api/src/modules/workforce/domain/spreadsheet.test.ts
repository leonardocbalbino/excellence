import { describe, expect, it } from 'vitest';
import {
  decodeText,
  normalizeHeader,
  padDocument,
  parseSheetDate,
  parseSpreadsheet,
  XLSX_TYPE,
} from './spreadsheet';

describe('parseSpreadsheet (CSV)', () => {
  it('lê CSV com ";" e cabeçalhos com acento/espaço, ignorando linhas vazias', async () => {
    const csv =
      'Matrícula;Nome;Data de Admissão\n001;Ana Souza;01/02/2024\n;;\n002;Beto;2024-03-10\n';
    const sheet = await parseSpreadsheet(Buffer.from(csv, 'utf8'), 'text/csv');
    expect(sheet.headers).toEqual(['matricula', 'nome', 'data_de_admissao']);
    expect(sheet.rows).toEqual([
      { row: 2, values: { matricula: '001', nome: 'Ana Souza', data_de_admissao: '01/02/2024' } },
      { row: 4, values: { matricula: '002', nome: 'Beto', data_de_admissao: '2024-03-10' } },
    ]);
  });

  it('lê CSV com "," e BOM', async () => {
    const csv = '﻿matricula,nome\n7,"Silva, João"\n';
    const sheet = await parseSpreadsheet(Buffer.from(csv, 'utf8'), 'text/csv');
    expect(sheet.rows[0]?.values).toEqual({ matricula: '7', nome: 'Silva, João' });
  });

  it('entende CSV em Windows-1252 (exportação comum do Excel)', async () => {
    const latin1 = Buffer.from('nome\nJoão Conceição\n', 'latin1');
    const sheet = await parseSpreadsheet(latin1, 'text/csv');
    expect(sheet.rows[0]?.values.nome).toBe('João Conceição');
  });
});

describe('parseSpreadsheet (XLSX)', () => {
  it('lê a primeira aba, com datas do Excel e números', async () => {
    const { default: writeXlsxFile } = await import('write-excel-file/node');
    const buffer = await writeXlsxFile([
      [{ value: 'Matrícula' }, { value: 'Nome' }, { value: 'CPF' }, { value: 'Data admissão' }],
      [
        { value: 1001 },
        { value: 'Ana Souza' },
        // CPF digitado como número: o zero à esquerda se perde.
        { value: 1234567890 },
        { value: new Date(Date.UTC(2024, 1, 1)), format: 'dd/mm/yyyy' },
      ],
    ]).toBuffer();

    const sheet = await parseSpreadsheet(buffer, XLSX_TYPE);
    expect(sheet.headers).toEqual(['matricula', 'nome', 'cpf', 'data_admissao']);
    expect(sheet.rows).toEqual([
      {
        row: 2,
        values: {
          matricula: '1001',
          nome: 'Ana Souza',
          cpf: '1234567890',
          data_admissao: '2024-02-01',
        },
      },
    ]);
  });
});

describe('utilitários', () => {
  it('normaliza cabeçalhos', () => {
    expect(normalizeHeader('  Matrícula do Gestor ')).toBe('matricula_do_gestor');
    expect(normalizeHeader('data-admissão')).toBe('data_admissao');
  });

  it('decodifica UTF-8 válido sem mexer', () => {
    expect(decodeText(Buffer.from('ação', 'utf8'))).toBe('ação');
  });

  it.each([
    ['01/02/2024', '2024-02-01'],
    ['1/2/2024', '2024-02-01'],
    ['2024-02-01', '2024-02-01'],
    ['31/02/2024', null],
    ['2024/02/01', null],
    ['ontem', null],
  ])('data %s → %s', (input, expected) => {
    expect(parseSheetDate(input)).toBe(expected);
  });

  it('recupera zeros à esquerda de documentos lidos como número', () => {
    expect(padDocument('1234567890', 11)).toBe('01234567890');
    expect(padDocument('529.982.247-25', 11)).toBe('529.982.247-25');
    expect(padDocument('', 11)).toBe('');
  });
});
