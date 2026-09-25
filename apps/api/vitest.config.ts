import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// SWC é necessário para emitir metadata de decorators (DI do NestJS).
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
  },
});
