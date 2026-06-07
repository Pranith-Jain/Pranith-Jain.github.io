/**
 * Provider error classifier.
 *
 * Every IOC-enrichment provider eventually surfaces the same shape of
 * failure: upstream 5xx, rate-limited 429, missing key 401/403, network
 * abort, JSON parse. Before this helper, each provider re-implemented its
 * own ad-hoc error string ("502 Bad Gateway", "rate_limited", "feed_unavailable",
 * "vulncheck_fetch_failed") and the only way to tell one from the other
 * downstream was string parsing.
 *
 * This module produces a structured result the provider spreads into its
 * `base('error', …)` so the UI can group / filter / color without parsing:
 *
 *   { error, error_code, error_status, error_tags }
 *
 * `code` is the bucket; `error_status` is the numeric HTTP status when
 * known; `error_tags` mirrors `code` plus the numeric status so the front
 * end can do `result.error_tags.includes('rate-limited')` directly.
 */

import type { ProviderErrorCode, ProviderResult } from '../providers/types';

export interface ProviderErrorInfo {
  /** Short, human-readable message. Same shape as the legacy `error: string`. */
  error: string;
  /** Categorical code. */
  code: ProviderErrorCode;
  /** Numeric status, when the error came from a `Response`. */
  status?: number;
  /** Stable, UI-friendly tags (always includes the code + numeric status). */
  tags: string[];
}

/**
 * Classify an `AbortError` or fetch-level failure (no `Response` object).
 * `name` is `err.name` — `AbortError` means our 8s timeout fired;
 * `TypeError` usually means DNS / TLS / connection refused.
 */
export function classifyThrownError(err: unknown): ProviderErrorInfo {
  const message = err instanceof Error ? err.message : String(err);
  const isAbort = err instanceof Error && err.name === 'AbortError';
  if (isAbort) {
    return {
      error: 'timeout',
      code: 'timeout',
      tags: ['timeout', 'aborted'],
    };
  }
  return {
    error: `network: ${message}`,
    code: 'network',
    tags: ['network'],
  };
}

/**
 * Classify a non-OK `Response` (status >= 400).
 *
 * Buckets:
 *   401            → unauthorized
 *   403            → forbidden
 *   404            → not_found
 *   408            → timeout (request timeout from upstream)
 *   429            → rate_limited
 *   5xx            → upstream_5xx
 *   other 4xx      → upstream_4xx
 */
export function classifyResponseError(res: Response): ProviderErrorInfo {
  const status = res.status;
  const statusText = res.statusText || '';
  const base = `${status} ${statusText}`.trim();

  if (status === 401) {
    return { error: 'unauthorized', code: 'unauthorized', status, tags: ['unauthorized', '401'] };
  }
  if (status === 403) {
    return { error: 'forbidden', code: 'forbidden', status, tags: ['forbidden', '403'] };
  }
  if (status === 404) {
    return { error: 'not_found', code: 'not_found', status, tags: ['not-found', '404'] };
  }
  if (status === 408) {
    return { error: 'upstream_timeout', code: 'timeout', status, tags: ['timeout', '408'] };
  }
  if (status === 429) {
    return { error: 'rate_limited', code: 'rate_limited', status, tags: ['rate-limited', '429'] };
  }
  if (status >= 500 && status < 600) {
    return { error: base || 'upstream_5xx', code: 'upstream_5xx', status, tags: ['upstream-5xx', String(status)] };
  }
  if (status >= 400 && status < 500) {
    return { error: base || 'upstream_4xx', code: 'upstream_4xx', status, tags: ['upstream-4xx', String(status)] };
  }
  return { error: base || 'unknown_error', code: 'unknown', status, tags: ['unknown', String(status)] };
}

/**
 * Convert a `ProviderErrorInfo` into the partial that providers spread
 * into their `base('error', …)` factory. The `error_code`, `error_status`,
 * and `error_tags` fields are added to `ProviderResult` so the front end
 * gets a structured view of why a provider failed.
 */
export function toProviderError(info: ProviderErrorInfo): Partial<ProviderResult> {
  return {
    error: info.error,
    error_code: info.code,
    error_status: info.status,
    error_tags: [...info.tags],
  };
}
