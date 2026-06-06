import type { ProviderAdapter, ProviderResult } from './types';
import { classifyResponseError, classifyThrownError, toProviderError } from '../lib/provider-errors';

const supports = new Set(['ipv4', 'ipv6', 'domain', 'url', 'hash']);

export const threatfox: ProviderAdapter = async (indicator, env, signal) => {
  const now = new Date().toISOString();
  const base = (status: ProviderResult['status'], extra: Partial<ProviderResult> = {}): ProviderResult => ({
    source: 'threatfox',
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
  if (!env.ABUSECH_AUTH_KEY) return base('error', { error: 'no_auth_key' });

  try {
    const res = await fetch('https://threatfox-api.abuse.ch/api/v1/', {
      method: 'POST',
      headers: { 'Auth-Key': env.ABUSECH_AUTH_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'search_ioc', search_term: indicator.value }),
      signal,
    });
    if (!res.ok) return base('error', toProviderError(classifyResponseError(res)));

    const data = (await res.json()) as { query_status: string; data?: ThreatFoxItem[] };
    if (data.query_status === 'no_result' || (data.query_status === 'ok' && !data.data?.length)) {
      return base('ok', { score: 0, verdict: 'clean', tags: [], raw_summary: {} });
    }
    if (data.query_status !== 'ok') return base('error', { error: data.query_status });

    const items = data.data ?? [];
    const malwareSet = new Set<string>();
    let maxConfidence = 0;
    for (const it of items.slice(0, 10)) {
      if (it.malware) malwareSet.add(String(it.malware));
      maxConfidence = Math.max(maxConfidence, Number(it.confidence_level) || 0);
    }

    const tags = ['threatfox-hit'];
    for (const m of [...malwareSet].slice(0, 5)) tags.push(`malware:${m.toLowerCase()}`);

    return base('ok', {
      score: Math.max(70, maxConfidence),
      verdict: 'malicious',
      tags,
      raw_summary: {
        match_count: items.length,
        malware: [...malwareSet].slice(0, 5),
        confidence: maxConfidence,
        first_seen: items[0]?.first_seen ?? '',
        last_seen: items[0]?.last_seen ?? '',
      },
    });
  } catch (err) {
    return base('error', toProviderError(classifyThrownError(err)));
  }
};

interface ThreatFoxItem {
  malware?: string;
  confidence_level?: number;
  first_seen?: string;
  last_seen?: string;
}
