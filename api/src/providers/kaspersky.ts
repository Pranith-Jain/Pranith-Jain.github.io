import type { ProviderAdapter, ProviderResult, Verdict } from './types';

const BASE = 'https://opentip.kaspersky.com/api/v1';

const SUPPORTED_TYPES = new Set(['ipv4', 'domain', 'url', 'hash']);

interface KasperskyZone {
  zone?: 'green' | 'yellow' | 'orange' | 'red' | 'grey';
  threat_name?: string;
  classification?: string;
}

interface KasperskyResponse {
  ip?: KasperskyZone;
  domain?: KasperskyZone;
  url?: KasperskyZone;
  hash?: KasperskyZone;
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
    const url = `${BASE}/search/${indicator.type}?${indicator.type}=${encodeURIComponent(indicator.value)}`;
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

    let zone: KasperskyZone | undefined;
    switch (indicator.type) {
      case 'ipv4':
        zone = json.ip;
        break;
      case 'domain':
        zone = json.domain;
        break;
      case 'url':
        zone = json.url;
        break;
      case 'hash':
        zone = json.hash;
        if (json.FileGeneralInfo?.DetectionRate) {
          const rate = json.FileGeneralInfo.DetectionRate;
          const r = rate >= 20 ? 'red' : rate >= 10 ? 'orange' : 'grey';
          zone = { zone: r as KasperskyZone['zone'], threat_name: json.FileGeneralInfo.DetectionName };
        }
        break;
    }

    const threatName: string | undefined = zone?.threat_name ?? json.FileGeneralInfo?.DetectionName;

    const { score, verdict, tags } = zoneToScore(zone?.zone);
    if (threatName) tags.push(threatName);

    return base('ok', {
      score,
      verdict,
      raw_summary: {
        zone: zone?.zone ?? 'unknown',
        threat_name: threatName ?? null,
        classification: zone?.classification ?? null,
      },
      tags,
    });
  } catch (err) {
    return base('error', { error: err instanceof Error ? err.message : String(err) });
  }
};
