import type { ProviderAdapter, ProviderResult, Verdict } from './types';
import { classifyResponseError, classifyThrownError, toProviderError } from '../lib/provider-errors';

const supports = new Set(['domain', 'ipv4', 'ipv6']);

interface MozillaTlsResult {
  scanId?: number;
  url?: string;
  status?: 'completed' | 'pending' | 'error';
  results?: {
    score?: number;
    grade?: string;
    protocols?: string[];
    cipherSuites?: string[];
    signatureAlgorithms?: string[];
    keyExchange?: string;
    keyStrength?: number;
    vulnerabilities?: string[];
    warnings?: string[];
  };
}

export const mozillaTls: ProviderAdapter = async (indicator, _env, _signal) => {
  const now = new Date().toISOString();
  const base = (status: ProviderResult['status'], extra: Partial<ProviderResult> = {}): ProviderResult => ({
    source: 'mozilla-tls',
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
    const res = await fetch(
      `https://tls-observatory.services.mozilla.com/api/v1/scan?url=${encodeURIComponent(indicator.value)}`,
      {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(15000),
      }
    );

    if (res.status === 429) return base('error', toProviderError(classifyResponseError(res)));
    if (!res.ok) return base('error', toProviderError(classifyResponseError(res)));

    const json = (await res.json()) as MozillaTlsResult;

    if (json.status === 'pending') {
      return base('ok', {
        verdict: 'unknown',
        tags: ['scan-pending'],
        raw_summary: { status: 'pending', message: 'TLS scan in progress, try again shortly' },
      });
    }

    if (json.status === 'error' || !json.results) {
      return base('ok', {
        verdict: 'unknown',
        tags: ['scan-error'],
        raw_summary: { status: 'error', message: 'TLS scan failed' },
      });
    }

    const results = json.results;
    const grade = results.grade ?? '';
    const tlsScore = results.score ?? 0;

    const gradeToVerdict: Record<string, Verdict> = {
      'A+': 'clean',
      A: 'clean',
      'A-': 'clean',
      'B+': 'unknown',
      B: 'unknown',
      'B-': 'unknown',
      'C+': 'suspicious',
      C: 'suspicious',
      'C-': 'suspicious',
      'D+': 'malicious',
      D: 'malicious',
      E: 'malicious',
      F: 'malicious',
      M: 'malicious',
      T: 'malicious',
    };

    const verdict = gradeToVerdict[grade] ?? 'unknown';
    const score = verdict === 'malicious' ? 70 : verdict === 'suspicious' ? 40 : 0;

    const tags: string[] = [`tls-grade:${grade}`];
    if (results.vulnerabilities && results.vulnerabilities.length > 0) {
      results.vulnerabilities.forEach((v) => tags.push(`vuln:${v}`));
    }
    if (results.protocols) {
      results.protocols.forEach((p) => tags.push(`proto:${p}`));
    }

    return base('ok', {
      score,
      verdict,
      tags: [...new Set(tags)].slice(0, 7),
      raw_summary: {
        grade,
        score: tlsScore,
        protocols: results.protocols,
        cipher_suites: results.cipherSuites?.slice(0, 5),
        key_exchange: results.keyExchange,
        key_strength: results.keyStrength,
        vulnerabilities: results.vulnerabilities,
        warnings: results.warnings?.slice(0, 5),
      },
    });
  } catch (err) {
    return base('error', toProviderError(classifyThrownError(err)));
  }
};
