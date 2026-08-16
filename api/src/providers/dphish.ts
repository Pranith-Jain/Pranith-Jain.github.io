/**
 * dPhish provider adapter — phishing indicator feed (dphish.com, TAXII 2.1).
 *
 * Unlike the network adapters, dPhish is a replicated static vertical: the
 * indicators ship in public/data/threat-intel/dphish/ and are read through
 * the ASSETS binding via the shared threat-intel manifest loader — zero
 * network egress, no API key, and the manifest index is LRU-cached per
 * isolate so repeated checks cost nothing.
 *
 * Match semantics: exact match on the normalized indicator value against
 * the feed's indicator values. Active (non-revoked) indicators are
 * malicious; revoked/inactive ones are suspicious (the indicator was
 * withdrawn, not declared clean).
 */

import type { ProviderAdapter, ProviderEnv, ProviderResult } from './types';
import { loadDphishIndex } from '../lib/threat-intel-manifest';

function makeErrorResult(source: ProviderResult['source'], err: unknown): ProviderResult {
  return {
    source,
    status: 'error',
    score: 0,
    verdict: 'unknown',
    raw_summary: {},
    tags: [],
    error: err instanceof Error ? err.message : String(err),
    fetched_at: new Date().toISOString(),
    cached: false,
  };
}

/**
 * Normalize an indicator value to compare against feed values.
 * Lowercases, strips a trailing dot (domains) and trailing slashes (URLs).
 */
function normalize(v: string): string {
  return v.trim().toLowerCase().replace(/\.$/, '').replace(/\/+$/, '');
}

/** Extract the hostname from a URL value, if it parses. */
function hostOf(urlValue: string): string | null {
  try {
    return new URL(urlValue).hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    return null;
  }
}

export const dphish: ProviderAdapter = async (indicator, env: ProviderEnv): Promise<ProviderResult> => {
  if (!env.ASSETS) {
    return {
      source: 'dphish',
      status: 'unsupported',
      score: 0,
      verdict: 'unknown',
      raw_summary: { note: 'ASSETS binding unavailable — dPhish feed not loaded' },
      tags: [],
      fetched_at: new Date().toISOString(),
      cached: false,
    };
  }

  try {
    const idx = await loadDphishIndex(env.ASSETS);
    const needle = normalize(indicator.value);
    const nd = hostOf(needle);

    // Prefer exact matches against feed values; for domain indicators also
    // accept the host of a matching URL indicator (feed stores URLs as-is).
    const match =
      idx.indicators.find((i) => i.value !== null && normalize(i.value) === needle) ??
      (indicator.type === 'domain'
        ? idx.indicators.find((i) => {
            if (i.value === null) return false;
            const h = hostOf(i.value);
            return !!h && h === needle;
          })
        : undefined) ??
      (nd ? idx.indicators.find((i) => i.value !== null && hostOf(i.value) === nd) : undefined);

    if (!match) {
      return {
        source: 'dphish',
        status: 'ok',
        score: 0,
        verdict: 'clean',
        raw_summary: { in_feed: false, feed_size: idx.indicators.length },
        tags: ['dphish'],
        fetched_at: new Date().toISOString(),
        cached: false,
      };
    }

    const active = match.active && !match.revoked;
    return {
      source: 'dphish',
      status: 'ok',
      score: active ? 85 : 45,
      verdict: active ? 'malicious' : 'suspicious',
      raw_summary: {
        in_feed: true,
        category: match.category,
        matched_value: match.value,
        confidence: match.confidence,
        opencti_score: match.score,
        created: match.created,
        modified: match.modified,
        valid_until: match.validUntil,
        revoked: match.revoked,
        active: match.active,
      },
      tags: ['dphish', 'phishing', match.category, active ? 'active' : match.revoked ? 'revoked' : 'inactive'],
      fetched_at: new Date().toISOString(),
      cached: false,
    };
  } catch (err) {
    return makeErrorResult('dphish', err);
  }
};
