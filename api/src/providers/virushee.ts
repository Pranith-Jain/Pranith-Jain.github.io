import type { ProviderAdapter, ProviderResult, Verdict } from './types';
import { classifyResponseError, classifyThrownError, toProviderError } from '../lib/provider-errors';

const supports = new Set(['hash']);

interface VirusheeCheckResponse {
  found?: boolean;
  hash?: string;
  sha256?: string;
  md5?: string;
  sha1?: string;
  positives?: number;
  total?: number;
  scan_results?: Array<{
    engine?: string;
    detected?: boolean;
    result?: string;
  }>;
  error?: string;
}

export const virushee: ProviderAdapter = async (indicator, env, signal) => {
  const now = new Date().toISOString();
  const base = (status: ProviderResult['status'], extra: Partial<ProviderResult> = {}): ProviderResult => ({
    source: 'virushee',
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
    const res = await fetch(`https://api.virushee.com/check/hash?hash=${encodeURIComponent(indicator.value)}`, {
      headers: { Accept: 'application/json' },
      signal,
    });

    if (res.status === 429) return base('error', toProviderError(classifyResponseError(res)));
    if (res.status === 404) {
      return base('ok', {
        verdict: 'unknown',
        tags: ['virushee-not-found'],
        raw_summary: { found: false, reason: 'hash not in Virushee database' },
      });
    }
    if (!res.ok) return base('error', toProviderError(classifyResponseError(res)));

    const json = (await res.json()) as VirusheeCheckResponse;

    if (!json.found) {
      return base('ok', {
        verdict: 'unknown',
        tags: ['virushee-not-found'],
        raw_summary: { found: false },
      });
    }

    const positives = json.positives ?? 0;
    const total = json.total ?? 0;
    const detectionRatio = total > 0 ? positives / total : 0;

    let verdict: Verdict = 'clean';
    let score = 0;
    const tags: string[] = [];

    if (detectionRatio >= 0.5) {
      verdict = 'malicious';
      score = Math.round(detectionRatio * 100);
      tags.push('virushee-malicious');
    } else if (detectionRatio >= 0.1) {
      verdict = 'suspicious';
      score = Math.round(detectionRatio * 80);
      tags.push('virushee-suspicious');
    } else if (positives > 0) {
      verdict = 'suspicious';
      score = 20;
      tags.push('virushee-low-detection');
    } else {
      tags.push('virushee-clean');
    }

    const engines = json.scan_results ?? [];
    const maliciousEngines = engines
      .filter((e) => e.detected)
      .map((e) => e.engine)
      .filter(Boolean) as string[];
    maliciousEngines.slice(0, 5).forEach((e) => tags.push(`detected:${e}`));

    return base('ok', {
      score,
      verdict,
      tags: [...new Set(tags)].slice(0, 7),
      raw_summary: {
        found: true,
        positives,
        total_engines: total,
        detection_ratio: detectionRatio,
        malicious_engines: maliciousEngines.slice(0, 10),
        clean_engines: total - positives,
      },
    });
  } catch (err) {
    return base('error', toProviderError(classifyThrownError(err)));
  }
};
