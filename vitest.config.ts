import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // The /api package runs under @cloudflare/vitest-pool-workers
    // (own vitest.config.ts) and uses imports like `cloudflare:test`
    // that don't resolve in this jsdom runner. Exclude its tree so a
    // root-level `npm test` doesn't try to load worker tests here.
    exclude: ['**/node_modules/**', '**/dist/**', 'api/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'src/test/', 'api/**', '**/*.d.ts', '**/*.config.*', '**/dist/**'],
    },
  },
});
