import { fileURLToPath } from 'node:url';
import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    cloudflareTest({
      singleWorker: true,
      // wrangler.jsonc declares an `ai` binding and a KV namespace with
      // `remote: true`; both force the pool to open a REMOTE proxy session
      // (needs Cloudflare credentials). CI has none, so tests fail with
      // "No credentials found". The suite never exercises those remote
      // resources, so stay fully local.
      remoteBindings: false,
      // Resolve relative to this config file, not the local machine — CI
      // checkouts live at a different absolute path (/home/runner/work/...).
      wrangler: { configPath: fileURLToPath(new URL('../wrangler.jsonc', import.meta.url)) },
      // Provider secrets aren't present in the test environment; provider
      // adapters degrade to 'unsupported' without their key and the
      // url-risk / ioc route tests would never exercise the wiring.
      // Fake keys make the keyed adapters take the mocked-fetch path.
      // Never use real keys here — these values are committed.
      miniflare: {
        bindings: {
          // .dev.vars (with OPEN_PUBLIC_READS=true) only exists on the local
          // machine; CI has none, so the SELF worker key-gates keyless GETs
          // (health/ratelimit tests expect 200). Test-only value — mirrors
          // the committed fake provider keys above.
          OPEN_PUBLIC_READS: 'true',
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
