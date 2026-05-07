import type { ProviderAdapter, ProviderResult, Verdict } from './types';

const supports = new Set(['ipv4', 'ipv6']);

function classificationToScore(classification: string): number {
  switch (classification) {
    case 'malicious':
      return 80;
    case 'suspicious':
      return 50;
    case 'benign':
      return 5;
    case 'unknown':
      return 30;
    default:
      return 30;
  }
}

export const greynoise: ProviderAdapter = async (indicator, env, signal) => {
  const now = new Date().toISOString();
  const base = (status: ProviderResult['status'], extra: Partial<ProviderResult> = {}): ProviderResult => ({
    source: 'greynoise',
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
    const url = `https://api.greynoise.io/v3/community/${encodeURIComponent(indicator.value)}`;
    const res = await fetch(url, {
      headers: {
        key: env.GREYNOISE_API_KEY,
        Accept: 'application/json',
      },
      signal,
    });
    if (!res.ok) return base('error', { error: `${res.status} ${res.statusText}`.trim() });

    const json = (await res.json()) as {
      classification?: string;
      name?: string;
      last_seen?: string;
      noise?: boolean;
      riot?: boolean;
    };

    const classification = json.classification ?? 'unknown';
    const score = classificationToScore(classification);
    const verdict: Verdict = score >= 70 ? 'malicious' : score >= 40 ? 'suspicious' : 'clean';

    const tags: string[] = [];
    if (json.name) tags.push(json.name);
    if (json.noise) tags.push('noise:true');
    if (json.riot) tags.push('riot:true');

    return base('ok', {
      score,
      verdict,
      raw_summary: {
        classification,
        name: json.name ?? '',
        noise: json.noise ?? false,
        riot: json.riot ?? false,
        last_seen: json.last_seen ?? '',
      },
      tags,
    });
  } catch (err) {
    return base('error', { error: err instanceof Error ? err.message : String(err) });
  }
};
