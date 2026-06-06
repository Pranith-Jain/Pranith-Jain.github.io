import type { ProviderAdapter, ProviderResult } from './types';
import { classifyResponseError, classifyThrownError, toProviderError } from '../lib/provider-errors';

const supports = new Set(['url', 'domain', 'ipv4']);

export const urlhaus: ProviderAdapter = async (indicator, env, signal) => {
  const now = new Date().toISOString();
  const base = (status: ProviderResult['status'], extra: Partial<ProviderResult> = {}): ProviderResult => ({
    source: 'urlhaus',
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
    const isUrl = indicator.type === 'url';
    const endpoint = isUrl ? 'https://urlhaus-api.abuse.ch/v1/url/' : 'https://urlhaus-api.abuse.ch/v1/host/';
    const body = isUrl ? { url: indicator.value } : { host: indicator.value };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Auth-Key': env.ABUSECH_AUTH_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) return base('error', toProviderError(classifyResponseError(res)));

    const text = await res.text();
    if (!text.trim()) {
      return base('ok', { score: 0, verdict: 'clean', tags: [], raw_summary: {} });
    }
    let data: UrlhausResponse;
    try {
      data = JSON.parse(text) as UrlhausResponse;
    } catch {
      return base('ok', { score: 0, verdict: 'clean', tags: [], raw_summary: {} });
    }
    if (data.query_status === 'no_results') {
      return base('ok', { score: 0, verdict: 'clean', tags: [], raw_summary: {} });
    }
    if (data.query_status !== 'ok') return base('error', { error: data.query_status });

    const isOnline = data.url_status === 'online';
    const tags = ['urlhaus-hit'];
    if (data.threat) tags.push(`threat:${String(data.threat).toLowerCase()}`);
    if (Array.isArray(data.tags))
      for (const t of data.tags.slice(0, 5)) tags.push(`urlhaus:${String(t).toLowerCase()}`);

    return base('ok', {
      score: isOnline ? 95 : 80,
      verdict: 'malicious',
      tags,
      raw_summary: {
        threat: data.threat ?? '',
        url_status: data.url_status ?? '',
        firstseen: data.firstseen ?? '',
        lastseen: data.lastseen ?? '',
        host: data.host ?? '',
        url_count: data.url_count ?? 0,
      },
    });
  } catch (err) {
    return base('error', toProviderError(classifyThrownError(err)));
  }
};

interface UrlhausResponse {
  query_status: string;
  url_status?: string;
  threat?: string;
  firstseen?: string;
  lastseen?: string;
  host?: string;
  url_count?: number;
  tags?: string[];
}
