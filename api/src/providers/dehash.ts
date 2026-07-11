import type { ProviderAdapter, ProviderResult } from './types';
import { classifyResponseError, classifyThrownError, toProviderError } from '../lib/provider-errors';

const supports = new Set(['hash']);

type HashAlgorithm = 'md5' | 'sha1' | 'sha256' | 'sha384' | 'sha512';

function detectHashType(hash: string): HashAlgorithm | null {
  const len = hash.length;
  if (len === 32 && /^[a-f0-9]{32}$/i.test(hash)) return 'md5';
  if (len === 40 && /^[a-f0-9]{40}$/i.test(hash)) return 'sha1';
  if (len === 64 && /^[a-f0-9]{64}$/i.test(hash)) return 'sha256';
  if (len === 96 && /^[a-f0-9]{96}$/i.test(hash)) return 'sha384';
  if (len === 128 && /^[a-f0-9]{128}$/i.test(hash)) return 'sha512';
  return null;
}

interface DehashResponse {
  found?: boolean;
  hash?: string;
  type?: string;
  decrypted?: string;
  error?: string;
}

export const dehash: ProviderAdapter = async (indicator, env, signal) => {
  const now = new Date().toISOString();
  const base = (status: ProviderResult['status'], extra: Partial<ProviderResult> = {}): ProviderResult => ({
    source: 'dehash',
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

  const hashType = detectHashType(indicator.value);
  if (!hashType) {
    return base('unsupported');
  }

  try {
    const url = `https://api.dehash.lt/api/v1/lookup?hash=${encodeURIComponent(indicator.value)}&type=${hashType}`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal,
    });

    if (res.status === 429) return base('error', toProviderError(classifyResponseError(res)));
    if (res.status === 404) {
      return base('ok', {
        verdict: 'clean',
        tags: ['hash-not-found'],
        raw_summary: { found: false, reason: 'hash not in database' },
      });
    }
    if (!res.ok) return base('error', toProviderError(classifyResponseError(res)));

    const json = (await res.json()) as DehashResponse;

    if (!json.found || !json.decrypted) {
      return base('ok', {
        verdict: 'clean',
        tags: ['hash-not-found'],
        raw_summary: { found: false, hash_type: hashType },
      });
    }

    const decrypted = json.decrypted;
    const tags: string[] = ['cracked'];
    // Classify the decrypted value roughly
    if (/^.{1,30}\s.{1,30}$/.test(decrypted)) tags.push('likely-credentials');
    else if (/\d{4,}/.test(decrypted)) tags.push('contains-numbers');
    else if (decrypted.length < 12) tags.push('short-password');

    return base('ok', {
      score: 30,
      verdict: 'suspicious',
      tags,
      raw_summary: {
        found: true,
        hash_type: hashType,
        decrypted_value: decrypted,
        decrypted_length: decrypted.length,
      },
    });
  } catch (err) {
    return base('error', toProviderError(classifyThrownError(err)));
  }
};
