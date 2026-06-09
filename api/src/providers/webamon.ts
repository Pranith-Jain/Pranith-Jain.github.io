import type { ProviderAdapter, ProviderResult } from './types';
import { classifyThrownError, toProviderError } from '../lib/provider-errors';

const WEBAMON_SEARCH = 'https://search.webamon.com/search';
const TIMEOUT_MS = 8000;

interface WebamonResult {
  'domain.name'?: string;
  meta?: { risk_score?: number; script_count?: number; report_id?: string; submission_url?: string };
  page_title?: string;
  resolved_url?: string;
  tag?: string;
  fingerprint?: Record<string, string>;
  date?: string;
}

interface WebamonResponse {
  total_hits: number;
  results: WebamonResult[];
}

export const webamon: ProviderAdapter = async (indicator, _env, signal) => {
  const now = new Date().toISOString();
  const base = (status: ProviderResult['status'], extra: Partial<ProviderResult> = {}): ProviderResult => ({
    source: 'webamon',
    status,
    score: 0,
    verdict: 'unknown',
    raw_summary: {},
    tags: [],
    fetched_at: now,
    cached: false,
    ...extra,
  });

  if (indicator.type !== 'domain') return base('unsupported');

  try {
    const timeoutSignal = AbortSignal.timeout(TIMEOUT_MS);
    const combined = AbortSignal.any ? AbortSignal.any([signal, timeoutSignal]) : signal;

    const url = `${WEBAMON_SEARCH}?search=${encodeURIComponent(indicator.value)}&results=domain.name,page_title,meta.risk_score,resolved_url,tag&size=1`;
    const res = await fetch(url, {
      signal: combined,
      headers: { accept: 'application/json', 'user-agent': 'pranithjain-dfir/1.0' },
    });

    if (!res.ok) {
      if (res.status === 429)
        return base('ok', { score: 0, verdict: 'unknown', tags: ['rate-limited'], raw_summary: {} });
      return base('error', { error: `upstream ${res.status}` });
    }

    const data = (await res.json()) as WebamonResponse;
    if (!data.total_hits || !data.results?.length) {
      return base('ok', { score: 0, verdict: 'clean', tags: [], raw_summary: {} });
    }

    const hit = data.results[0];
    const riskScore = hit.meta?.risk_score ?? 0;
    const mappedScore = Math.min(Math.round(riskScore * 10), 100);

    let verdict: ProviderResult['verdict'] = 'clean';
    if (riskScore >= 8) verdict = 'malicious';
    else if (riskScore >= 5) verdict = 'suspicious';
    else if (riskScore >= 3) verdict = 'suspicious';

    const tags: string[] = [];
    if (riskScore >= 5) tags.push('webamon:risk');
    if (hit.tag) tags.push(`webamon:${hit.tag}`);
    if (hit.meta?.report_id) tags.push('webamon:scanned');

    return base('ok', {
      score: mappedScore,
      verdict,
      tags,
      raw_summary: {
        domain: hit['domain.name'] ?? '',
        page_title: hit.page_title ?? '',
        risk_score: riskScore,
        resolved_url: hit.resolved_url ?? '',
        tag: hit.tag ?? '',
        date: hit.date ?? '',
      },
    });
  } catch (err) {
    return base('error', toProviderError(classifyThrownError(err)));
  }
};
