import type { ProviderAdapter, ProviderResult } from './types';

const supports = new Set(['url', 'domain']);
const FEED = 'http://data.phishtank.com/data/online-valid.json';
const CACHE_TTL_SECONDS = 1800;

/** Community-vetted phishing URLs from PhishTank (Cisco Talos). Complements OpenPhish. */
export const phishtank: ProviderAdapter = async (indicator, _env, signal) => {
  const now = new Date().toISOString();
  const base = (status: ProviderResult['status'], extra: Partial<ProviderResult> = {}): ProviderResult => ({
    source: 'phishtank',
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
    const entries = (await res.json()) as Array<{
      url: string;
      phishing_url?: string;
      target?: string;
      verified?: string;
      verification_time?: string;
      ip_address?: string;
    }>;

    const target = indicator.type === 'url' ? indicator.value.toLowerCase() : indicator.value.toLowerCase();

    let hit = false;
    let brand = '';
    for (const e of entries) {
      const feedUrl = (e.url || e.phishing_url || '').toLowerCase();
      if (feedUrl.includes(target) || target.includes(feedUrl)) {
        hit = true;
        brand = e.target ?? '';
        break;
      }
    }

    return base('ok', {
      score: hit ? 90 : 0,
      verdict: hit ? 'malicious' : 'clean',
      tags: hit ? ['phishing', 'phishtank', brand].filter(Boolean) : [],
      raw_summary: { listed: hit, list_size: entries.length, source: 'phishtank.com' },
    });
  } catch (err) {
    return base('error', { error: err instanceof Error ? err.message : String(err) });
  }
};
