import type { ProviderAdapter, ProviderResult, Verdict } from './types';

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

  try {
    const url = `https://api.abuseipdb.com/api/v2/check?ipAddress=${encodeURIComponent(indicator.value)}&maxAgeInDays=90`;
    const res = await fetch(url, {
      headers: {
        Key: env.ABUSEIPDB_API_KEY,
        Accept: 'application/json',
      },
      signal,
    });
    if (!res.ok) return base('error', { error: `${res.status} ${res.statusText}`.trim() });

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
    return base('error', { error: err instanceof Error ? err.message : String(err) });
  }
};
