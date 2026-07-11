import type { ProviderAdapter, ProviderResult, Verdict } from './types';
import { classifyResponseError, classifyThrownError, toProviderError } from '../lib/provider-errors';

const supports = new Set(['ipv4', 'domain', 'email']);

interface OpensanctionsMatch {
  schema?: string;
  id?: string;
  caption?: string;
  properties?: Record<string, string[]>;
  datasets?: string[];
  score?: number;
  topics?: string[];
}

interface OpensanctionsSearchResponse {
  total?: {
    value?: number;
  };
  results?: OpensanctionsMatch[];
}

export const opensanctions: ProviderAdapter = async (indicator, env, signal) => {
  const now = new Date().toISOString();
  const base = (status: ProviderResult['status'], extra: Partial<ProviderResult> = {}): ProviderResult => ({
    source: 'opensanctions',
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
    const url = `https://api.opensanctions.org/search/default?q=${encodeURIComponent(indicator.value)}&limit=20`;
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'pranithjain-threatintel/1.0',
      },
      signal,
    });

    if (res.status === 429) return base('error', toProviderError(classifyResponseError(res)));
    if (!res.ok) return base('error', toProviderError(classifyResponseError(res)));

    const json = (await res.json()) as OpensanctionsSearchResponse;
    const total = json.total?.value ?? 0;
    const results = json.results ?? [];

    if (total === 0 || results.length === 0) {
      return base('ok', {
        verdict: 'clean',
        tags: ['no-sanctions-hit'],
        raw_summary: { total: 0, message: 'entity not found in sanctions databases' },
      });
    }

    const highestScore = Math.max(...results.map((r) => r.score ?? 0), 0);
    const verdict: Verdict = highestScore > 80 ? 'malicious' : highestScore > 40 ? 'suspicious' : 'unknown';
    const score = Math.min(100, Math.round(highestScore));

    const tags: string[] = [];
    const schemas = new Set<string>();
    const datasets = new Set<string>();
    const topics = new Set<string>();

    for (const r of results.slice(0, 10)) {
      if (r.schema) schemas.add(r.schema);
      if (r.datasets) r.datasets.forEach((d) => datasets.add(d));
      if (r.topics) r.topics.forEach((t) => topics.add(t));
    }

    schemas.forEach((s) => tags.push(`schema:${s}`));
    topics.forEach((t) => {
      if (['sanction', 'crime', 'terrorism', 'proliferation', 'poi'].includes(t)) {
        tags.push(`flag:${t}`);
      }
    });

    return base('ok', {
      score,
      verdict,
      tags: [...new Set(tags)].slice(0, 7),
      raw_summary: {
        total_matches: total,
        max_score: highestScore,
        datasets: [...datasets],
        topics: [...topics],
        schemas: [...schemas],
        matches: results.slice(0, 5).map((r) => ({
          caption: r.caption,
          schema: r.schema,
          score: r.score,
          datasets: r.datasets?.slice(0, 3),
          topics: r.topics?.slice(0, 3),
        })),
      },
    });
  } catch (err) {
    return base('error', toProviderError(classifyThrownError(err)));
  }
};
