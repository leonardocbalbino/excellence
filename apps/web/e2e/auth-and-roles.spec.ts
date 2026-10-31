import { expect, type Page, test } from '@playwright/test';
import { Secret, TOTP } from 'otpauth';

const PASSWORD = process.env.SEED_PASSWORD ?? 'Excellence@2026';

function totp(secret: string, offsetMs = 0): string {
  return new TOTP({ secret: Secret.fromBase32(secret), digits: 6, period: 30 }).generate({
    timestamp: Date.now() + offsetMs,
  });
}

async function login(page: Page, email: string) {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

test('administrador: cadastro obrigatório de MFA, sessão mantida e criação de perfil', async ({
  page,
}) => {
  await login(page, 'admin@exemplo.com.br');

  // O perfil Administrador exige MFA: primeiro login pede o cadastro.
  await expect(page.getByText('Seu perfil exige verificação em duas etapas')).toBeVisible();
  await expect(page.getByAltText(/QR code/)).toBeVisible();
  const secret = (await page.locator('code').innerText()).trim();
  await page.getByLabel('Código do aplicativo').fill(totp(secret));
  await page.getByRole('button', { name: 'Ativar MFA' }).click();

  const codes = page.getByRole('list', { name: 'Códigos de recuperação' }).getByRole('listitem');
  await expect(codes).toHaveCount(10);
  await expect(page.getByRole('button', { name: 'Continuar' })).toBeDisabled();
  await page.getByLabel('Guardei os códigos de recuperação').check();
  await page.getByRole('button', { name: 'Continuar' }).click();

  // O Administrador não é funcionário (não bate ponto): vai direto para a visão geral.
  await expect(page.getByRole('heading', { name: 'Visão geral' })).toBeVisible();
  await expect(page).toHaveURL(/\/gestao$/);
  await expect(page.getByRole('link', { name: 'Meu espaço' })).toHaveCount(0);

  // Recarregar mantém a sessão (refresh pelo cookie httpOnly).
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Visão geral' })).toBeVisible();

  // Gestão de perfis.
  const nav = page.getByRole('navigation', { name: 'Menu principal' });
  await nav.getByRole('link', { name: 'Perfis de acesso' }).click();
  await expect(page.getByRole('cell', { name: /^RH/ })).toBeVisible();
  await page.getByRole('link', { name: 'Novo perfil' }).click();
  await page.getByLabel('Nome', { exact: true }).fill('Portaria e2e');
  await page.getByRole('checkbox', { name: 'Ver perfis, permissões e escopos' }).check();
  await page.getByRole('checkbox', { name: 'Toda a empresa' }).check();
  await page.getByRole('checkbox', { name: 'Somente os próprios dados' }).uncheck();
  await page.getByRole('button', { name: 'Salvar perfil' }).click();
  await expect(page.getByRole('heading', { name: 'Portaria e2e' })).toBeVisible();

  await nav.getByRole('link', { name: 'Perfis de acesso' }).click();
  await expect(page.getByRole('link', { name: 'Portaria e2e' })).toBeVisible();

  // Consultar a auditoria mostra o próprio login e a criação do perfil.
  await nav.getByRole('link', { name: 'Auditoria' }).click();
  await expect(page.getByRole('cell', { name: 'Perfil criado' }).first()).toBeVisible();
  await expect(page.getByRole('cell', { name: 'MFA ativado' }).first()).toBeVisible();
});

test('funcionário: sem MFA obrigatório, vê só o que o perfil permite e sai', async ({ page }) => {
  await login(page, 'funcionario@exemplo.com.br');
  await expect(page.getByRole('heading', { name: 'Olá, Fábio' })).toBeVisible();

  const nav = page.getByRole('navigation', { name: 'Menu principal' });
  // Só a área pessoal: sem troca para a gestão.
  await expect(nav.getByRole('link')).toHaveText([
    'Início',
    'Registrar ponto',
    'Rondas',
    'Escala',
    'Atestados',
    'Folha',
    'Benefícios',
    'Comunicados',
  ]);
  await expect(page.getByRole('link', { name: 'Área de gestão' })).toHaveCount(0);

  await page.goto('/acesso/perfis');
  await expect(page.getByRole('heading', { name: 'Acesso negado' })).toBeVisible();

  await page.getByRole('button', { name: 'Conta de Fábio Funcionário' }).click();
  await page.getByRole('menuitem', { name: 'Sair' }).click();
  await expect(page).toHaveURL(/\/login/);
  // Depois do logout, o cookie não restaura mais a sessão.
  await page.goto('/');
  await expect(page).toHaveURL(/\/login/);
});

test('credenciais erradas mostram erro sem revelar se o e-mail existe', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill('ninguem@exemplo.com.br');
  await page.getByLabel('Senha').fill('errada');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('alert')).toHaveText('E-mail ou senha inválidos.');
});
