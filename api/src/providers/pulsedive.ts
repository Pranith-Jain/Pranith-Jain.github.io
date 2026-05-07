import type { ProviderAdapter, ProviderResult, Verdict } from './types';

const supports = new Set(['ipv4', 'ipv6', 'domain', 'url', 'hash']);

function riskToScore(risk: string): number {
  switch (risk) {
    case 'critical':
      return 90;
    case 'high':
      return 70;
    case 'medium':
      return 50;
    case 'low':
      return 20;
    case 'none':
      return 0;
    default:
      return 30;
  }
}

export const pulsedive: ProviderAdapter = async (indicator, env, signal) => {
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
    const url = `https://pulsedive.com/api/explore.php?q=${encodeURIComponent(indicator.value)}&pretty=1&key=${env.PULSEDIVE_API_KEY}`;
    const res = await fetch(url, { signal });
    if (!res.ok) return base('error', { error: `${res.status} ${res.statusText}`.trim() });

    const json = (await res.json()) as {
      risk?: string;
      attributes?: {
        threats?: Array<{ name?: string }>;
        feeds?: Array<{ name?: string }>;
      };
      riskfactors?: Array<{ description?: string }>;
    };

    const risk = json.risk ?? 'unknown';
    const score = riskToScore(risk);
    const verdict: Verdict = score >= 70 ? 'malicious' : score >= 40 ? 'suspicious' : 'clean';

    const threats = json.attributes?.threats ?? [];
    const feeds = json.attributes?.feeds ?? [];
    const riskfactors = json.riskfactors ?? [];

    const threatNames = threats
      .slice(0, 5)
      .map((t) => t.name ?? '')
      .filter(Boolean);
    const factorDescs = riskfactors
      .slice(0, 3)
      .map((f) => f.description ?? '')
      .filter(Boolean);

    const tags = [...new Set([...threatNames, ...factorDescs])].slice(0, 10);

    return base('ok', {
      score,
      verdict,
      raw_summary: {
        risk,
        threats_count: threats.length,
        feeds_count: feeds.length,
      },
      tags,
    });
  } catch (err) {
    return base('error', { error: err instanceof Error ? err.message : String(err) });
  }
};
