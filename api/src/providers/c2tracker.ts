import type { ProviderAdapter, ProviderResult } from './types';
import { classifyResponseError, classifyThrownError, toProviderError } from '../lib/provider-errors';

const supports = new Set(['ipv4']);
const FEED = 'https://raw.githubusercontent.com/drb-ra/C2IntelFeeds/master/feeds/IPC2s.csv';
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
    if (!res.ok) return base('error', toProviderError(classifyResponseError(res)));
    const text = await res.text();

    const ips = new Set(
      text
        .split(/\r?\n/)
        .filter((l) => l && !l.startsWith('#') && !l.startsWith('ip,'))
        .map((l) => l.split(',')[0]?.trim().toLowerCase())
        .filter(Boolean)
    );
    const hit = ips.has(indicator.value.toLowerCase());

    return base('ok', {
      score: hit ? 95 : 0,
      verdict: hit ? 'malicious' : 'clean',
      tags: hit ? ['c2', 'c2-tracker', 'command-and-control', 'drb-c2intelfeeds'] : [],
      raw_summary: { listed: hit, list_size: ips.size, source: 'drb-ra/C2IntelFeeds' },
    });
  } catch (err) {
    return base('error', toProviderError(classifyThrownError(err)));
  }
};
