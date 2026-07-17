import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 15_000,
    globals: true,
    environment: 'node',
    include: ['api/test/lib/feed-hardening.test.js'],
    pool: 'forks',
  },
});
