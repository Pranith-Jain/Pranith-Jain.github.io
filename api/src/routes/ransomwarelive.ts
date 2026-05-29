import type { Context } from 'hono';
import type { Env } from '../env';
import { fetchResilient } from '../lib/fetch-resilient';
import { safeErrorMessage } from '../lib/error';

/**
 * Authenticated caching proxy for the ransomware.live PRO API
 * (https://api-pro.ransomware.live). The PRO API requires an `X-API-KEY`
 * header; the key is a Cloudflare secret (`RANSOMWARELIVE_API_KEY`) so it
 * never reaches the browser. This route injects it server-side, caches the
 * JSON in the edge Cache API, and passes the upstream body through
 * unchanged (shape-agnostic — the frontend renders defensively).
 *
 * "infostealer" is not a standalone upstream endpoint — ransomware.live
 * enriches `/press/recent` and `/victims/recent` with HudsonRock
 * infostealer data inline, so the `cyberattacks` resource carries it.
 *
 * Routes:
 *   GET /api/v1/rl/:resource
 *   GET /api/v1/rl/:resource/:arg     (group / country scoped)
 */

const API_BASE = 'https://api-pro.ransomware.live';
const FETCH_TIMEOUT_MS = 15_000;

interface ResourceSpec {
  /** Builds the upstream path. `arg` is the optional 2nd path segment. */
  path: (arg?: string) => string;
  /** Edge-cache TTL (seconds). */
  ttl: number;
  /** Whether the `:arg` segment is required for this resource. */
  argRequired?: boolean;
}

const RESOURCES: Record<string, ResourceSpec> = {
  stats: { path: () => '/stats', ttl: 3600 },
  // /press/recent — cyberattack press entries, HudsonRock infostealer-enriched.
  cyberattacks: { path: () => '/press/recent', ttl: 1800 },
  // /victims/recent — 100 most recent victims, screenshot + infostealer enriched.
  'victims-recent': { path: () => '/victims/recent', ttl: 1800 },
  // Semantic alias for the infostealer tracker — same upstream as
  // victims-recent (HudsonRock infostealer-enriched), separate cache slot.
  infostealer: { path: () => '/victims/recent', ttl: 1800 },
  groups: { path: () => '/groups', ttl: 21600 },
  negotiations: {
    path: (a) => (a ? `/negotiations/${encodeURIComponent(a)}` : '/negotiations'),
    ttl: 3600,
  },
  yara: {
    path: (a) => (a ? `/yara/${encodeURIComponent(a)}` : '/yara'),
    ttl: 21600,
  },
  csirt: { path: (a) => `/csirt/${encodeURIComponent(a ?? '')}`, ttl: 86400, argRequired: true },
};

/**
 * Edge-cache key for a proxied RL resource. Exported so feed-status can
 * probe the exact cached body a real request would see (same pattern as the
 * other routes' exported CACHE_KEY constants).
 */
export function rlProxyCacheKey(resource: string, arg?: string): string {
  return `https://rl-proxy-cache.internal/v1/${resource}${arg ? `/${arg}` : ''}`;
}

/**
 * Authenticated GET against the RL PRO API, returning parsed JSON (or null
 * on missing key / non-2xx / timeout / parse failure). No edge caching —
 * callers that fan out (e.g. the negotiations aggregator) do their own.
 */
export async function fetchRlUpstream(env: Env, path: string): Promise<unknown | null> {
  const apiKey = env.RANSOMWARELIVE_API_KEY;
  if (!apiKey) return null;
  try {
    const r = await fetchResilient(`${API_BASE}${path}`, {
      headers: { 'X-API-KEY': apiKey, Accept: 'application/json' },
    }, { attempts: 3, timeoutMs: FETCH_TIMEOUT_MS });
    if (!r.ok) return null;
    return (await r.json()) as unknown;
  } catch {
    return null;
  }
}

export async function ransomwareLiveHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const resource = c.req.param('resource') ?? '';
  const arg = c.req.param('arg');
  const spec: ResourceSpec | undefined = RESOURCES[resource];

  if (!spec) {
    return c.json({ error: 'unknown_resource', allowed: Object.keys(RESOURCES) }, 404, {
      'cache-control': 'no-store',
    });
  }
  if (spec.argRequired && !arg) {
    return c.json({ error: 'arg_required', resource }, 400, { 'cache-control': 'no-store' });
  }

  const apiKey = c.env.RANSOMWARELIVE_API_KEY;
  if (!apiKey) {
    return c.json({ error: 'not_configured', detail: 'RANSOMWARELIVE_API_KEY secret is not set' }, 503, {
      'cache-control': 'no-store',
    });
  }

  const cache = (caches as unknown as { default: Cache }).default;
  const cacheReq = new Request(rlProxyCacheKey(resource, arg));
  const cached = await cache.match(cacheReq);
  if (cached) return new Response(cached.body, cached);

  let upstream: Response;
  try {
    upstream = await fetch(`${API_BASE}${spec.path(arg)}`, {
      headers: { 'X-API-KEY': apiKey, Accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    // Scrubbed in production via safeErrorMessage; dev mode (DFIR_DEV_ERRORS=1)
    // gets the full err.message for debugging. Stops fetch/TLS/DNS error
    // text leaking internal probe behaviour to the client.
    return c.json(
      { error: 'upstream_unreachable', detail: safeErrorMessage(c.env as unknown as Record<string, unknown>, err) },
      502,
      { 'cache-control': 'no-store' }
    );
  }

  if (!upstream.ok) {
    // Surface auth/quota/not-found without caching so a transient failure
    // (or a bad key) isn't pinned for the full TTL.
    console.warn('ransomwarelive upstream error', upstream.status);
    return c.json(
      { error: 'upstream_error', upstream_status: upstream.status },
      upstream.status === 401 || upstream.status === 403 ? upstream.status : 502,
      { 'cache-control': 'no-store' }
    );
  }

  let body: unknown;
  try {
    body = await upstream.json();
  } catch {
    return c.json({ error: 'upstream_not_json' }, 502, { 'cache-control': 'no-store' });
  }

  const response = c.json({ resource, arg: arg ?? null, fetched_at: new Date().toISOString(), data: body }, 200, {
    'cache-control': `public, max-age=${spec.ttl}`,
  });
  c.executionCtx.waitUntil(cache.put(cacheReq, response.clone()));
  return response;
}
