import type { ProviderAdapter, ProviderResult } from './types';

const supports = new Set(['ipv4']);
const FEED = 'https://raw.githubusercontent.com/montysecurity/C2-Tracker/main/data/all.txt';
const CACHE_TTL_SECONDS = 3600;

export const c2tracker: ProviderAdapter = async (indicator, _env, signal) => {
  const now = new Date().toISOString();
  const base = (status: ProviderResult['status'], extra: Partial<ProviderResult> = {}): ProviderResult => ({
    source: 'c2tracker',
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

    const ips = new Set(
      text
        .split(/\r?\n/)
        .map((l) => l.trim().toLowerCase())
        .filter((l) => l && !l.startsWith('#'))
    );
    const hit = ips.has(indicator.value.toLowerCase());

    return base('ok', {
      score: hit ? 95 : 0,
      verdict: hit ? 'malicious' : 'clean',
      tags: hit ? ['c2', 'c2-tracker', 'command-and-control'] : [],
      raw_summary: { listed: hit, list_size: ips.size, source: 'montysecurity/c2-tracker' },
    });
  } catch (err) {
    return base('error', { error: err instanceof Error ? err.message : String(err) });
  }
};
