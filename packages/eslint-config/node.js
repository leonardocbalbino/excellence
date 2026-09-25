import globals from 'globals';
import tseslint from 'typescript-eslint';
import { base } from './base.js';

export const node = tseslint.config(...base, {
  languageOptions: { globals: { ...globals.node } },
  rules: {
    // NestJS usa classes com decorators e injeção via construtor.
    '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
    '@typescript-eslint/consistent-type-imports': 'off',
  },
});

export default node;
