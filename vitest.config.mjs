import { defineConfig } from 'vitest/config';

// Globals + node environment: the ported tests rely on vitest's global
// describe/it/expect. testTimeout and retry come from the source config's own
// recorded lesson: pwsh cold starts on Linux CI blow past the 5000 ms
// default, so tool-invoking tests need real headroom.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.js'],
    testTimeout: 30000,
    retry: 2,
  },
});
