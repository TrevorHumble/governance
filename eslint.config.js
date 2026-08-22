// ESLint flat config; Prettier owns formatting, eslint-config-prettier
// disables stylistic rules here.
const js = require('@eslint/js');
const globals = require('globals');
const prettier = require('eslint-config-prettier');

module.exports = [
  {
    ignores: ['data/**', '.review_state/**', '.run_state/**'],
  },
  js.configs.recommended,
  {
    // Any CommonJS .js file, repo-wide: scripts/, tools/, root config
    // files, and anything added later. No narrower glob, so a file placed
    // outside today's known locations still gets Node globals instead of
    // failing on environment rather than on code.
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off',
    },
  },
  {
    files: ['**/*.mjs'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.node } },
  },
  {
    // Layers Vitest globals on top of the CommonJS/module block above,
    // which still matches these same files and supplies Node globals.
    files: ['tests/**/*.{js,mjs,cjs}'],
    languageOptions: {
      globals: {
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        vi: 'readonly',
      },
    },
  },
  prettier,
];
