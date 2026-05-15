import type { ProviderAdapter, ProviderResult } from './types';

const supports = new Set(['ipv4']);
const FEED = 'https://sslbl.abuse.ch/blacklist/sslipblacklist.csv';
const CACHE_TTL_SECONDS = 1800;

export const sslbl: ProviderAdapter = async (indicator, _env, signal) => {
  const now = new Date().toISOString();
  const base = (status: ProviderResult['status'], extra: Partial<ProviderResult> = {}): ProviderResult => ({
    source: 'sslbl',
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
    if (!res.ok) return base('error', { error: `${res.status}` });
    const text = await res.text();

    const ips = new Set<string>();
    for (const line of text.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const parts = t.split(',');
      if (parts.length >= 1 && /^\d+\.\d+\.\d+\.\d+$/.test(parts[0]!)) ips.add(parts[0]!);
    }

    const hit = ips.has(indicator.value.toLowerCase());

    return base('ok', {
      score: hit ? 85 : 0,
      verdict: hit ? 'malicious' : 'clean',
      tags: hit ? ['sslbl', 'abuse-ch', 'malicious-ssl', 'botnet-c2'] : [],
      raw_summary: { listed: hit, list_size: ips.size, source: 'sslbl.abuse.ch' },
    });
  } catch (err) {
    return base('error', { error: err instanceof Error ? err.message : String(err) });
  }
};
