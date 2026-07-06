import type { ProviderAdapter, ProviderResult } from './types';
import { classifyResponseError, classifyThrownError, toProviderError } from '../lib/provider-errors';

const supports = new Set(['domain']);
const FEED = 'https://hole.cert.pl/domains/v2/domains.txt';
const CACHE_TTL_SECONDS = 1800;

export const certpl: ProviderAdapter = async (indicator, _env, signal) => {
  const now = new Date().toISOString();
  const base = (status: ProviderResult['status'], extra: Partial<ProviderResult> = {}): ProviderResult => ({
    source: 'certpl',
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

    const domains = new Set<string>();
    for (const line of text.split(/\r?\n/)) {
      const t = line.trim().toLowerCase();
      if (t && !t.startsWith('#')) domains.add(t);
    }

    const hit = domains.has(indicator.value.toLowerCase());
    return base('ok', {
      score: hit ? 85 : 0,
      verdict: hit ? 'malicious' : 'clean',
      tags: hit ? ['cert-pl-phishing'] : [],
      raw_summary: { listed: hit, feed_size: domains.size, source: 'CERT Poland' },
    });
  } catch (err) {
    return base('error', toProviderError(classifyThrownError(err)));
  }
};
