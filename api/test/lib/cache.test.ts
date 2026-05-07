import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { ProviderCache } from '../../src/lib/cache';
import type { ProviderResult } from '../../src/providers/types';

const sample: ProviderResult = {
  source: 'virustotal',
  status: 'ok',
  score: 50,
  verdict: 'suspicious',
  raw_summary: { detected: 5 },
  tags: [],
  fetched_at: new Date().toISOString(),
  cached: false,
};

describe('ProviderCache', () => {
  let cache: ProviderCache;
  beforeEach(() => {
    cache = new ProviderCache(env.KV_CACHE);
  });

  it('miss returns null', async () => {
    const r = await cache.get('virustotal', { type: 'ipv4', value: '1.1.1.1' });
    expect(r).toBeNull();
  });

  it('set then get returns the same payload with cached=true', async () => {
    await cache.set('virustotal', { type: 'ipv4', value: '1.1.1.1' }, sample);
    const got = await cache.get('virustotal', { type: 'ipv4', value: '1.1.1.1' });
    expect(got?.score).toBe(50);
    expect(got?.cached).toBe(true);
  });

  it('different indicator -> different cache slot', async () => {
    await cache.set('virustotal', { type: 'ipv4', value: '1.1.1.1' }, sample);
    const other = await cache.get('virustotal', { type: 'ipv4', value: '2.2.2.2' });
    expect(other).toBeNull();
  });

  it('different provider -> different cache slot', async () => {
    await cache.set('virustotal', { type: 'ipv4', value: '1.1.1.1' }, sample);
    const other = await cache.get('abuseipdb', { type: 'ipv4', value: '1.1.1.1' });
    expect(other).toBeNull();
  });

  it('uses 24h TTL for hash, 1h for ipv4', () => {
    expect(ProviderCache.ttlSeconds('hash')).toBe(86400);
    expect(ProviderCache.ttlSeconds('ipv4')).toBe(3600);
    expect(ProviderCache.ttlSeconds('domain')).toBe(21600);
    expect(ProviderCache.ttlSeconds('url')).toBe(3600);
  });

  it('case-insensitive indicator value (uppercase / lowercase share cache)', async () => {
    await cache.set('virustotal', { type: 'domain', value: 'EXAMPLE.com' }, sample);
    const got = await cache.get('virustotal', { type: 'domain', value: 'example.COM' });
    expect(got?.score).toBe(50);
  });
});
