// Cloudflare Workers runtime exposes caches.default but the TypeScript
// lib types only define `caches.open()`. Cast is required for `caches.default`.
const CACHE_PLATFORM = caches as unknown as { default: Cache };

export function getCache(): Cache {
  return CACHE_PLATFORM.default;
}

import type { Indicator, ProviderResult } from '../providers/types';

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

  private buildKey(provider: string, indicator: Indicator): string {
    return `provider:${provider}:${indicator.value.toLowerCase()}`;
  }

  private cacheUrl(provider: string, indicator: Indicator): string {
    return `https://provider-cache.internal/v1/${provider}/${indicator.value.toLowerCase()}`;
  }

  private cacheApi(): Cache | null {
    try {
      return (caches as unknown as { default: Cache }).default;
    } catch {
      return null;
    }
  }

  /**
   * Cache TTL (seconds) per indicator type, with per-provider overrides.
   * Hashes are the most stable (24h), IPv4 the most volatile (1h), URLs and
   * domains fall in between. Specific providers override when their
   * upstream feed churns at a different cadence than the type default.
   */
  static ttlSeconds(type: Indicator['type'], provider?: string): number {
    const typeDefault: Record<Indicator['type'], number> = {
      hash: 86400,
      ipv4: 3600,
      ipv6: 3600,
      domain: 21600,
      url: 3600,
      email: 3600,
      unknown: 3600,
    };
    const overrides: Record<string, number> = {
      'urlhaus:url': 1800,
      'sslbl:ipv4': 14400,
      'hashlookup:hash': 604800,
    };
    if (provider) {
      const key = `${provider}:${type}`;
      const override = overrides[key];
      if (override !== undefined) return override;
    }
    return typeDefault[type];
  }

  /**
   * Get a cached provider result.
   * Returns null if not found, expired, or KV unavailable.
   * The returned result's `cached` flag is set to true so callers can
   * distinguish a hit from a fresh upstream response.
   */
  async get(provider: string, indicator: Indicator): Promise<ProviderResult | null> {
    // Check per-colo Cache API first — same-colо repeat queries skip KV entirely
    const cache = this.cacheApi();
    if (cache) {
      try {
        const r = await cache.match(new Request(this.cacheUrl(provider, indicator)));
        if (r) return { ...((await r.json()) as ProviderResult), cached: true };
      } catch {
        /* fall through to KV */
      }
    }
    if (!this.kv) return null;
    const key = this.buildKey(provider, indicator);
    try {
      const cached = (await this.kv.get(key, 'json')) as ProviderResult | null;
      if (cached) {
        // Populate the per-colo cache so the same indicator queried again in
        // this colo doesn't hit KV
        const ttl = ProviderCache.ttlSeconds(indicator.type, provider);
        const cacheResp = new Response(JSON.stringify(cached), {
          headers: { 'cache-control': `public, max-age=${ttl}` },
        });
        if (cache) await cache.put(new Request(this.cacheUrl(provider, indicator)), cacheResp).catch(() => {});
        return { ...cached, cached: true };
      }
      return cached;
    } catch {
      return null;
    }
  }

  /**
   * Cache a provider result with TTL derived from the indicator type.
   * No-op when KV is unavailable.
   */
  async set(provider: string, indicator: Indicator, data: ProviderResult, ttlSeconds?: number): Promise<void> {
    const ttl = ttlSeconds ?? ProviderCache.ttlSeconds(indicator.type, provider);
    if (!this.kv) return;
    const key = this.buildKey(provider, indicator);
    try {
      await this.kv.put(key, JSON.stringify(data), { expirationTtl: ttl });
    } catch {
      /* best-effort — cache failure shouldn't break the request */
    }
    // Write-through to per-colo Cache API so subsequent queries in this colo
    // hit cache before KV
    const cache = this.cacheApi();
    if (cache) {
      const cacheResp = new Response(JSON.stringify(data), {
        headers: { 'cache-control': `public, max-age=${ttl}` },
      });
      await cache.put(new Request(this.cacheUrl(provider, indicator)), cacheResp).catch(() => {});
    }
  }

  /**
   * Delete a cached provider result.
   * No-op when KV is unavailable.
   */
  async delete(provider: string, indicator: Indicator): Promise<void> {
    if (!this.kv) return;
    const key = this.buildKey(provider, indicator);
    try {
      await this.kv.delete(key);
    } catch {
      /* best-effort */
    }
    // Purge from per-colo cache
    const cache = this.cacheApi();
    if (cache) {
      await cache.delete(new Request(this.cacheUrl(provider, indicator))).catch(() => {});
    }
  }
}
