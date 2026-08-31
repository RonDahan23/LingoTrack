import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // src/dataconnect-generated is vendor-generated output from an abandoned
  // Firebase Data Connect experiment — nothing in src/ imports it. Linting
  // generated CJS was only ever reporting on code we don't own.
  { ignores: ['dist/**', 'node_modules/**', 'src/generated/**', 'src/dataconnect-generated/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
);
