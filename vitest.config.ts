import { defineConfig } from 'vitest/config';

// Kept separate from vite.config.ts so unit tests do not load the IWSDK dev
// plugin. Only the pure guitar logic is unit tested; the full app is covered
// by tests/air-guitar.e2e.mjs in the managed browser.
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
