import type { ProviderAdapter, ProviderResult } from './types';
import { classifyResponseError, classifyThrownError, toProviderError } from '../lib/provider-errors';

const supports = new Set(['ipv4']);
const FEED = 'https://check.torproject.org/exit-addresses';
const CACHE_TTL_SECONDS = 3600;

export const tor: ProviderAdapter = async (indicator, _env, signal) => {
  const now = new Date().toISOString();
  const base = (status: ProviderResult['status'], extra: Partial<ProviderResult> = {}): ProviderResult => ({
    source: 'tor',
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

    const exits = new Set<string>();
    for (const line of text.split(/\r?\n/)) {
      if (line.startsWith('ExitAddress')) {
        const ip = line.split(/\s+/)[1];
        if (ip) exits.add(ip);
      }
    }

    const hit = exits.has(indicator.value);
    return base('ok', {
      score: hit ? 35 : 0,
      verdict: hit ? 'suspicious' : 'clean',
      tags: hit ? ['tor-exit'] : [],
      raw_summary: { listed: hit, exit_count: exits.size },
    });
  } catch (err) {
    return base('error', toProviderError(classifyThrownError(err)));
  }
};
