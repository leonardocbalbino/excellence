import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer } from '@testcontainers/redis';
import { GenericContainer, Wait } from 'testcontainers';

const apiDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../api');
export const E2E_API_PORT = 3100;

async function waitForHealth(url: string, api: ChildProcess, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (api.exitCode !== null) throw new Error(`A API encerrou (código ${api.exitCode})`);
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // ainda subindo
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`A API não respondeu em ${url}`);
}

/**
 * Infraestrutura efêmera do e2e: Postgres, Redis e MinIO em containers descartáveis, migrations
 * (`migrate deploy`), seed e a API buildada. Nada é apagado: cada execução começa num banco
 * novo, e os containers somem no fim.
 */
export default async function globalSetup(): Promise<() => Promise<void>> {
  const [postgres, redis, minio] = await Promise.all([
    new PostgreSqlContainer('postgres:16-alpine')
      .withEnvironment({ TZ: 'UTC', PGTZ: 'UTC' })
      .start(),
    new RedisContainer('redis:7-alpine').start(),
    new GenericContainer('cgr.dev/chainguard/minio:latest')
      .withCommand(['server', '/data'])
      .withEnvironment({ MINIO_ROOT_USER: 'e2e', MINIO_ROOT_PASSWORD: 'e2e-secret-key' })
      .withExposedPorts(9000)
      .withWaitStrategy(Wait.forHttp('/minio/health/live', 9000))
      .start(),
  ]);

  // O navegador envia arquivos direto ao storage: o endereço precisa ser acessível dele.
  const s3 = {
    S3_ENDPOINT: `http://localhost:${minio.getMappedPort(9000)}`,
    S3_ACCESS_KEY: 'e2e',
    S3_SECRET_KEY: 'e2e-secret-key',
    S3_BUCKET: 'e2e-bucket',
  };
  const client = new S3Client({
    endpoint: s3.S3_ENDPOINT,
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: { accessKeyId: s3.S3_ACCESS_KEY, secretAccessKey: s3.S3_SECRET_KEY },
  });
  await client.send(new CreateBucketCommand({ Bucket: s3.S3_BUCKET }));
  client.destroy();

  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    NODE_ENV: 'production',
    API_PORT: String(E2E_API_PORT),
    DATABASE_URL: postgres.getConnectionUri(),
    REDIS_URL: redis.getConnectionUrl(),
    ...s3,
    LOG_LEVEL: 'warn',
    OPENAPI_ENABLED: 'false',
    SEED_PASSWORD: process.env.SEED_PASSWORD ?? 'Excellence@2026',
  };

  const require = createRequire(resolve(apiDir, 'package.json'));
  execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'], {
    cwd: apiDir,
    env,
    stdio: 'inherit',
  });
  execFileSync(process.execPath, [require.resolve('tsx/cli'), 'prisma/seed.ts'], {
    cwd: apiDir,
    env: { ...env, NODE_ENV: 'test' },
    stdio: 'inherit',
  });

  const api = spawn(process.execPath, ['dist/main.js'], { cwd: apiDir, env, stdio: 'inherit' });
  await waitForHealth(`http://localhost:${E2E_API_PORT}/health/live`, api);

  return async () => {
    api.kill();
    await Promise.all([postgres.stop(), redis.stop(), minio.stop()]);
  };
}
