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
 * Backed by KV rather than the Cache API. KV operations don't count toward
 * the Workers 50-subrequest-per-invocation limit, so 25+ parallel provider
 * lookups won't exhaust the budget on cache hits/misses.
 */
export class ProviderCache {
  private kv: KVNamespace;

  constructor(kv: KVNamespace) {
    this.kv = kv;
  }

  static ttlSeconds(type: IndicatorType, provider?: ProviderId): number {
    if (provider) {
      const override = TTL_OVERRIDES[provider];
      if (override !== undefined) return override;
    }
    return TTL_BY_TYPE[type];
  }

  private kvKey(provider: ProviderId, indicator: Indicator): string {
    const safe = indicator.value.toLowerCase();
    return `ioc:${provider}:${indicator.type}:${safe}`;
  }

  async get(provider: ProviderId, indicator: Indicator): Promise<ProviderResult | null> {
    try {
      const raw = await this.kv.get(this.kvKey(provider, indicator));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as ProviderResult;
      return { ...parsed, cached: true };
    } catch {
      return null;
    }
  }

  async set(provider: ProviderId, indicator: Indicator, value: ProviderResult): Promise<void> {
    try {
      const ttl = ProviderCache.ttlSeconds(indicator.type, provider);
      await this.kv.put(this.kvKey(provider, indicator), JSON.stringify(value), {
        expirationTtl: ttl,
      });
    } catch {
      // non-fatal
    }
  }
}
