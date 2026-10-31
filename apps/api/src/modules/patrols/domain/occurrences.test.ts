import { formatOccurrenceNumber } from '@excellence/shared';
import { describe, expect, it } from 'vitest';
import { occurrenceEmail } from './occurrence-email';
import { checkProximity, requiredPoints } from './proximity';

describe('checkProximity', () => {
  it('ponto sem localização cadastrada aceita a leitura', () => {
    expect(checkProximity({ status: 'no_fence', distanceMeters: null }, null, null)).toEqual({
      ok: true,
    });
  });

  it('dentro do raio aceita; sem posição do aparelho recusa', () => {
    expect(checkProximity({ status: 'inside', distanceMeters: 8 }, 20, 5).ok).toBe(true);
    expect(checkProximity({ status: 'no_location', distanceMeters: null }, 20, null)).toEqual({
      ok: false,
      reason: 'no_location',
    });
  });

  it('fora do raio: desconta a imprecisão do GPS até 30 m', () => {
    // 35 m de distância, raio de 20 m, GPS com 18 m de imprecisão: 17 m ≤ 20 → aceita.
    expect(checkProximity({ status: 'outside', distanceMeters: 35 }, 20, 18).ok).toBe(true);
    // Imprecisão de 200 m não libera: só 30 m contam. 80 - 30 = 50 > 20 → recusa.
    expect(checkProximity({ status: 'outside', distanceMeters: 80 }, 20, 200)).toEqual({
      ok: false,
      reason: 'too_far',
      distanceMeters: 80,
      radiusMeters: 20,
    });
  });
});

describe('requiredPoints', () => {
  it('sem mínimo, todos; com mínimo, nunca acima do total', () => {
    expect(requiredPoints(null, 6)).toBe(6);
    expect(requiredPoints(4, 6)).toBe(4);
    expect(requiredPoints(10, 6)).toBe(6);
  });
});

describe('occurrenceEmail', () => {
  it('monta assunto com o número e escapa o texto do usuário no HTML', () => {
    expect(formatOccurrenceNumber(42)).toBe('N00042');
    const mail = occurrenceEmail({
      number: 42,
      unit: 'Condomínio Maple Bear',
      route: 'Ronda noturna',
      point: 'Garagem',
      employee: 'Fábio Vigia',
      when: '30/10/2026 22:14',
      description: 'Portão <script>aberto</script> & sem trava',
      hasPhoto: true,
    });
    expect(mail.subject).toBe('Ocorrência N00042 · Condomínio Maple Bear');
    expect(mail.text).toContain('Ponto: Garagem');
    expect(mail.html).toContain('&lt;script&gt;aberto&lt;/script&gt; &amp; sem trava');
    expect(mail.html).not.toContain('<script>');
    // Modelo do sistema (preto e dourado), sem botão quando não há endereço do site.
    expect(mail.html).toContain('Ocorrência de ronda');
    expect(mail.html).toContain('background-color:#171717');
    expect(mail.html).not.toContain('Ver ocorrência');
  });

  it('com o endereço do site, leva o botão para a tela de ocorrências', () => {
    const mail = occurrenceEmail({
      number: 7,
      unit: 'Reserva Lagoa',
      route: null,
      point: null,
      employee: 'Carlos',
      when: '01/11/2026 20:10',
      description: 'Lâmpada queimada',
      hasPhoto: false,
      actionUrl: 'https://gestaoexcellence.com.br/gestao/rondas/ocorrencias',
    });
    expect(mail.html).toContain('href="https://gestaoexcellence.com.br/gestao/rondas/ocorrencias"');
    expect(mail.html).toContain('Ver ocorrência');
    expect(mail.text).toContain('Ver no sistema: https://gestaoexcellence.com.br');
  });
});
