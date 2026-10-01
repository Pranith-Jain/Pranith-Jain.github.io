/**
 * Shared types for the MCP tool registrar modules.
 *
 * `worker/mcp-server.ts` used to be a single ~9.6k-line file holding all 418
 * tool registrations inline in one `init()` method. That made it the single
 * largest merge-conflict surface in the repo and impossible to review in
 * isolation. The registrations now live in `worker/mcp-tools/*.ts`, one module
 * per domain.
 *
 * ## How state reaches a registrar
 *
 * Every tool callback is an arrow function that reads `this.env` / `this.apiKey`
 * / `this.tools(...)` at *call* time, not at registration time. So the
 * registrars are handed the `DfirMcpServer` instance itself (typed as
 * `McpToolHost`), and the moved bodies stay byte-for-byte identical — no
 * `self`/`ctx` plumbing, no destructuring, no snapshotting.
 *
 * Two invariants this design depends on:
 *   - `apiKey` MUST be read live off the host. It is assigned in `onConnect`
 *     and only becomes available afterwards, so hoisting it into a local
 *     during registration would capture `undefined` forever.
 *   - Registrar modules MUST be called in ascending source-line order, because
 *     MCP `tools/list` ordering is derived from registration order.
 */

import type { z } from 'zod';

/**
 * Durable Object bindings available to MCP tools.
 *
 * NOTE: this is deliberately *not* `worker/env.ts`'s `Env`. That type is
 * narrower in ways several tools depend on (see `si-promptvault` and
 * `si-shiftlog`, which take the whole env as an `EnvWithDb`), and
 * `si-svg-png` is called with an explicit cast to `import('../env').Env`.
 * Keep this local shape in sync with `worker/mcp-server.ts`'s original
 * definition rather than unifying it with `api/src/env`.
 */
export type Env = {
  /** Static asset binding — used to load the security-investigator
   *  manifest JSON shipped in /public/data/si/. Optional; tools fall back
   *  to a helpful error if the binding is missing or the data wasn't built. */
  ASSETS?: Fetcher;

  KV_CACHE?: KVNamespace;
  BRIEFINGS_DB?: D1Database;
  /** Self-referencing service binding — lets tool calls hit our own /api/* in
   *  process (no public DNS/TLS round-trip). Optional so a missing binding
   *  falls back to a public fetch. */
  SELF?: Fetcher;
  /** Canonical site URL — used instead of hardcoded domain. */
  SITE_URL?: string;
  /** Hudson Rock Cavalier API v3 key. Optional — MCP tools degrade to v2 free
   *  endpoints or return setup instructions when unset. */
  HUDSONROCK_API_KEY?: string;
  /** ChainAbuse API key for btc_abuse_check. Optional — the tool degrades
   *  gracefully (returns unavailable + note) when unset. */
  CHAINABUSE_API_KEY?: string;
  /** Autonomous investigator agent DO — used for deep enrichment analysis. */
  INVESTIGATOR_AGENT?: DurableObjectNamespace;
  /** Secret for signing internal tokens (HMAC-SHA256). Used by tie-enrich for SELF calls. */
  INTERNAL_TOKEN_SECRET?: string;
  /** AlienVault OTX API key — free at otx.alienvault.com. Optional; ti_search_otx degrades to an error when unset. */
  OTX_API_KEY?: string;
  /** Truecaller reverse phone lookup key. Optional; truecaller_lookup degrades to error when unset. */
  TRUECALLER_API_KEY?: string;
  /** IntelligenceX API key (paid). Optional; intelx_search/intelx_phonebook degrade to error when unset. */
  INTELX_API_KEY?: string;
};

/** Shape every MCP tool callback must return. */
export type McpToolResult = { content: Array<{ type: string; text: string }> };

/**
 * The subset of `DfirMcpServer` that tool registrars use.
 *
 * `tools()` and `apiKey` are `private` on the class, but TypeScript `private`
 * is compile-time only, so the instance satisfies this interface structurally.
 * The class casts `this` once, at the top of `init()`.
 */
export interface McpToolHost {
  readonly env: Env;
  /** Read live inside callbacks — assigned in `onConnect`, after registration. */
  readonly apiKey: string | undefined;
  /**
   * Registers a tool. Mirrors the class's own wrapper, which is what applies
   * the per-connection rate limit to every call.
   */
  tools<A extends Record<string, z.ZodTypeAny>>(
    name: string,
    description: string,
    schema: A,
    cb: (args: { [K in keyof A]: z.infer<A[K]> }) => Promise<McpToolResult>
  ): unknown;
}
