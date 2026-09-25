import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { base } from './base.js';

export const react = tseslint.config(...base, {
  files: ['**/*.{ts,tsx}'],
  languageOptions: { globals: { ...globals.browser } },
  plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
  rules: {
    ...reactHooks.configs.recommended.rules,
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    // Handlers como `onClick={() => setOpen(false)}` são idiomáticos em React.
    '@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],
  },
});

export default react;
