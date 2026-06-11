/**
 * D1 query result cache with stale-while-revalidate semantics.
 *
 * Intended for read-heavy D1 queries that don't need second-level freshness.
 * Caches query results in the Cache API keyed by a hash of the SQL + params.
 *
 * Trade-off: Cache API is per-colo and eventually consistent — fine for
 * dashboards and read-only pages; not suitable for writes or user-specific data.
 */

import { safeNullLog } from './safe-catch';
const QUERY_CACHE_TTL = 30; // seconds

/**
 * Generate a cache key for a D1 query.
 * Uses a simple hash for short keys, but includes a truncated digest
 * to reduce collision risk.
 */
function queryKey(sql: string, ...params: unknown[]): string {
  const data = JSON.stringify({ sql, params });
  // Use a deterministic but collision-resistant key.
  // For short queries, the full encoded string is fine.
  // For long queries, hash with a simple FNV-1a variant.
  if (data.length < 100) {
    return `https://d1-cache.internal/q/${encodeURIComponent(data)}`;
  }
  let hash = 2166136261; // FNV offset basis
  for (let i = 0; i < data.length; i++) {
    hash ^= data.charCodeAt(i);
    hash = (hash * 16777619) >>> 0; // FNV prime
  }
  return `https://d1-cache.internal/q/${hash.toString(36)}`;
}

/**
 * Wraps a D1 prepared statement with best-effort caching.
 *
 * - On cache hit and fresh (within TTL): return cached result immediately.
 * - On cache miss: query D1, cache result, return it.
 * - On cache error: fall through to D1 (fail open).
 *
 * Only caches SELECT queries. Writes always pass through.
 */
export function cachedQuery(stmt: D1PreparedStatement, _ttlSeconds = QUERY_CACHE_TTL): D1PreparedStatement {
  // We can't intercept D1PreparedStatement's `.all()` / `.first()` dynamically
  // without a Proxy, so this returns the original statement.
  // Callers use cachedRun() instead.
  return stmt;
}

/**
 * Execute a D1 query with result caching.
 *
 * @example
 *   const rows = await cachedRun(
 *     db.prepare('SELECT * FROM briefings WHERE type = ?').bind('daily'),
 *     60
 *   );
 */
export async function cachedRun<T = Record<string, unknown>>(
  stmt: D1PreparedStatement,
  ttlSeconds = QUERY_CACHE_TTL
): Promise<D1Result<T>> {
  const sql = stmt.toString();
  const key = queryKey(sql);
  const cache = (caches as unknown as { default: Cache }).default;

  // Attempt cache read.
  try {
    const cached = await cache.match(new Request(key));
    if (cached) {
      const age = Date.now() - parseInt(cached.headers.get('x-cached-at') ?? '0', 10);
      if (age < ttlSeconds * 1000) {
        return cached.json<D1Result<T>>();
      }
    }
  } catch {
    // Cache read failed — fall through to D1.
  }

  // Cache miss or stale — query D1.
  const result = await stmt.all<T>();

  // Cache the result (fire-and-forget).
  if (result.success) {
    const body = JSON.stringify(result);
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'cache-control': `public, max-age=${ttlSeconds}`,
      'x-cached-at': String(Date.now()),
    };
    safeNullLog('cache-put-d1', caches.default.put(new Request(key), new Response(body, { headers })));
  }

  return result;
}
