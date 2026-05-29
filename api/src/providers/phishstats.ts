import type { ProviderAdapter, ProviderResult, Verdict } from './types';

/**
 * PhishStats.info — FREE, NO AUTH.
 *
 * PhishStats provides phishing URL statistics and reputation data.
 * Their API returns:
 *   - Phishing URL score (0-100)
 *   - First/last seen dates
 *   - Target brand/organization
 *   - Country of hosting
 *   - IP address
 *
 * No authentication required. Rate limits are generous.
 *
 * @see https://phishstats.info/
 */

const supports = new Set(['url', 'domain']);

interface PhishStatsResponse {
  url?: string;
  score?: number;
  firstseen?: string;
  lastseen?: string;
  brand?: string;
  country?: string;
  ip?: string;
  asn?: string;
  isp?: string;
}

export const phishstats: ProviderAdapter = async (indicator, _env, signal) => {
  const now = new Date().toISOString();
  const base = (status: ProviderResult['status'], extra: Partial<ProviderResult> = {}): ProviderResult => ({
    source: 'phishstats',
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
    // Search by URL or domain
    const searchParam = indicator.type === 'url'
      ? `url=${encodeURIComponent(indicator.value)}`
      : `domain=${encodeURIComponent(indicator.value)}`;

    const url = `https://phishstats.info/api/phish?${searchParam}&size=1`;
    const res = await fetch(url, {
      signal,
      headers: { Accept: 'application/json' },
      cf: { cacheTtl: 3600, cacheEverything: true },
    });

    if (res.status === 404 || res.status === 204) {
      return base('ok', {
        score: 0,
        verdict: 'clean',
        tags: ['not-found'],
        raw_summary: { reason: 'Not found in PhishStats database' },
      });
    }

    if (res.status === 429) return base('error', { error: 'rate_limited' });
    if (!res.ok) return base('error', { error: `${res.status} ${res.statusText}`.trim() });

    const data = await res.json();
    const items = Array.isArray(data) ? data : [data];

    if (items.length === 0) {
      return base('ok', {
        score: 0,
        verdict: 'clean',
        tags: ['not-found'],
        raw_summary: { reason: 'No matching entries in PhishStats' },
      });
    }

    const item = items[0] as PhishStatsResponse;
    const score = item.score ?? 0;

    // Verdict based on PhishStats score
    let verdict: Verdict;
    if (score >= 70) verdict = 'malicious';
    else if (score >= 40) verdict = 'suspicious';
    else if (score > 0) verdict = 'suspicious';
    else verdict = 'clean';

    const tags: string[] = [];
    if (item.brand) tags.push(`brand:${item.brand}`);
    if (item.country) tags.push(item.country);
    if (item.ip) tags.push(`ip:${item.ip}`);
    if (item.asn) tags.push(`asn:${item.asn}`);

    return base('ok', {
      score,
      verdict,
      tags: [...new Set(tags)].slice(0, 6),
      raw_summary: {
        score: item.score,
        first_seen: item.firstseen,
        last_seen: item.lastseen,
        brand: item.brand,
        country: item.country,
        ip: item.ip,
        asn: item.asn,
        isp: item.isp,
      },
    });
  } catch (err) {
    return base('error', { error: err instanceof Error ? err.message : String(err) });
  }
};
