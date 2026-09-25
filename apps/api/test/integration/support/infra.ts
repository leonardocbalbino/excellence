import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer } from '@testcontainers/redis';
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';

// Mesmas imagens do docker-compose.yml, para os testes baterem com o ambiente local.
const POSTGRES_IMAGE = 'postgres:16-alpine';
const REDIS_IMAGE = 'redis:7-alpine';
const MINIO_IMAGE = 'cgr.dev/chainguard/minio:latest';

const S3_ACCESS_KEY = 'integration';
const S3_SECRET_KEY = 'integration-secret';

export interface TestInfra {
  env: Record<string, string>;
  stop(): Promise<void>;
}

/** Sobe Postgres, Redis e MinIO reais e devolve as variáveis de ambiente para a API. */
export async function startInfra(): Promise<TestInfra> {
  const [postgres, redis, minio] = await Promise.all([
    new PostgreSqlContainer(POSTGRES_IMAGE).withEnvironment({ TZ: 'UTC', PGTZ: 'UTC' }).start(),
    new RedisContainer(REDIS_IMAGE).start(),
    new GenericContainer(MINIO_IMAGE)
      .withCommand(['server', '/data'])
      .withEnvironment({ MINIO_ROOT_USER: S3_ACCESS_KEY, MINIO_ROOT_PASSWORD: S3_SECRET_KEY })
      .withExposedPorts(9000)
      .withWaitStrategy(Wait.forHttp('/minio/health/live', 9000))
      .start(),
  ]);

  const containers: StartedTestContainer[] = [postgres, redis, minio];

  return {
    env: {
      DATABASE_URL: postgres.getConnectionUri(),
      REDIS_URL: redis.getConnectionUrl(),
      S3_ENDPOINT: `http://${minio.getHost()}:${minio.getMappedPort(9000)}`,
      S3_ACCESS_KEY,
      S3_SECRET_KEY,
      S3_BUCKET: 'integration-bucket',
    },
    stop: async () => {
      await Promise.all(containers.map((container) => container.stop()));
    },
  };
}
