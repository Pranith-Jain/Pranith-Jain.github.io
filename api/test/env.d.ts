/// <reference types="@cloudflare/vitest-pool-workers/types" />

/**
 * Type declaration shim for @cloudflare/vitest-pool-workers + the bindings
 * declared in api/wrangler.toml (the vitest-pool-workers test runtime config).
 *
 * `import { env } from 'cloudflare:test'` is typed as the global `Env`
 * interface. wrangler generates this from the config into `.wrangler/types`,
 * but that file is git-ignored and not produced during a plain `tsc` run, so
 * we declare the test bindings here. Add any new `env.*` binding used by tests
 * to both this interface AND api/wrangler.toml.
 */
declare global {
  interface Env {
    KV_CACHE: KVNamespace;
    BRIEFINGS_DB: D1Database;
    AI: Ai;
    OPEN_PUBLIC_READS?: string;
  }
}

export {};
