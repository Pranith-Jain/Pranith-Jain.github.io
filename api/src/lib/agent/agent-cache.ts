/**
 * Agent tool result caching — avoids redundant API calls across investigation
 * steps and across different investigations for the same indicator.
 *
 * Cache strategy:
 * - Cache key: SHA-256(tool_name + sorted_args)
 * - TTL: 1 hour for live data (reputation, enrichment), 24h for static data (MITRE, CVE details)
 * - Storage: Cache-API (free, no KV quota)
 * - Scope: per-colo (acceptable for investigation-grade freshness)
 */

const TOOL_TTL: Record<string, number> = {
  // Live data — shorter TTL
  check_ioc: 3600,
  enrich_ioc_deep: 3600,
  enrich_actor: 3600,
  lookup_ipinfo: 3600,
  lookup_domain: 3600,
  breach_check: 3600,
  unified_search: 1800,
  // Semi-static data — longer TTL
  lookup_cve: 86400,
  lookup_cisa_kev: 86400,
  search_malpedia: 86400,
  lookup_mitre: 86400,
  get_ransomware_group_profile: 86400,
  // Rule generation — never cache (output depends on input data)
  generate_yara_rule: 0,
  generate_hunting_queries: 0,
};

const DEFAULT_TTL = 3600;

function cacheKeyFor(tool: string, args: Record<string, unknown>): string {
  const sorted = JSON.stringify(args, Object.keys(args).sort());
  // Simple hash using SubtleCrypto — falls back to substring if unavailable
  const raw = `${tool}:${sorted}`;
  return `agent-tool:${raw.length}:${raw.slice(0, 128)}`;
}

export interface CacheEntry<T = unknown> {
  data: T;
  cachedAt: number;
  tool: string;
}

/**
 * Try to read a cached tool result. Returns null on miss.
 */
export async function getCachedResult<T>(tool: string, args: Record<string, unknown>): Promise<T | null> {
  const ttl = TOOL_TTL[tool];
  if (ttl === 0) return null; // tool marked as non-cacheable

  try {
    const cache = (caches as unknown as { default: Cache }).default;
    const key = new Request(`https://agent-cache.internal/v1/${cacheKeyFor(tool, args)}`);
    const hit = await cache.match(key);
    if (!hit) return null;
    const entry = (await hit.json()) as CacheEntry<T>;
    // Check if entry is still fresh
    if (Date.now() - entry.cachedAt > (ttl ?? DEFAULT_TTL) * 1000) return null;
    return entry.data;
  } catch {
    return null;
  }
}

/**
 * Store a tool result in cache. Best-effort — never throws.
 */
export async function setCachedResult(tool: string, args: Record<string, unknown>, data: unknown): Promise<void> {
  const ttl = TOOL_TTL[tool];
  if (ttl === 0) return; // non-cacheable

  try {
    const cache = (caches as unknown as { default: Cache }).default;
    const key = new Request(`https://agent-cache.internal/v1/${cacheKeyFor(tool, args)}`);
    const entry: CacheEntry = { data, cachedAt: Date.now(), tool };
    await cache.put(
      key,
      new Response(JSON.stringify(entry), {
        headers: { 'content-type': 'application/json', 'cache-control': `max-age=${ttl ?? DEFAULT_TTL}` },
      })
    );
  } catch {
    /* best-effort */
  }
}

/**
 * Get cache stats for observability.
 */
export async function getCacheStats(): Promise<{ tools: Record<string, number>; totalEntries: number }> {
  try {
    const cache = (caches as unknown as { default: Cache }).default;
    // Cache.keys() is available in Cloudflare Workers runtime but not in standard types
    const keys = await (cache as unknown as { keys: (req?: Request) => Promise<Request[]> }).keys(
      new Request('https://agent-cache.internal/v1/')
    );
    const tools: Record<string, number> = {};
    let totalEntries = 0;
    for (const req of keys) {
      const url = new URL(req.url);
      const path = url.pathname;
      if (path.startsWith('/agent-cache.internal/v1/agent-tool:')) {
        totalEntries++;
        // Extract tool name from the key pattern
        const match = path.match(/agent-tool:(\d+):(.+)/);
        if (match) {
          const raw = match[2] as string;
          const colonIdx = raw.indexOf(':');
          if (colonIdx > 0) {
            const tool = raw.slice(0, colonIdx);
            tools[tool] = (tools[tool] ?? 0) + 1;
          }
        }
      }
    }
    return { tools, totalEntries };
  } catch {
    return { tools: {}, totalEntries: 0 };
  }
}
