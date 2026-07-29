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
