import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    cloudflareTest({
      singleWorker: true,
      wrangler: { configPath: '/Users/pranith/Documents/portfolio/wrangler.jsonc' },
    }),
  ],
  test: {
    // Run only the TypeScript sources. Committed `*.test.js` build artifacts
    // in api/test would otherwise be executed alongside the `*.test.ts`
    // sources, producing duplicate and stale runs.
    include: ['**/*.test.ts', '**/*.test.tsx'],
    exclude: ['**/node_modules/**', '**/*.test.js', '**/*.spec.js', '**/*.test.jsx', '**/*.spec.jsx'],
    miniflare: {
      compatibilityFlags: ['nodejs_compat'],
      modules: true,
    },
  },
});
