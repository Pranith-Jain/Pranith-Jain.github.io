import type { ProviderAdapter, ProviderResult } from './types';

const supports = new Set(['ipv4', 'ipv6']);
const FEED = 'https://raw.githubusercontent.com/X4BNet/lists_vpn/main/output/vpn/ipv4.txt';
const CACHE_TTL_SECONDS = 3600;

export const x4bnet: ProviderAdapter = async (indicator, _env, signal) => {
  const now = new Date().toISOString();
  const base = (status: ProviderResult['status'], extra: Partial<ProviderResult> = {}): ProviderResult => ({
    source: 'x4bnet',
    status,
    score: 0,
    verdict: 'unknown',
    raw_summary: {},
    tags: [],
    fetched_at: now,
    cached: false,
    ...extra,
  });

  if (!supports.has(indicator.type)) return base('unsupported');

  try {
    const res = await fetch(FEED, { signal, cf: { cacheTtl: CACHE_TTL_SECONDS, cacheEverything: true } });
    if (!res.ok) return base('error', { error: `${res.status} ${res.statusText}`.trim() });
    const text = await res.text();

    const ips = new Set<string>();
    for (const line of text.split(/\r?\n/)) {
      const t = line.trim();
      if (t && !t.startsWith('#')) ips.add(t);
    }

    const hit = ips.has(indicator.value);
    return base('ok', {
      score: hit ? 70 : 0,
      verdict: hit ? 'suspicious' : 'clean',
      tags: hit ? ['vpn-endpoint', 'x4bnet-vpn'] : [],
      raw_summary: { listed: hit, feed_size: ips.size, source: 'X4BNet VPN list' },
    });
  } catch (err) {
    return base('error', { error: err instanceof Error ? err.message : String(err) });
  }
};
