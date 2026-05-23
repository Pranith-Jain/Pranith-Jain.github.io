import type { ProviderId, ProviderResult, Indicator } from '../providers/types';
import type { IndicatorType } from './indicator';

const TTL_BY_TYPE: Record<IndicatorType, number> = {
  ipv4: 3600,
  ipv6: 3600,
  domain: 21600,
  url: 3600,
  hash: 86400,
  email: 21600,
  unknown: 3600,
};

// Per-provider TTL overrides (seconds). When set, takes precedence over the
// type-based default. Tuned by data velocity:
//   - Live blocklists (urlhaus, threatfox, openphish) — short TTL: a phish
//     URL or active C2 may be taken down within hours.
//   - Aggregated daily lists (cinsarmy, ipsum, sslbl, c2tracker, tor, …) —
//     long TTL: the upstream itself refreshes once a day, so caching past
//     the type-default isn't lying about freshness.
//   - Static / known-good (hashlookup/NSRL) — week+: file hashes are immutable.
const TTL_OVERRIDES: Partial<Record<ProviderId, number>> = {
  urlhaus: 1800,
  threatfox: 1800,
  openphish: 1800,
  sslbl: 14400,
  cinsarmy: 14400,
  ipsum: 14400,
  c2tracker: 14400,
  blocklistde: 14400,
  binarydefense: 14400,
  bitwire: 14400,
  phishingArmy: 14400,
  tor: 14400,
  malwareworld: 14400,
  spamhaus: 14400,
  hashlookup: 604800,
};

/**
 * Per-provider IOC result cache.
 *
 * Backed by the Cloudflare Cache API rather than KV. Cache API operations don't
 * count against the KV daily quota and are colo-local (slightly less consistent
 * across data centers, but for IOC verdicts that's fine — we'd rather burn a
 * fresh upstream call than chew through KV writes for cache hits).
 *
 * The KVNamespace constructor argument is preserved for backwards compatibility
 * with the existing call sites but is no longer used.
 */
export class ProviderCache {
  // Argument retained so the existing `new ProviderCache(c.env.KV_CACHE)` call
  // sites compile without change. Not actually used.
  constructor(_kv?: KVNamespace) {}

  static ttlSeconds(type: IndicatorType, provider?: ProviderId): number {
    if (provider) {
      const override = TTL_OVERRIDES[provider];
      if (override !== undefined) return override;
    }
    return TTL_BY_TYPE[type];
  }

  /** Synthetic URL used as the Cache API key. Must be a valid absolute URL. */
  private static cacheKey(provider: ProviderId, indicator: Indicator): Request {
    const safe = encodeURIComponent(indicator.value.toLowerCase());
    return new Request(`https://ioc-cache.internal/${provider}/${indicator.type}/${safe}`);
  }

  async get(provider: ProviderId, indicator: Indicator): Promise<ProviderResult | null> {
    try {
      const cached = await caches.default.match(ProviderCache.cacheKey(provider, indicator));
      if (!cached) return null;
      const parsed = (await cached.json()) as ProviderResult;
      return { ...parsed, cached: true };
    } catch {
      return null;
    }
  }

  async set(provider: ProviderId, indicator: Indicator, value: ProviderResult): Promise<void> {
    try {
      const ttl = ProviderCache.ttlSeconds(indicator.type, provider);
      const response = new Response(JSON.stringify(value), {
        headers: {
          'content-type': 'application/json',
          'cache-control': `public, max-age=${ttl}, s-maxage=${ttl}`,
        },
      });
      await caches.default.put(ProviderCache.cacheKey(provider, indicator), response);
    } catch {
      // Cache write failed (quota / IO) — non-fatal, just skip caching
    }
  }
}
