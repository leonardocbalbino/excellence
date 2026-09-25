import { node } from '@excellence/eslint-config/node';

export default [
  ...node,
  {
    languageOptions: {
      parserOptions: { tsconfigRootDir: import.meta.dirname },
    },
  },
];
