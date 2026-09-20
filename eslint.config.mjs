// Standalone ESLint (flat config). `next lint` is deprecated in Next 15.5 and
// is not used; the Next rules come from @next/eslint-plugin-next directly,
// pinned to the same version as the framework.
//
// Deliberately modest: the recommended sets for TypeScript, React, hooks and
// JSX accessibility, plus Next's own correctness rules. Type-aware linting is
// not enabled -- `npm run typecheck` already runs tsc in strict mode over the
// same files, and the type-aware rule set mostly repeats it.

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import nextPlugin from '@next/eslint-plugin-next';
import globals from 'globals';

export default tseslint.config(
  {
    // Build output, dependencies, committed Quran data and fonts, and the ASR
    // spike (its own package, with its own node_modules).
    ignores: [
      '.next/**',
      '.next-verify/**',
      'node_modules/**',
      'data/**',
      'public/**',
      '.skylos/**',
      'scripts/asr-spike/**',
    ],
  },

  // The application: React 19 in the App Router, TypeScript strict.
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    plugins: {
      react,
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
      '@next/next': nextPlugin,
    },
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: 'detect' } },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat['jsx-runtime'].rules, // no React import needed
      ...reactHooks.configs['recommended-latest'].rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      // The answer-mode options wrap their radio and carry their text in
      // nested spans; the rule stops looking at depth 2 by default. The label
      // and its control are genuinely associated.
      'jsx-a11y/label-has-associated-control': ['error', { depth: 3 }],
      // Unused values are a real smell, but an unused function argument that
      // documents a signature is not, and a leading underscore says so.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
    },
  },

  // The Web Worker: no DOM, its own global scope.
  {
    files: ['src/lib/listen/asr.worker.ts'],
    languageOptions: { globals: globals.worker },
  },

  // Build and data scripts: plain Node ES modules, no React.
  {
    files: ['*.mjs', 'scripts/**/*.mjs', 'scripts/**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { globals: globals.node },
  }
);
