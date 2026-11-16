import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      'reference/**',
      'brand/**',
      'playwright-report/**',
      'test-results/**',
      'client/src/components/brand/**', // copied verbatim from brand/
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: ['server/**/*.{ts,mjs}', 'shared/**/*.ts', 'e2e/**/*.ts', '*.{js,ts}'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['client/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    files: ['shared/src/moderation.ts'], // ported verbatim from reference/ (CLAUDE.md): keep it identical
    rules: { 'no-useless-escape': 'off' },
  },
  {
    files: ['client/src/router.tsx', 'client/src/main.tsx'], // route table, not a component module
    rules: { 'react-refresh/only-export-components': 'off' },
  },
);
