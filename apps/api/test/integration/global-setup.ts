import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import type { TestProject } from 'vitest/node';
import { startInfra, type TestInfra } from './support/infra';

declare module 'vitest' {
  export interface ProvidedContext {
    infraEnv: Record<string, string>;
  }
}

let infra: TestInfra | undefined;

/**
 * Sobe Postgres, Redis e MinIO uma vez para toda a suíte de integração e aplica as
 * migrations com o próprio Prisma CLI, como no deploy.
 */
export async function setup(project: TestProject): Promise<void> {
  infra = await startInfra();
  const prismaCli = resolve(__dirname, '../../node_modules/prisma/build/index.js');
  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    cwd: resolve(__dirname, '../..'),
    env: { ...process.env, DATABASE_URL: infra.env.DATABASE_URL },
    stdio: 'pipe',
  });
  project.provide('infraEnv', infra.env);
}

export async function teardown(): Promise<void> {
  await infra?.stop();
}
