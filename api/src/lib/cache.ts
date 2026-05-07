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

export class ProviderCache {
  constructor(private kv: KVNamespace) {}

  static ttlSeconds(type: IndicatorType): number {
    return TTL_BY_TYPE[type];
  }

  static key(provider: ProviderId, indicator: Indicator): string {
    return `prov:${provider}:${indicator.type}:${indicator.value.toLowerCase()}`;
  }

  async get(provider: ProviderId, indicator: Indicator): Promise<ProviderResult | null> {
    const raw = await this.kv.get(ProviderCache.key(provider, indicator));
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as ProviderResult;
      return { ...parsed, cached: true };
    } catch {
      return null;
    }
  }

  async set(provider: ProviderId, indicator: Indicator, value: ProviderResult): Promise<void> {
    const ttl = ProviderCache.ttlSeconds(indicator.type);
    await this.kv.put(ProviderCache.key(provider, indicator), JSON.stringify(value), {
      expirationTtl: ttl,
    });
  }
}
