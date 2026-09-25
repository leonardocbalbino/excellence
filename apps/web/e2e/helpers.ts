import { expect, type Page } from '@playwright/test';
import { Secret, TOTP } from 'otpauth';

export const SEED_PASSWORD = process.env.SEED_PASSWORD ?? 'Excellence@2026';

export function totp(secret: string, offsetMs = 0): string {
  return new TOTP({ secret: Secret.fromBase32(secret), digits: 6, period: 30 }).generate({
    timestamp: Date.now() + offsetMs,
  });
}

export async function login(page: Page, email: string, password = SEED_PASSWORD): Promise<void> {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

/** Primeiro login de perfil que exige MFA: cadastra o autenticador e devolve o segredo. */
export async function enrollMfa(page: Page): Promise<string> {
  await expect(page.getByText('Seu perfil exige verificação em duas etapas')).toBeVisible();
  await expect(page.getByAltText(/QR code/)).toBeVisible();
  const secret = (await page.locator('code').innerText()).trim();
  await page.getByLabel('Código do aplicativo').fill(totp(secret));
  await page.getByRole('button', { name: 'Ativar MFA' }).click();
  await expect(
    page.getByRole('list', { name: 'Códigos de recuperação' }).getByRole('listitem'),
  ).toHaveCount(10);
  await page.getByLabel('Guardei os códigos de recuperação').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  return secret;
}
