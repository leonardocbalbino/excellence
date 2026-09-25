import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { SecretBox } from './secret-box';

const key = () => randomBytes(32).toString('base64');

describe('SecretBox', () => {
  const box = new SecretBox(key());

  it('cifra e decifra', () => {
    const sealed = box.seal('JBSWY3DPEHPK3PXP');
    expect(sealed).toMatch(/^v1\./);
    expect(sealed).not.toContain('JBSWY3DPEHPK3PXP');
    expect(box.open(sealed)).toBe('JBSWY3DPEHPK3PXP');
  });

  it('usa IV aleatório: o mesmo texto gera cifras diferentes', () => {
    expect(box.seal('abc')).not.toBe(box.seal('abc'));
  });

  it('rejeita cifra adulterada (autenticação GCM)', () => {
    const [v, iv, tag, data] = box.seal('segredo').split('.');
    const tampered = Buffer.from(data ?? '', 'base64url');
    tampered[0] = (tampered[0] ?? 0) ^ 1;
    expect(() => box.open([v, iv, tag, tampered.toString('base64url')].join('.'))).toThrow();
  });

  it('rejeita chave diferente', () => {
    expect(() => new SecretBox(key()).open(box.seal('segredo'))).toThrow();
  });

  it('rejeita formato desconhecido e chave de tamanho errado', () => {
    expect(() => box.open('v2.a.b.c')).toThrow(/Formato/);
    expect(() => new SecretBox(randomBytes(16).toString('base64'))).toThrow(/32 bytes/);
  });
});
