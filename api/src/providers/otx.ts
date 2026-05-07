import type { ProviderAdapter, ProviderResult, Verdict } from './types';

const supports = new Set(['ipv4', 'ipv6', 'domain', 'url', 'hash']);

function resourceFor(type: string): string {
  switch (type) {
    case 'ipv4':
      return 'IPv4';
    case 'ipv6':
      return 'IPv6';
    case 'domain':
      return 'domain';
    case 'url':
      return 'url';
    case 'hash':
      return 'file';
    default:
      throw new Error(`unsupported type ${type}`);
  }
}

function pulseCountToScore(count: number): number {
  if (count === 0) return 0;
  if (count <= 5) return 30;
  if (count <= 15) return 60;
  return 80;
}

export const otx: ProviderAdapter = async (indicator, env, signal) => {
  const now = new Date().toISOString();
  const base = (status: ProviderResult['status'], extra: Partial<ProviderResult> = {}): ProviderResult => ({
    source: 'otx',
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
    const resource = resourceFor(indicator.type);
    const url = `https://otx.alienvault.com/api/v1/indicators/${resource}/${encodeURIComponent(indicator.value)}/general`;
    const res = await fetch(url, {
      headers: { 'X-OTX-API-KEY': env.OTX_API_KEY },
      signal,
    });
    if (!res.ok) return base('error', { error: `${res.status} ${res.statusText}`.trim() });

    const json = (await res.json()) as {
      pulse_info?: {
        count?: number;
        pulses?: Array<{ name?: string }>;
      };
    };

    const pulseInfo = json.pulse_info ?? {};
    const count = Number(pulseInfo.count ?? 0);
    const pulses = pulseInfo.pulses ?? [];
    const score = pulseCountToScore(count);
    const verdict: Verdict = score >= 70 ? 'malicious' : score >= 40 ? 'suspicious' : 'clean';

    const sampleNames = [
      ...new Set(
        pulses
          .slice(0, 5)
          .map((p) => p.name ?? '')
          .filter(Boolean)
      ),
    ];

    return base('ok', {
      score,
      verdict,
      raw_summary: {
        pulse_count: count,
        sample_pulses: sampleNames,
      },
      tags: sampleNames,
    });
  } catch (err) {
    return base('error', { error: err instanceof Error ? err.message : String(err) });
  }
};
