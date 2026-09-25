import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// Segredos e demais variáveis da API vêm do .env da raiz (local) ou do ambiente (CI). Banco e
// Redis do e2e são containers efêmeros criados no global-setup.
if (existsSync('../../.env')) process.loadEnvFile('../../.env');

const WEB_PORT = 4173;
// Mesma porta usada pelo global-setup para subir a API.
const API_PORT = 3100;

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  // Os cenários compartilham o mesmo banco (ex.: cadastro de MFA do admin): um por vez.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm exec vite preview --port ${WEB_PORT} --strictPort`,
    url: `http://localhost:${WEB_PORT}`,
    env: { VITE_API_PROXY_TARGET: `http://localhost:${API_PORT}` },
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
