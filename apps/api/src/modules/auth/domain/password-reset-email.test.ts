import { describe, expect, it } from 'vitest';
import { passwordResetEmail } from './password-reset-email';

describe('passwordResetEmail', () => {
  it('leva o link no botão e no texto, e escapa o nome', () => {
    const link = 'https://gestaoexcellence.com.br/redefinir-senha?token=abc123';
    const mail = passwordResetEmail({ name: 'Ana <b>Lima</b>', link });
    expect(mail.subject).toBe('Redefinição de senha · Excellence');
    expect(mail.html).toContain(`href="${link}"`);
    expect(mail.html).toContain('Criar senha nova');
    expect(mail.html).toContain('Ana &lt;b&gt;Lima&lt;/b&gt;');
    expect(mail.text).toContain(link);
    expect(mail.text).toContain('30 minutos');
  });
});
