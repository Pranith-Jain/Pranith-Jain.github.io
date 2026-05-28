import type { ProviderAdapter, ProviderResult } from './types';

const supports = new Set(['hash']);

export const malshare: ProviderAdapter = async (indicator, env, signal) => {
  const now = new Date().toISOString();
  const base = (status: ProviderResult['status'], extra: Partial<ProviderResult> = {}): ProviderResult => ({
    source: 'malshare',
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
  if (!env.MALSHARE_API_KEY) return base('error', { error: 'no_api_key' });

  try {
    const url = `https://malshare.com/api.php?api_key=${encodeURIComponent(env.MALSHARE_API_KEY)}&action=details&hash=${encodeURIComponent(indicator.value)}`;
    const res = await fetch(url, { signal });
    if (!res.ok) return base('error', { error: `${res.status} ${res.statusText}`.trim() });

    const data = await res.json() as MalShareDetail;

    // MalShare returns { "error": "Sample not found" } for unknown hashes
    if (data.error) {
      return base('ok', { score: 0, verdict: 'clean', tags: [], raw_summary: {} });
    }

    const tags = ['malshare-hit'];
    if (data.SSDEEP) tags.push('ssdeep:present');
    if (data.F_TYPE) tags.push(`type:${data.F_TYPE.toLowerCase()}`);
    if (data.SOURCES && data.SOURCES.length > 0) tags.push(`sources:${data.SOURCES.length}`);

    return base('ok', {
      score: 80,
      verdict: 'malicious',
      tags,
      raw_summary: {
        md5: data.MD5 ?? '',
        sha1: data.SHA1 ?? '',
        sha256: data.SHA256 ?? '',
        file_type: data.F_TYPE ?? '',
        file_size: data.F_SIZE ?? '',
        ssdeep: data.SSDEEP ?? '',
        sources: data.SOURCES ?? [],
        added: data.ADDED ?? '',
        last_seen: data.LAST_SEEN ?? '',
      },
    });
  } catch (err) {
    return base('error', { error: err instanceof Error ? err.message : String(err) });
  }
};

interface MalShareDetail {
  MD5?: string;
  SHA1?: string;
  SHA256?: string;
  F_TYPE?: string;
  F_SIZE?: string;
  SSDEEP?: string;
  SOURCES?: string[];
  ADDED?: string;
  LAST_SEEN?: string;
  error?: string;
}
