import type { ProviderAdapter, ProviderResult, Verdict } from './types';
import { classifyResponseError, classifyThrownError, toProviderError } from '../lib/provider-errors';

const supports = new Set(['hash']);

/**
 * CIRCL Hashlookup — known-good hash detection backed by NSRL and custom datasets.
 * Free, no auth. A 200 hit means the hash is on a curated list of legitimate files
 * (Microsoft, Apple, Adobe, distro packages, etc.). 404 = unknown.
 */
export const hashlookup: ProviderAdapter = async (indicator, _env, signal) => {
  const now = new Date().toISOString();
  const base = (status: ProviderResult['status'], extra: Partial<ProviderResult> = {}): ProviderResult => ({
    source: 'hashlookup',
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

  const len = indicator.value.length;
  const algo = len === 32 ? 'md5' : len === 40 ? 'sha1' : len === 64 ? 'sha256' : null;
  if (!algo) return base('error', { error: 'invalid_hash_length' });

  try {
    const res = await fetch(`https://hashlookup.circl.lu/lookup/${algo}/${indicator.value}`, {
      headers: { Accept: 'application/json' },
      signal,
    });

    if (res.status === 404) {
      return base('ok', { score: 0, verdict: 'unknown', tags: [], raw_summary: { known_good: false } });
    }
    if (!res.ok) return base('error', toProviderError(classifyResponseError(res)));

    const data = (await res.json()) as HashlookupResponse;
    const knownMalicious = data.KnownMalicious === true;
    const verdict: Verdict = knownMalicious ? 'malicious' : 'clean';
    const tags = knownMalicious ? ['hashlookup-malicious'] : ['known-good'];
    if (data.source) tags.push(`src:${String(data.source).toLowerCase()}`);

    return base('ok', {
      score: knownMalicious ? 95 : 0,
      verdict,
      tags,
      raw_summary: {
        known_good: !knownMalicious,
        file_name: data.FileName ?? '',
        file_size: data.FileSize ?? 0,
        source: data.source ?? '',
        product: data.ProductCode ?? data.product ?? '',
      },
    });
  } catch (err) {
    return base('error', toProviderError(classifyThrownError(err)));
  }
};

interface HashlookupResponse {
  KnownMalicious?: boolean;
  FileName?: string;
  FileSize?: number | string;
  source?: string;
  ProductCode?: string;
  product?: string;
}
