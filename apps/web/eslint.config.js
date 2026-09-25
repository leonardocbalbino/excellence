import { react } from '@excellence/eslint-config/react';

export default [
  ...react,
  {
    languageOptions: {
      parserOptions: { tsconfigRootDir: import.meta.dirname },
    },
  },
];
