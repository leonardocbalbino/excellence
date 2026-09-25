import { describe, expect, it } from 'vitest';
import {
  generateRecoveryCode,
  generateTotpCode,
  generateTotpSecret,
  isRecoveryCodeFormat,
  totpUri,
  verifyTotp,
} from './totp';

// 2026-09-25T12:00:00Z, alinhado ao início de um passo de 30 s.
const NOW = Date.UTC(2026, 8, 25, 12, 0, 0);
const STEP = BigInt(NOW / 1000 / 30);

describe('verifyTotp', () => {
  const secret = generateTotpSecret();

  it('aceita o código do passo atual e devolve o passo', () => {
    expect(verifyTotp(secret, generateTotpCode(secret, NOW), NOW, null)).toBe(STEP);
  });

  it('tolera um passo de diferença de relógio para cada lado', () => {
    expect(verifyTotp(secret, generateTotpCode(secret, NOW - 30_000), NOW, null)).toBe(STEP - 1n);
    expect(verifyTotp(secret, generateTotpCode(secret, NOW + 30_000), NOW, null)).toBe(STEP + 1n);
  });

  it('rejeita códigos fora da janela', () => {
    expect(verifyTotp(secret, generateTotpCode(secret, NOW - 90_000), NOW, null)).toBeNull();
    expect(verifyTotp(secret, generateTotpCode(secret, NOW + 90_000), NOW, null)).toBeNull();
  });

  it('rejeita código de outro segredo', () => {
    expect(verifyTotp(generateTotpSecret(), generateTotpCode(secret, NOW), NOW, null)).toBeNull();
  });

  it('impede replay: rejeita passo igual ou anterior ao último usado', () => {
    const code = generateTotpCode(secret, NOW);
    expect(verifyTotp(secret, code, NOW, STEP)).toBeNull();
    const previous = generateTotpCode(secret, NOW - 30_000);
    expect(verifyTotp(secret, previous, NOW, STEP)).toBeNull();
    expect(verifyTotp(secret, code, NOW, STEP - 1n)).toBe(STEP);
  });
});

describe('totpUri', () => {
  it('gera URI otpauth com emissor e conta', () => {
    const uri = totpUri('JBSWY3DPEHPK3PXP', { issuer: 'Excellence', label: 'ana@exemplo.com.br' });
    expect(uri).toMatch(/^otpauth:\/\/totp\/Excellence:ana%40exemplo\.com\.br\?/);
    expect(uri).toContain('secret=JBSWY3DPEHPK3PXP');
    expect(uri).toContain('issuer=Excellence');
  });
});

describe('códigos de recuperação', () => {
  it('seguem o formato XXXXX-XXXXX sem caracteres ambíguos', () => {
    const codes = Array.from({ length: 200 }, generateRecoveryCode);
    for (const code of codes) {
      expect(isRecoveryCodeFormat(code)).toBe(true);
      expect(code).not.toMatch(/[01OIL]/);
    }
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('distingue código TOTP de código de recuperação', () => {
    expect(isRecoveryCodeFormat('123456')).toBe(false);
    expect(isRecoveryCodeFormat('ABCDE-23456')).toBe(true);
  });
});
