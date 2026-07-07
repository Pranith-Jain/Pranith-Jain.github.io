import type { ProviderAdapter, ProviderResult, Verdict } from './types';
import { classifyResponseError, classifyThrownError, toProviderError } from '../lib/provider-errors';

const supports = new Set(['hash']);

function polyScoreToVerdict(score: number): { verdict: Verdict; score: number } {
  if (score >= 0.7) return { verdict: 'malicious', score: 90 };
  if (score >= 0.4) return { verdict: 'suspicious', score: 50 };
  return { verdict: 'clean', score: 5 };
}

function detectHashType(hash: string): string {
  const len = hash.length;
  if (len === 64) return 'sha256';
  if (len === 40) return 'sha1';
  if (len === 32) return 'md5';
  return 'sha256';
}

export const polyswarm: ProviderAdapter = async (indicator, env, signal) => {
  const now = new Date().toISOString();
  const base = (status: ProviderResult['status'], extra: Partial<ProviderResult> = {}): ProviderResult => ({
    source: 'polyswarm',
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

  const key = (env as { POLYSWARM_API_KEY?: string }).POLYSWARM_API_KEY;
  if (!key) return base('unsupported', { error: 'no_api_key', error_code: 'no_api_key', error_tags: ['no-api-key'] });

  try {
    const hashType = detectHashType(indicator.value);
    const community = 'default';

    const res = await fetch(
      `https://api.polyswarm.network/v3/consumer/${community}/artifact/${hashType}/${encodeURIComponent(indicator.value)}`,
      {
        headers: { Authorization: key, Accept: 'application/json' },
        signal,
      }
    );

    if (res.status === 404) {
      return base('ok', { score: 0, verdict: 'clean', tags: [], raw_summary: { poly_score: null, found: false } });
    }
    if (res.status === 401 || res.status === 403) {
      return base('ok', {
        score: 0,
        verdict: 'unknown',
        tags: ['polyswarm-no-access'],
        raw_summary: { reason: `${res.status} from PolySwarm` },
      });
    }
    if (!res.ok) return base('error', toProviderError(classifyResponseError(res)));

    const data = (await res.json()) as {
      artifact?: {
        sha256?: string;
        md5?: string;
        sha1?: string;
        type?: string;
        filename?: string;
        first_seen?: string;
      };
      poly_score?: number;
      assertions?: Array<{
        engine?: string;
        verdict?: boolean;
      }>;
      windows_closed?: boolean;
    };

    const polyScore = data.poly_score != null ? Number(data.poly_score) : null;
    const artifact = data.artifact;

    if (polyScore == null && !artifact) {
      return base('ok', { score: 0, verdict: 'clean', tags: [], raw_summary: { found: false } });
    }

    const { verdict, score } =
      polyScore != null ? polyScoreToVerdict(polyScore) : { verdict: 'unknown' as Verdict, score: 0 };

    const tags: string[] = ['polyswarm-hit'];
    if (polyScore != null) tags.push(`polyscore:${polyScore.toFixed(2)}`);
    if (artifact?.type) tags.push(`filetype:${artifact.type.toLowerCase()}`);

    const assertions = data.assertions ?? [];
    const total = assertions.length;
    const malicious = assertions.filter((a) => a.verdict === true).length;

    return base('ok', {
      score,
      verdict,
      tags,
      raw_summary: {
        found: true,
        poly_score: polyScore,
        engines_total: total,
        engines_malicious: malicious,
        sha256: artifact?.sha256 ?? '',
        file_type: artifact?.type ?? '',
        file_name: artifact?.filename ?? '',
        first_seen: artifact?.first_seen ?? '',
      },
    });
  } catch (err) {
    return base('error', toProviderError(classifyThrownError(err)));
  }
};
