import type { ProviderAdapter, ProviderResult } from './types';
import { classifyResponseError, classifyThrownError, toProviderError } from '../lib/provider-errors';

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
    if (!res.ok) return base('error', toProviderError(classifyResponseError(res)));
    const text = await res.text();

    const ips = new Set<string>();
    for (const line of text.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      // CSV schema is `Firstseen,DstIP,DstPort` — the IP is column 2 (parts[1]),
      // NOT parts[0] (the timestamp, which never matches the IPv4 regex so the
      // set was always empty → every lookup wrongly "clean").
      const parts = t.split(',');
      if (parts.length >= 2 && /^\d+\.\d+\.\d+\.\d+$/.test(parts[1]!)) ips.add(parts[1]!);
    }

    const hit = ips.has(indicator.value.toLowerCase());

    return base('ok', {
      score: hit ? 85 : 0,
      verdict: hit ? 'malicious' : 'clean',
      tags: hit ? ['sslbl', 'abuse-ch', 'malicious-ssl', 'botnet-c2'] : [],
      raw_summary: { listed: hit, list_size: ips.size, source: 'sslbl.abuse.ch' },
    });
  } catch (err) {
    return base('error', toProviderError(classifyThrownError(err)));
  }
};
