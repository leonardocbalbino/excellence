import { react } from '@excellence/eslint-config/react';
import globals from 'globals';

export default [
  ...react,
  {
    languageOptions: {
      parserOptions: { tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    // Scripts, testes e2e e configs rodam no Node, não no navegador.
    files: ['scripts/**', 'e2e/**', '*.config.ts'],
    languageOptions: { globals: { ...globals.node } },
  },
];
