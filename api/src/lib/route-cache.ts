import type { KVNamespace } from '@cloudflare/workers-types';

const CACHE_BASE = 'https://route-cache.internal/v1';

function req(key: string): Request {
  return new Request(`${CACHE_BASE}/${encodeURIComponent(key)}`);
}

export async function routeCacheGet<T>(key: string): Promise<T | null> {
  try {
    const hit = await (caches as unknown as { default: Cache }).default.match(req(key));
    if (hit) return (await hit.json()) as T;
  } catch {
    /* best-effort */
  }
  return null;
}

export function routeCachePut(key: string, data: unknown, ttlSeconds: number): Promise<void> {
  return (caches as unknown as { default: Cache }).default
    .put(
      req(key),
      new Response(JSON.stringify(data), {
        headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${ttlSeconds}` },
      })
    )
    .catch(() => {});
}

/**
 * L1-first, KV-L2 read with write-through to L1.
 *
 * Collapses repeated reads of the same key in a colo to a single KV read
 * per TTL window: the first miss populates the per-colo Cache-API shadow
 * so subsequent reads (same colo) skip KV entirely. KV is still the
 * cross-colo source of truth — this only adds a free L1 in front of it.
 *
 * Use for route handlers that cache an upstream response under a stable
 * key (e.g. `opensanctions:search:<q>`, `mozilla:tls:<url>`). The TTL
 * should match the KV entry's TTL so the shadow doesn't outlive the
 * canonical value.
 *
 * Returns `{ value, source }` so callers can set a `cached` flag or
 * `X-Cache` header if they want. Never throws — a KV error degrades to
 * `null` (caller falls through to its upstream fetch).
 */
export async function kvBackedGet<T>(
  kv: KVNamespace | undefined | null,
  key: string,
  ttlSeconds: number
): Promise<{ value: T | null; source: 'l1' | 'kv' | 'miss' }> {
  const cache = (caches as unknown as { default: Cache }).default;
  // L1: per-colo Cache API (free, does not count against KV quota).
  try {
    const hit = await cache.match(req(key));
    if (hit) return { value: (await hit.json()) as T, source: 'l1' };
  } catch {
    /* fall through to KV */
  }
  if (!kv) return { value: null, source: 'miss' };
  try {
    const value = (await kv.get(key, 'json')) as T | null;
    if (value !== null) {
      // Write-through to L1 so the next read in this colo skips KV.
      try {
        await cache.put(
          req(key),
          new Response(JSON.stringify(value), {
            headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${ttlSeconds}` },
          })
        );
      } catch {
        /* best-effort — a shadow miss just means the next read hits KV again */
      }
      return { value, source: 'kv' };
    }
  } catch {
    /* KV read error — degrade to miss */
  }
  return { value: null, source: 'miss' };
}

/**
 * Write-through to both L1 (Cache API) and L2 (KV).
 *
 * KV is the cross-colo durable store; L1 is the per-colo free shadow so
 * the next read in this colo is a cache hit. The KV write is fire-and-
 * forget (waitUntil) since the response doesn't depend on it; the L1
 * write is awaited so an immediate same-colo re-read is a hit.
 */
export function kvBackedPut(
  kv: KVNamespace | undefined | null,
  key: string,
  data: unknown,
  ttlSeconds: number,
  waitUntil?: (p: Promise<unknown>) => void
): Promise<void> {
  // L1 write — awaited so a same-colo re-read is a hit.
  const l1 = routeCachePut(key, data, ttlSeconds);
  // L2 write — fire-and-forget if a waitUntil ctx is available, else awaited.
  if (kv) {
    const l2 = kv.put(key, JSON.stringify(data), { expirationTtl: ttlSeconds }).catch(() => {});
    if (waitUntil) waitUntil(l2);
    else return Promise.all([l1, l2]).then(() => undefined);
  }
  return l1;
}
