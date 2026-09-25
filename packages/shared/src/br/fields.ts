import { z } from 'zod';
import {
  BRAZILIAN_STATES,
  isValidCnpj,
  isValidCpf,
  isValidPis,
  normalizeCnpj,
  normalizeCpf,
} from './documents.js';

/** CPF aceito com ou sem pontuação; armazenado só com dígitos. */
export const cpfSchema = z
  .string()
  .trim()
  .refine(isValidCpf, 'CPF inválido')
  .transform(normalizeCpf);

/** CNPJ numérico ou alfanumérico; armazenado sem pontuação e em maiúsculas. */
export const cnpjSchema = z
  .string()
  .trim()
  .refine(isValidCnpj, 'CNPJ inválido')
  .transform(normalizeCnpj);

export const pisSchema = z
  .string()
  .trim()
  .refine(isValidPis, 'PIS/NIS inválido')
  .transform((value) => value.replace(/\D/g, ''));

export const stateSchema = z.enum(BRAZILIAN_STATES, { error: 'UF inválida' });

export const postalCodeSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/\D/g, ''))
  .pipe(z.string().regex(/^\d{8}$/, 'CEP inválido'));

/** Data de calendário (sem hora), no formato AAAA-MM-DD. */
export const calendarDateSchema = z.iso.date({ error: 'Data inválida (use AAAA-MM-DD)' });

/** Fuso horário IANA (ex.: America/Sao_Paulo). */
export const timezoneSchema = z.string().refine((value) => {
  try {
    new Intl.DateTimeFormat('pt-BR', { timeZone: value });
    return value.includes('/') || value === 'UTC';
  } catch {
    return false;
  }
}, 'Fuso horário inválido');

/** Texto opcional: string vazia vira null. */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => (value?.length ? value : null));
