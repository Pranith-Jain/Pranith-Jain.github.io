import { fileURLToPath } from 'node:url';
import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    cloudflareTest({
      // `singleWorker: true` used to sit here — it is not in the pool's
      // option schema (unknown keys are stripped), so it never did anything.
      // If EADDRNOTAVAIL recurs, set `fileParallelism: false` in the test
      // block below instead.
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
          // .dev.vars (with an OPEN_PUBLIC_READS expiry) only exists on the local
          // machine; CI has none, so the SELF worker key-gates keyless GETs
          // (health/ratelimit tests expect 200). Test-only value — mirrors
          // the committed fake provider keys above. Must be an explicit
          // ISO expiry: the valve rejects bare 'true' (fail closed).
          OPEN_PUBLIC_READS: '2099-01-01T00:00:00.000Z',
          VT_API_KEY: 'test-key',
          GOOGLE_SAFE_BROWSING_API_KEY: 'test-key',
          ABUSEIPDB_API_KEY: 'test-key',
          URLSCAN_API_KEY: 'test-key',
          // HMAC key for DO→API in-process call signing (internal-token.ts).
          // Production sets it with `wrangler secret put`; without it the
          // module fails closed, so routes that self-fetch (ioc-enrich-deep)
          // answered 503 `internal_token_not_configured` and their route
          // tests failed on the first run of the `test-api` job. Test-only
          // value — both the signer and the verifier read this same binding,
          // so any non-empty string is fine. Never use a real secret here.
          INTERNAL_TOKEN_SECRET: 'test-internal-token-secret',
        },
      },
    }),
  ],
  test: {
    // 30s: cold-cache loader routes can spend 15s on one upstream fetch
    // (ransomwhere) + 10s on transfer fetches ≈ 25s before degrading to
    // empty — 15s turned that into a flaky timeout instead of a green test.
    testTimeout: 30_000,
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
