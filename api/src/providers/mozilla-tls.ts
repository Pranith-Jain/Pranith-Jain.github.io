import type { ProviderAdapter, ProviderResult, Verdict } from './types';
import { classifyResponseError, toProviderError } from '../lib/provider-errors';

const supports = new Set(['domain', 'ipv4', 'ipv6']);

interface HttpObservatoryResult {
  grade?: string;
  score?: number;
  scan_id?: number;
  state?: 'ABORTED' | 'FAILED' | 'FINISHED' | 'PENDING' | 'STARTING' | 'RUNNING';
  tests_failed?: number;
  tests_passed?: number;
  tests_quantity?: number;
  response_headers?: Record<string, unknown>;
  error?: string;
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
    // The hosted TLS Observatory (tls-observatory.services.mozilla.com) was
    // retired — the host is NXDOMAIN. Mozilla's live successor with the same
    // A+…F grade semantics is the HTTP Observatory.
    const res = await fetch(
      `https://http-observatory.security.mozilla.org/api/v1/analyze?host=${encodeURIComponent(indicator.value)}`,
      {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(15000),
      }
    );

    // The Observatory is frequently flaky (502s under load). A transient
    // upstream outage shouldn't litter the IOC page with red error cards —
    // surface it as a neutral scan-unavailable state instead.
    if (res.status === 429) return base('error', toProviderError(classifyResponseError(res)));
    if (!res.ok) {
      return base('unsupported', {
        error: `${res.status} from Mozilla Observatory (service under load)`,
        error_code: 'upstream_5xx',
        error_tags: ['upstream-5xx', String(res.status)],
        tags: ['mozilla-observatory-unavailable'],
        raw_summary: { reason: `${res.status} from Mozilla Observatory (service under load)` },
      });
    }

    const json = (await res.json()) as HttpObservatoryResult;

    if (json.error || (json.state && json.state !== 'FINISHED')) {
      return base('unsupported', {
        error: json.error ?? 'scan in progress, try again shortly',
        error_code: 'unknown',
        tags: ['scan-pending'],
        raw_summary: { state: json.state ?? 'pending', message: json.error ?? 'scan in progress, try again shortly' },
      });
    }

    const grade = json.grade ?? '';
    const obsScore = json.score ?? 0;

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

    const tags: string[] = [`grade:${grade}`];
    if ((json.tests_failed ?? 0) > 0) tags.push(`${json.tests_failed}-tests-failed`);

    return base('ok', {
      score,
      verdict,
      tags: [...new Set(tags)].slice(0, 7),
      raw_summary: {
        grade,
        score: obsScore,
        scan_id: json.scan_id,
        tests_passed: json.tests_passed,
        tests_failed: json.tests_failed,
        tests_quantity: json.tests_quantity,
      },
    });
  } catch (err) {
    // Network-level failure (DNS/TLS/connection) — treat as unavailable, not a
    // hard error, since this service is a best-effort enrichment.
    return base('unsupported', {
      error: err instanceof Error ? err.message : String(err),
      error_code: 'network',
      error_tags: ['network'],
      tags: ['mozilla-observatory-unavailable'],
      raw_summary: { reason: err instanceof Error ? err.message : String(err) },
    });
  }
};
