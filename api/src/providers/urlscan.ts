import type { ProviderAdapter, ProviderResult, Verdict } from './types';

const supports = new Set(['url', 'domain']);

export const urlscan: ProviderAdapter = async (indicator, env, signal) => {
  const now = new Date().toISOString();
  const base = (status: ProviderResult['status'], extra: Partial<ProviderResult> = {}): ProviderResult => ({
    source: 'urlscan',
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
    const url = `https://urlscan.io/api/v1/search/?q=${encodeURIComponent(indicator.value)}`;
    const res = await fetch(url, {
      headers: { 'API-Key': env.URLSCAN_API_KEY },
      signal,
    });
    if (!res.ok) return base('error', { error: `${res.status} ${res.statusText}`.trim() });

    const json = (await res.json()) as {
      results?: Array<{
        _score?: number;
        tags?: string[];
        task?: { url?: string };
        verdicts?: { overall?: { score?: number } };
      }>;
      total?: number;
    };

    const results = json.results ?? [];
    const topScore = results.length > 0 ? Math.max(...results.map((r) => Number(r._score ?? 0))) : 0;
    const score = Math.min(100, Math.max(0, topScore));
    const verdict: Verdict = score >= 70 ? 'malicious' : score >= 40 ? 'suspicious' : 'clean';

    const allTags = results.flatMap((r) => r.tags ?? []);
    const tags = [...new Set(allTags)].slice(0, 10);

    return base('ok', {
      score,
      verdict,
      raw_summary: {
        result_count: results.length,
        top_score: topScore,
      },
      tags,
    });
  } catch (err) {
    return base('error', { error: err instanceof Error ? err.message : String(err) });
  }
};
