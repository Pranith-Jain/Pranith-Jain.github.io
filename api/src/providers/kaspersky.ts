import type { ProviderAdapter, ProviderResult, Verdict } from './types';

const BASE = 'https://opentip.kaspersky.com/api/v1';

const SUPPORTED_TYPES = new Set(['ipv4', 'domain', 'url', 'hash']);

interface KasperskyResponse {
  // OpenTIP returns the verdict as a top-level PascalCase `Zone`
  // (Red|Orange|Yellow|Green|Grey); metadata lives in *GeneralInfo objects.
  // The old shape (json.ip/json.domain with lowercase `zone`) matched nothing,
  // so every lookup returned `unknown` even with a valid key.
  Zone?: string;
  FileGeneralInfo?: {
    DetectionRate?: number;
    DetectionName?: string;
  };
}

function zoneToScore(zone?: string): { score: number; verdict: Verdict; tags: string[] } {
  switch (zone) {
    case 'red':
      return { score: 90, verdict: 'malicious', tags: ['kaspersky-malicious'] };
    case 'orange':
      return { score: 60, verdict: 'suspicious', tags: ['kaspersky-suspicious'] };
    case 'yellow':
      return { score: 40, verdict: 'suspicious', tags: ['kaspersky-suspicious'] };
    case 'green':
      return { score: 5, verdict: 'clean', tags: [] };
    case 'grey':
    default:
      return { score: 0, verdict: 'unknown', tags: [] };
  }
}

export const kaspersky: ProviderAdapter = async (indicator, env, signal) => {
  const now = new Date().toISOString();
  const base = (status: ProviderResult['status'], extra: Partial<ProviderResult> = {}): ProviderResult => ({
    source: 'kaspersky',
    status,
    score: 0,
    verdict: 'unknown',
    raw_summary: {},
    tags: [],
    fetched_at: now,
    cached: false,
    ...extra,
  });

  if (!SUPPORTED_TYPES.has(indicator.type)) return base('unsupported');

  const key = (env as { KASPERSKY_API_KEY?: string }).KASPERSKY_API_KEY;
  if (!key) return base('unsupported');

  try {
    // OpenTIP endpoints are /search/{ip|domain|url|hash} and take the indicator
    // in the `request` query param (NOT `?ip=`/`?domain=`). The IP endpoint path
    // is `ip`, not `ipv4`. The old form 404'd / returned nothing for everything.
    const pathType = indicator.type === 'ipv4' ? 'ip' : indicator.type;
    const url = `${BASE}/search/${pathType}?request=${encodeURIComponent(indicator.value)}`;
    const res = await fetch(url, {
      headers: { 'x-api-key': key, Accept: 'application/json' },
      signal,
    });

    if (res.status === 401 || res.status === 403) {
      return base('ok', {
        score: 0,
        verdict: 'unknown',
        tags: ['kaspersky-no-access'],
        raw_summary: { reason: `${res.status} from Kaspersky` },
      });
    }
    if (res.status === 429) {
      return base('ok', {
        score: 0,
        verdict: 'unknown',
        tags: ['kaspersky-rate-limited'],
        raw_summary: { reason: 'rate limited' },
      });
    }
    if (!res.ok) return base('error', { error: `${res.status} ${res.statusText}`.trim() });

    const json = (await res.json()) as KasperskyResponse;

    // Verdict is the top-level `Zone` (PascalCase) — lowercase to map it.
    let zoneStr = (json.Zone ?? '').toLowerCase();
    const threatName = json.FileGeneralInfo?.DetectionName;
    // For hashes, refine from the AV detection rate when present.
    if (indicator.type === 'hash' && json.FileGeneralInfo?.DetectionRate) {
      const rate = json.FileGeneralInfo.DetectionRate;
      if (rate >= 20) zoneStr = 'red';
      else if (rate >= 10 && zoneStr !== 'red') zoneStr = 'orange';
    }

    const { score, verdict, tags } = zoneToScore(zoneStr);
    if (threatName) tags.push(threatName);

    return base('ok', {
      score,
      verdict,
      raw_summary: {
        zone: zoneStr || 'unknown',
        threat_name: threatName ?? null,
      },
      tags,
    });
  } catch (err) {
    return base('error', { error: err instanceof Error ? err.message : String(err) });
  }
};
