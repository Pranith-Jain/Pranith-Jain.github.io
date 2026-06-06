import type { ProviderAdapter, ProviderResult } from './types';
import { classifyResponseError, classifyThrownError, toProviderError } from '../lib/provider-errors';

const supports = new Set(['ipv4']);
const FEED = 'https://lists.blocklist.de/lists/all.txt';
const CACHE_TTL_SECONDS = 3600;

/**
 * Blocklist.de "all" list. IPs that have attacked Blocklist.de's customers in the
 * last 48 hours. Plain text, one IP per line. Refreshed every 30 minutes upstream.
 */
export const blocklistde: ProviderAdapter = async (indicator, _env, signal) => {
  const now = new Date().toISOString();
  const base = (status: ProviderResult['status'], extra: Partial<ProviderResult> = {}): ProviderResult => ({
    source: 'blocklistde',
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

    const set = new Set<string>();
    for (const line of text.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      set.add(t);
    }

    const hit = set.has(indicator.value);
    return base('ok', {
      score: hit ? 75 : 0,
      verdict: hit ? 'malicious' : 'clean',
      tags: hit ? ['blocklist-de', 'recent-attacker'] : [],
      raw_summary: { listed: hit, list_size: set.size },
    });
  } catch (err) {
    return base('error', toProviderError(classifyThrownError(err)));
  }
};
