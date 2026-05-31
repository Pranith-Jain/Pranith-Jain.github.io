// Cloudflare Workers runtime exposes caches.default but the TypeScript
// lib types only define `caches.open()`. Cast is required for `caches.default`.
const CACHE_PLATFORM = caches as unknown as { default: Cache };

export function getCache(): Cache {
  return CACHE_PLATFORM.default;
}

/**
 * KV-backed provider result cache.
 *
 * Caches upstream provider responses (VirusTotal, AbuseIPDB, etc.) to
 * reduce API quota consumption and improve response times. Uses KV with
 * configurable TTL.
 *
 * Gracefully degrades when KV is unavailable — all operations become
 * no-ops so the IOC check still works (just without caching).
 */
export class ProviderCache {
  private kv: KVNamespace | null;

  constructor(kv: KVNamespace | undefined | null) {
    this.kv = kv ?? null;
  }

  /**
   * Get a cached provider result.
   * Returns null if not found, expired, or KV unavailable.
   */
  async get(provider: string, indicator: string): Promise<Record<string, unknown> | null> {
    if (!this.kv) return null;
    const key = `provider:${provider}:${indicator.toLowerCase()}`;
    try {
      const cached = await this.kv.get(key, 'json');
      return cached as Record<string, unknown> | null;
    } catch {
      return null;
    }
  }

  /**
   * Cache a provider result with TTL.
   * Default TTL: 1 hour for successful results, 5 minutes for errors.
   * No-op when KV is unavailable.
   */
  async set(
    provider: string,
    indicator: string,
    data: Record<string, unknown>,
    ttlSeconds: number = 3600
  ): Promise<void> {
    if (!this.kv) return;
    const key = `provider:${provider}:${indicator.toLowerCase()}`;
    try {
      await this.kv.put(key, JSON.stringify(data), { expirationTtl: ttlSeconds });
    } catch {
      /* best-effort — cache failure shouldn't break the request */
    }
  }

  /**
   * Delete a cached provider result.
   * No-op when KV is unavailable.
   */
  async delete(provider: string, indicator: string): Promise<void> {
    if (!this.kv) return;
    const key = `provider:${provider}:${indicator.toLowerCase()}`;
    try {
      await this.kv.delete(key);
    } catch {
      /* best-effort */
    }
  }
}
