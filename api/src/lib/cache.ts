// Cloudflare Workers runtime exposes caches.default but the TypeScript
// lib types only define `caches.open()`. Cast is required for `caches.default`.
const CACHE_PLATFORM = caches as unknown as { default: Cache };

export function getCache(): Cache {
  return CACHE_PLATFORM.default;
}

import type { Indicator, ProviderResult } from '../providers/types';

/** One provider's cached result plus its absolute expiry (epoch seconds). */
interface BatchEntry {
  r: ProviderResult;
  exp: number;
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

  /**
   * Batched-mode state. The IOC fan-out checks N providers in a single
   * Worker invocation; doing a per-provider KV get + set (and the Cache
   * API front below) burns ~2N+ subrequests, which on the Workers Free
   * plan trips the 50-subrequests-per-invocation ceiling once N grows
   * past ~12. Batched mode collapses that to ONE KV read (`primeBatch`)
   * and ONE KV write (`flushBatch`) for the whole indicator, keyed by a
   * single combined key holding every provider's result.
   */
  private primed: Record<string, BatchEntry> | null = null;
  private staged: Record<string, BatchEntry> = {};

  constructor(kv: KVNamespace | undefined | null) {
    this.kv = kv ?? null;
  }

  private buildKey(provider: string, indicator: Indicator): string {
    return `provider:${provider}:${indicator.value.toLowerCase()}`;
  }

  private batchKey(indicator: Indicator): string {
    return `iocbatch:${indicator.type}:${indicator.value.toLowerCase()}`;
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

  // ---- Batched mode (used by the IOC fan-out) ------------------------------
  //
  // Every provider result for one indicator lives under a single combined
  // KV key. `primeBatch` reads it once; `getBatched` serves per-provider hits
  // from memory (zero subrequests); `stageBatched` queues fresh results; and
  // `flushBatch` writes them all back in one KV put. This keeps the whole
  // fan-out to 2 cache subrequests total instead of ~2 per provider, staying
  // under the Workers Free-plan 50-subrequests-per-invocation limit.

  /** Load the combined cache entry for `indicator` (one KV read). */
  async primeBatch(indicator: Indicator): Promise<void> {
    this.primed = {};
    this.staged = {};
    if (!this.kv) return;
    try {
      const map = (await this.kv.get(this.batchKey(indicator), 'json')) as Record<string, BatchEntry> | null;
      if (map) this.primed = map;
    } catch {
      /* best-effort — treat as cold */
    }
  }

  /**
   * Per-provider lookup against the primed batch. Returns the cached result
   * (with `cached: true`) when present and unexpired, else null. No subrequest.
   * Caller must have awaited `primeBatch` first.
   */
  getBatched(provider: string): ProviderResult | null {
    const now = Math.floor(Date.now() / 1000);
    const entry = this.primed?.[provider];
    if (entry && entry.exp > now) return { ...entry.r, cached: true };
    return null;
  }

  /** Queue a fresh provider result for the next `flushBatch`. No subrequest. */
  stageBatched(provider: string, indicator: Indicator, data: ProviderResult): void {
    const ttl = ProviderCache.ttlSeconds(indicator.type, provider);
    this.staged[provider] = { r: data, exp: Math.floor(Date.now() / 1000) + ttl };
  }

  /**
   * Write the merged batch (still-valid primed entries + freshly staged ones)
   * back under the combined key in one KV put. The key's TTL tracks the
   * longest-lived entry so storage is bounded; per-entry `exp` gates reads.
   */
  async flushBatch(indicator: Indicator): Promise<void> {
    if (!this.kv) return;
    const now = Math.floor(Date.now() / 1000);
    const merged: Record<string, BatchEntry> = {};
    for (const [p, e] of Object.entries(this.primed ?? {})) {
      if (e.exp > now) merged[p] = e;
    }
    Object.assign(merged, this.staged);
    const entries = Object.values(merged);
    if (entries.length === 0) return;
    const maxExp = entries.reduce((m, e) => Math.max(m, e.exp), now);
    const ttl = Math.max(60, maxExp - now);
    try {
      await this.kv.put(this.batchKey(indicator), JSON.stringify(merged), { expirationTtl: ttl });
    } catch {
      /* best-effort — a cache write failure shouldn't break the request */
    }
  }
}
