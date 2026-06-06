import type { ProviderAdapter, ProviderResult } from './types';
import { classifyResponseError, classifyThrownError, toProviderError } from '../lib/provider-errors';

const supports = new Set(['ipv4']);
const FEED = 'https://www.binarydefense.com/banlist.txt';
const CACHE_TTL_SECONDS = 3600;

/**
 * Binary Defense Artillery banlist. Curated list of IPs known to be running attack
 * campaigns or scanning the internet for known weaknesses.
 */
export const binarydefense: ProviderAdapter = async (indicator, _env, signal) => {
  const now = new Date().toISOString();
  const base = (status: ProviderResult['status'], extra: Partial<ProviderResult> = {}): ProviderResult => ({
    source: 'binarydefense',
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
      score: hit ? 80 : 0,
      verdict: hit ? 'malicious' : 'clean',
      tags: hit ? ['binary-defense', 'attack-source'] : [],
      raw_summary: { listed: hit, list_size: set.size },
    });
  } catch (err) {
    return base('error', toProviderError(classifyThrownError(err)));
  }
};
