import type { ProviderAdapter, ProviderResult } from './types';
import { classifyResponseError, classifyThrownError, toProviderError } from '../lib/provider-errors';

const supports = new Set(['ipv4']);
const FEED = 'https://cinsscore.com/list/ci-badguys.txt';
const CACHE_TTL_SECONDS = 3600;

/**
 * CINS Army List — daily-updated bad-actor IPs from the CINS scoring system.
 * Free, no key. Plain text, one IP per line.
 */
export const cinsarmy: ProviderAdapter = async (indicator, _env, signal) => {
  const now = new Date().toISOString();
  const base = (status: ProviderResult['status'], extra: Partial<ProviderResult> = {}): ProviderResult => ({
    source: 'cinsarmy',
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

    const list = new Set<string>();
    for (const line of text.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const first = t.split(/\s+/)[0];
      if (first) list.add(first);
    }

    const hit = list.has(indicator.value);
    return base('ok', {
      score: hit ? 80 : 0,
      verdict: hit ? 'malicious' : 'clean',
      tags: hit ? ['cins-bad-actor'] : [],
      raw_summary: { listed: hit, list_size: list.size },
    });
  } catch (err) {
    return base('error', toProviderError(classifyThrownError(err)));
  }
};
