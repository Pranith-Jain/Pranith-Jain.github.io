import type { ProviderAdapter, ProviderResult, Verdict } from './types';
import { classifyResponseError, classifyThrownError, toProviderError } from '../lib/provider-errors';

const supports = new Set(['hash']);

function verdictToScore(verdict: string): number {
  switch (verdict) {
    case 'malicious':
      return 80;
    case 'suspicious':
      return 50;
    case 'no specific threat':
      return 5;
    default:
      return 0;
  }
}

export const hybridanalysis: ProviderAdapter = async (indicator, env, signal) => {
  const now = new Date().toISOString();
  const base = (status: ProviderResult['status'], extra: Partial<ProviderResult> = {}): ProviderResult => ({
    source: 'hybridanalysis',
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

  // No key → "provider not applicable" instead of firing the request and
  // surfacing an opaque 401 in the composite.
  const key = (env as { HYBRID_ANALYSIS_API_KEY?: string }).HYBRID_ANALYSIS_API_KEY;
  if (!key) return base('unsupported');

  try {
    const body = `hash=${encodeURIComponent(indicator.value)}`;
    const res = await fetch('https://www.hybrid-analysis.com/api/v2/search/hash', {
      method: 'POST',
      headers: {
        'api-key': key,
        'User-Agent': 'Falcon Sandbox',
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
      signal,
    });
    // 401 / 403 = the Hybrid Analysis tier doesn't permit this lookup. Don't
    // pollute the IOC verdict with a permission error; return a graceful no-data.
    if (res.status === 401 || res.status === 403) {
      return base('ok', {
        score: 0,
        verdict: 'unknown',
        tags: ['hybridanalysis-no-access'],
        raw_summary: { reason: `${res.status} from Hybrid Analysis` },
      });
    }
    if (!res.ok) return base('error', toProviderError(classifyResponseError(res)));

    const json = (await res.json()) as Array<{
      verdict?: string | null;
      threat_score?: number | null;
      vx_family?: string | null;
      submit_name?: string | null;
    }>;

    const results = Array.isArray(json) ? json : [];
    const first = results[0];

    if (!first) {
      return base('ok', {
        score: 0,
        verdict: 'clean',
        raw_summary: { verdict: null, threat_score: null, vx_family: null },
        tags: [],
      });
    }

    const threatScore = first.threat_score != null ? Number(first.threat_score) : null;
    const verdictStr = first.verdict ?? '';
    const score = threatScore != null ? Math.min(100, Math.max(0, threatScore)) : verdictToScore(verdictStr);
    const verdict: Verdict = score >= 70 ? 'malicious' : score >= 40 ? 'suspicious' : 'clean';

    const tags: string[] = [];
    if (first.vx_family) tags.push(first.vx_family);

    return base('ok', {
      score,
      verdict,
      raw_summary: {
        verdict: verdictStr,
        threat_score: threatScore,
        vx_family: first.vx_family ?? null,
      },
      tags,
    });
  } catch (err) {
    return base('error', toProviderError(classifyThrownError(err)));
  }
};
