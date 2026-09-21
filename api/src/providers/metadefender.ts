import type { ProviderAdapter, ProviderResult, Verdict } from './types';
import { classifyResponseError, classifyThrownError, toProviderError } from '../lib/provider-errors';

/**
 * MetaDefender Cloud (OPSWAT) — multi-engine file reputation for hashes.
 *
 * Primary: GET https://api.metadefender.com/v5/threat-intel/av-file-reputation/{hash}
 *   → { md5, sha1, sha256, reputation: benign|suspicious|malicious|unknown }
 * Fallback: v4 hash lookup shape { scan_results: { total_detected_avs, total_avs } }.
 * Auth: `apikey` header (free community key via OPSWAT account, daily limits).
 *
 * **Requires `METADEFENDER_API_KEY` as a Worker secret.** Without a key we
 * return `unsupported` so the hash composite isn't polluted.
 */

const supports = new Set(['hash']);

interface MetadefenderV5 {
  md5?: string;
  sha1?: string;
  sha256?: string;
  reputation?: 'benign' | 'suspicious' | 'malicious' | 'unknown' | string;
}

interface MetadefenderV4 {
  sha1?: string;
  sha256?: string;
  scan_results?: {
    total_detected_avs?: number;
    total_avs?: number;
  };
}

export const metadefender: ProviderAdapter = async (indicator, env, signal) => {
  const now = new Date().toISOString();
  const base = (status: ProviderResult['status'], extra: Partial<ProviderResult> = {}): ProviderResult => ({
    source: 'metadefender',
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

  const key = (env as { METADEFENDER_API_KEY?: string }).METADEFENDER_API_KEY;
  if (!key) return base('unsupported');

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': 'pranithjain.qzz.io DFIR toolkit',
    apikey: key,
  };

  try {
    const res = await fetch(
      `https://api.metadefender.com/v5/threat-intel/av-file-reputation/${encodeURIComponent(indicator.value)}`,
      { headers, signal }
    );

    if (res.status === 429) return base('error', toProviderError(classifyResponseError(res)));
    if (!res.ok) return base('error', toProviderError(classifyResponseError(res)));

    const data = (await res.json()) as MetadefenderV5 & MetadefenderV4;
    const reputation = typeof data.reputation === 'string' ? data.reputation.toLowerCase() : '';

    let score: number;
    let verdict: Verdict;
    const tags = ['metadefender'];

    if (reputation === 'malicious') {
      score = 90;
      verdict = 'malicious';
      tags.push('reputation:malicious');
    } else if (reputation === 'suspicious') {
      score = 60;
      verdict = 'suspicious';
      tags.push('reputation:suspicious');
    } else if (reputation === 'benign') {
      score = 0;
      verdict = 'clean';
      tags.push('reputation:benign');
    } else if (reputation === 'unknown' || reputation === '') {
      // v4 fallback shape carries engine counts instead of a verdict word.
      const detected = data.scan_results?.total_detected_avs ?? -1;
      const total = data.scan_results?.total_avs ?? 0;
      if (detected > 0) {
        score = Math.min(95, 50 + detected * 5);
        verdict = 'malicious';
        tags.push(`engines:${detected}/${total}`);
      } else if (detected === 0 && total > 0) {
        score = 0;
        verdict = 'clean';
        tags.push(`engines:0/${total}`);
      } else {
        score = 0;
        verdict = 'unknown';
        tags.push('reputation:unknown');
      }
    } else {
      score = 0;
      verdict = 'unknown';
      tags.push(`reputation:${reputation}`);
    }

    return base('ok', {
      score,
      verdict,
      tags,
      raw_summary: {
        hash: indicator.value,
        reputation: reputation || 'unknown',
        md5: data.md5 ?? '',
        sha1: data.sha1 ?? '',
        sha256: data.sha256 ?? '',
        detected_engines: data.scan_results?.total_detected_avs ?? null,
        total_engines: data.scan_results?.total_avs ?? null,
      },
    });
  } catch (err) {
    return base('error', toProviderError(classifyThrownError(err)));
  }
};
