import type { ProviderAdapter, ProviderResult, Verdict } from './types';
import { classifyResponseError, classifyThrownError, toProviderError } from '../lib/provider-errors';

const supports = new Set(['ipv4', 'ipv6']);

export const abuseipdb: ProviderAdapter = async (indicator, env, signal) => {
  const now = new Date().toISOString();
  const base = (status: ProviderResult['status'], extra: Partial<ProviderResult> = {}): ProviderResult => ({
    source: 'abuseipdb',
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

  // No key → treat as "provider not applicable" rather than firing the
  // request and surfacing an opaque 401 in the composite. Mirrors the
  // pattern in emailrep.ts.
  const key = (env as { ABUSEIPDB_API_KEY?: string }).ABUSEIPDB_API_KEY;
  if (!key) return base('unsupported', { error: 'no_api_key', error_code: 'no_api_key', error_tags: ['no-api-key'] });

  try {
    const url = `https://api.abuseipdb.com/api/v2/check?ipAddress=${encodeURIComponent(indicator.value)}&maxAgeInDays=90`;
    const res = await fetch(url, {
      headers: {
        Key: key,
        Accept: 'application/json',
      },
      signal,
    });
    if (!res.ok) return base('error', toProviderError(classifyResponseError(res)));

    const json = (await res.json()) as {
      data?: {
        abuseConfidenceScore?: number;
        countryCode?: string;
        usageType?: string;
        isp?: string;
        totalReports?: number;
      };
    };

    const data = json.data ?? {};
    const score = Number(data.abuseConfidenceScore ?? 0);
    const verdict: Verdict = score >= 70 ? 'malicious' : score >= 40 ? 'suspicious' : 'clean';

    const tags: string[] = [];
    if (data.usageType) tags.push(data.usageType);
    if (data.countryCode) tags.push(data.countryCode);

    return base('ok', {
      score,
      verdict,
      raw_summary: {
        confidence: score,
        totalReports: data.totalReports ?? 0,
        country: data.countryCode ?? '',
        isp: data.isp ?? '',
      },
      tags,
    });
  } catch (err) {
    return base('error', toProviderError(classifyThrownError(err)));
  }
};
