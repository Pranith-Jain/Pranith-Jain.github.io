import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    cloudflareTest({
      singleWorker: true,
      wrangler: { configPath: '/Users/pranith/Documents/portfolio/wrangler.jsonc' },
      // Provider secrets aren't present in the test environment; provider
      // adapters degrade to 'unsupported' without their key and the
      // url-risk / ioc route tests would never exercise the wiring.
      // Fake keys make the keyed adapters take the mocked-fetch path.
      // Never use real keys here — these values are committed.
      miniflare: {
        bindings: {
          VT_API_KEY: 'test-key',
          GOOGLE_SAFE_BROWSING_API_KEY: 'test-key',
          ABUSEIPDB_API_KEY: 'test-key',
          URLSCAN_API_KEY: 'test-key',
        },
      },
    }),
  ],
  test: {
    testTimeout: 15_000,
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
