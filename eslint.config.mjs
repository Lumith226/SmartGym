import js from '@eslint/js';

export default [
  {
    files: ['frontend/server/chat.mjs'],
    rules: js.configs.recommended.rules,
    languageOptions: {
      globals: {
        AbortController: 'readonly',
        AbortSignal: 'readonly',
        Buffer: 'readonly',
        URL: 'readonly',
        clearTimeout: 'readonly',
        process: 'readonly',
        setTimeout: 'readonly',
      },
    },
  },
];
