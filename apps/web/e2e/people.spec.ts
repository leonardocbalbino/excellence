import { expect, test } from '@playwright/test';
import { enrollMfa, login } from './helpers';

/** CPF fictício com dígitos verificadores válidos. */
function cpf(base: string): string {
  const digits = Array.from(base, Number);
  for (const length of [9, 10]) {
    const sum = digits.slice(0, length).reduce((acc, d, i) => acc + d * (length + 1 - i), 0);
    const rest = sum % 11;
    digits.push(rest < 2 ? 0 : 11 - rest);
  }
  return digits.join('');
}

test('RH importa planilha, cria acesso e o funcionário troca a senha temporária', async ({
  page,
}) => {
  // RH: o perfil exige MFA no primeiro login.
  await login(page, 'rh@exemplo.com.br');
  await enrollMfa(page);
  await expect(page.getByRole('heading', { name: 'Olá, Rafael' })).toBeVisible();

  // Importação: envio direto ao storage (MinIO), conferência e gravação.
  await page
    .getByRole('navigation', { name: 'Menu principal' })
    .getByRole('link', { name: 'Funcionários' })
    .click();
  await page.getByRole('link', { name: 'Importar planilha' }).click();
  const csv = [
    'matricula;nome;nome_social;cpf;pis;data_nascimento;email;telefone;data_admissao;unidade;departamento;cargo;sindicato;matricula_gestor',
    `E2E-1;Helena Prado;;${cpf('300000001')};;;;;01/09/2026;MATRIZ;OPS;Vigilante;;0003`,
    `E2E-2;Igor Teles;Iara Teles;${cpf('300000002')};;;;;01/09/2026;CAMPINAS;OPS;Vigilante;;E2E-1`,
  ].join('\n');
  await page.getByLabel('Planilha').setInputFiles({
    name: 'funcionarios.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv, 'utf8'),
  });
  await page.getByRole('button', { name: 'Conferir planilha' }).click();
  await page.getByRole('button', { name: 'Importar 2 funcionários' }).click();
  await expect(page.getByText('2 funcionários importados.').first()).toBeVisible();

  // O nome social prevalece na lista; abre o cadastro e cria o acesso.
  await page.getByRole('link', { name: 'Ver funcionários' }).click();
  await page.getByLabel('Buscar').fill('Teles');
  await page.getByRole('button', { name: 'Buscar' }).click();
  await page.getByRole('link', { name: 'Iara Teles' }).click();
  await expect(page.getByLabel('Gestor direto')).toHaveValue(/.+/);
  await page.getByLabel('E-mail de login').fill('iara@exemplo.com.br');
  await page.getByRole('button', { name: 'Criar acesso' }).click();
  const temporaryPassword = (await page.locator('code').innerText()).trim();
  expect(temporaryPassword).toHaveLength(12);

  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page).toHaveURL(/\/login/);

  // Primeiro acesso: a senha temporária só permite trocar a senha.
  await login(page, 'iara@exemplo.com.br', temporaryPassword);
  await expect(page).toHaveURL(/\/conta\/senha/);
  await page.getByLabel('Senha temporária').fill(temporaryPassword);
  await page.getByLabel('Nova senha', { exact: true }).fill('Minha-senha-e2e-1');
  await page.getByLabel('Repita a nova senha').fill('Minha-senha-e2e-1');
  await page.getByRole('button', { name: 'Salvar nova senha' }).click();
  await expect(page.getByRole('heading', { name: 'Olá, Iara' })).toBeVisible();
});
