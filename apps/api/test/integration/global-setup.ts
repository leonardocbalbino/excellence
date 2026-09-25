import { execFileSync } from 'node:child_process';
import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
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
  // Bucket padrão (o teste de health usa um bucket próprio, criado por ele).
  const s3 = new S3Client({
    endpoint: infra.env.S3_ENDPOINT,
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: {
      accessKeyId: infra.env.S3_ACCESS_KEY ?? '',
      secretAccessKey: infra.env.S3_SECRET_KEY ?? '',
    },
  });
  await s3.send(new CreateBucketCommand({ Bucket: infra.env.S3_BUCKET }));
  s3.destroy();

  project.provide('infraEnv', infra.env);
}

export async function teardown(): Promise<void> {
  await infra?.stop();
}
