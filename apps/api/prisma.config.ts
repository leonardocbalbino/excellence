import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// O Prisma 7 não carrega .env sozinho. Carregamos o .env da raiz do monorepo, se existir.
for (const file of ['.env', '../../.env']) {
  if (existsSync(file)) process.loadEnvFile(file);
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // `prisma generate` não precisa de conexão; migrate/studio exigem DATABASE_URL.
    url: process.env.DATABASE_URL ?? '',
  },
});
