import { defineConfig } from 'tsdown';

// ESM para web/mobile e CJS para a API (NestJS compila em CommonJS).
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  target: 'es2023',
});
