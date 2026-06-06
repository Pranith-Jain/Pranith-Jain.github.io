import type { ProviderAdapter, ProviderResult } from './types';
import { classifyResponseError, classifyThrownError, toProviderError } from '../lib/provider-errors';

const supports = new Set(['url', 'domain']);
const FEED = 'https://openphish.com/feed.txt';
const CACHE_TTL_SECONDS = 3600;

export const openphish: ProviderAdapter = async (indicator, _env, signal) => {
  const now = new Date().toISOString();
  const base = (status: ProviderResult['status'], extra: Partial<ProviderResult> = {}): ProviderResult => ({
    source: 'openphish',
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

    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    const hit =
      indicator.type === 'url' ? lines.includes(indicator.value) : lines.some((u) => domainMatches(u, indicator.value));

    return base('ok', {
      score: hit ? 90 : 0,
      verdict: hit ? 'malicious' : 'clean',
      tags: hit ? ['openphish-listed', 'phishing'] : [],
      raw_summary: { listed: hit, feed_size: lines.length },
    });
  } catch (err) {
    return base('error', toProviderError(classifyThrownError(err)));
  }
};

function domainMatches(url: string, domain: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === domain || host.endsWith(`.${domain}`);
  } catch {
    return false;
  }
}
