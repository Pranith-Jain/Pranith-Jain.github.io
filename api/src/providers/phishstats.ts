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
  host?: string;
  domain?: string;
  score?: number;
  date?: string;
  date_update?: string;
  title?: string;
  countryname?: string;
  countrycode?: string;
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
    // PhishStats uses an xmysql-style REST API on api.phishstats.info.
    // Filter syntax: _where=(field,like,~value~)  — the ~ are LIKE wildcards.
    const needle = indicator.value.toLowerCase();
    const field = indicator.type === 'url' ? 'url' : 'host';
    const where = `(${field},like,~${indicator.value}~)`;
    const url = `https://api.phishstats.info/api/phishing?_where=${encodeURIComponent(where)}&_sort=-date&_size=20`;
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
    const items = (Array.isArray(data) ? data : [data]) as PhishStatsResponse[];

    // Don't blindly trust items[0] — a `like` filter can return loosely-related
    // rows. Confirm a row's url/host/domain actually contains the indicator.
    const item = items.find((it) =>
      [it.url, it.host, it.domain].some((f) => typeof f === 'string' && f.toLowerCase().includes(needle))
    );

    if (!item) {
      return base('ok', {
        score: 0,
        verdict: 'clean',
        tags: ['not-found'],
        raw_summary: { reason: 'No matching entries in PhishStats' },
      });
    }

    // PhishStats score is roughly 0-10 (higher = more likely phishing); the
    // mere presence of a confirmed-matching row is already a phishing signal.
    const score = typeof item.score === 'number' ? item.score : 0;
    let verdict: Verdict;
    if (score >= 7) verdict = 'malicious';
    else if (score > 0) verdict = 'suspicious';
    else verdict = 'suspicious'; // matched a known phishing record

    const tags: string[] = ['phishstats'];
    if (item.title) tags.push(`brand:${item.title}`);
    if (item.countrycode) tags.push(item.countrycode);
    if (item.ip) tags.push(`ip:${item.ip}`);
    if (item.asn) tags.push(`asn:${item.asn}`);

    return base('ok', {
      score: Math.min(100, Math.round(score * 10)),
      verdict,
      tags: [...new Set(tags)].slice(0, 6),
      raw_summary: {
        score: item.score,
        first_seen: item.date,
        last_seen: item.date_update,
        title: item.title,
        country: item.countryname,
        ip: item.ip,
        asn: item.asn,
        isp: item.isp,
      },
    });
  } catch (err) {
    return base('error', { error: err instanceof Error ? err.message : String(err) });
  }
};
