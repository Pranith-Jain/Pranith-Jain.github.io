import type { ProviderAdapter, ProviderResult, Verdict } from './types';

const supports = new Set(['ipv4', 'ipv6', 'domain', 'url', 'hash']);

/**
 * Pulsedive free API — 30 req/min, no key required for basic lookups.
 * Returns risk rating, categories, threats, and feed associations.
 * https://pulsedive.com/api/
 */
export const pulsedive: ProviderAdapter = async (indicator, _env, signal) => {
  const now = new Date().toISOString();
  const base = (status: ProviderResult['status'], extra: Partial<ProviderResult> = {}): ProviderResult => ({
    source: 'pulsedive',
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
    const url = `https://pulsedive.com/api/info.php?indicator=${encodeURIComponent(indicator.value)}&pretty=1`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal,
    });

    if (res.status === 429) return base('error', { error: 'rate_limited' });
    if (!res.ok) return base('error', { error: `${res.status} ${res.statusText}`.trim() });

    const json = (await res.json()) as {
      risk?: string;
      riskrating?: number;
      categories?: string[];
      threats?: Array<{ threat: string; type?: string }>;
      feeds?: Array<{ feed: string }>;
      attributes?: Record<string, unknown>;
    };

    // Pulsedive risk: none=0, low=1, medium=2, high=3, critical=4
    const riskMap: Record<string, number> = { none: 0, low: 25, medium: 50, high: 75, critical: 100 };
    const riskStr = (json.risk ?? 'none').toLowerCase();
    const score = json.riskrating ?? riskMap[riskStr] ?? 0;
    const verdict: Verdict = score >= 70 ? 'malicious' : score >= 40 ? 'suspicious' : score > 0 ? 'clean' : 'unknown';

    const tags: string[] = [];
    for (const cat of json.categories ?? []) tags.push(cat);
    for (const t of json.threats?.slice(0, 5) ?? []) {
      if (t.threat && !tags.includes(t.threat)) tags.push(t.threat);
    }

    return base('ok', {
      score,
      verdict,
      raw_summary: {
        risk: json.risk,
        riskrating: json.riskrating,
        categories: json.categories ?? [],
        threats: (json.threats ?? []).slice(0, 5).map((t) => t.threat),
        feeds: (json.feeds ?? []).slice(0, 5).map((f) => f.feed),
      },
      tags: tags.slice(0, 10),
    });
  } catch (err) {
    return base('error', { error: err instanceof Error ? err.message : String(err) });
  }
};
