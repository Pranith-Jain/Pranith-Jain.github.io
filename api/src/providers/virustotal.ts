import type { ProviderAdapter, ProviderResult, Verdict } from './types';

const supports = new Set(['ipv4', 'ipv6', 'domain', 'url', 'hash']);

function endpointFor(type: string, value: string): string {
  const base = 'https://www.virustotal.com/api/v3';
  switch (type) {
    case 'ipv4':
    case 'ipv6':
      return `${base}/ip_addresses/${encodeURIComponent(value)}`;
    case 'domain':
      return `${base}/domains/${encodeURIComponent(value)}`;
    case 'url': {
      // VT requires base64url-encoded URL with no padding
      const b64 = btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      return `${base}/urls/${b64}`;
    }
    case 'hash':
      return `${base}/files/${encodeURIComponent(value)}`;
    default:
      throw new Error(`unsupported type ${type}`);
  }
}

export const virustotal: ProviderAdapter = async (indicator, env, signal) => {
  const now = new Date().toISOString();
  const base = (status: ProviderResult['status'], extra: Partial<ProviderResult> = {}): ProviderResult => ({
    source: 'virustotal',
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
    const res = await fetch(endpointFor(indicator.type, indicator.value), {
      headers: { 'x-apikey': env.VT_API_KEY, accept: 'application/json' },
      signal,
    });
    if (!res.ok) return base('error', { error: `${res.status} ${res.statusText}`.trim() });

    const json = (await res.json()) as {
      data?: { attributes?: { last_analysis_stats?: Record<string, number>; tags?: string[] } };
    };
    const stats = json.data?.attributes?.last_analysis_stats ?? {};
    const malicious = Number(stats.malicious ?? 0);
    const suspicious = Number(stats.suspicious ?? 0);
    const harmless = Number(stats.harmless ?? 0);
    const undetected = Number(stats.undetected ?? 0);
    const total = malicious + suspicious + harmless + undetected || 1;
    const score = Math.min(100, Math.round(((malicious + suspicious * 0.5) / total) * 100));
    const verdict: Verdict = score >= 70 ? 'malicious' : score >= 40 ? 'suspicious' : 'clean';
    const tags = (json.data?.attributes?.tags ?? []).slice(0, 10);

    return base('ok', {
      score,
      verdict,
      raw_summary: { malicious, suspicious, harmless, undetected, total },
      tags,
    });
  } catch (err) {
    return base('error', { error: err instanceof Error ? err.message : String(err) });
  }
};
