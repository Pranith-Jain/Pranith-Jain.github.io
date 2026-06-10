import type { ProviderAdapter, ProviderResult } from './types';
import { classifyResponseError, classifyThrownError, toProviderError } from '../lib/provider-errors';

const supports = new Set(['ipv4', 'email']);
const API = 'https://api.stopforumspam.org/api';

/**
 * The queried value (ip or email) is echoed back as a nested object keyed by
 * the param name, e.g. `{ success: 1, ip: { value, appears, frequency,
 * lastseen, confidence, asn, country, torexit } }`. `confidence` is a 0-100
 * percentage and is omitted entirely when the indicator is not listed.
 */
interface StopForumSpamEntry {
  value?: string;
  appears?: number;
  frequency?: number;
  confidence?: number;
  lastseen?: string;
  asn?: number;
  country?: string;
  torexit?: number;
}

interface StopForumSpamResponse {
  success: number;
  ip?: StopForumSpamEntry;
  email?: StopForumSpamEntry;
  error?: string;
}

/**
 * StopForumSpam — FREE, NO AUTH.
 *
 * Checks IPs and emails against the StopForumSpam database of known
 * forum spammers. Provides frequency, confidence score, and last
 * seen date. No API key required for basic lookups (5000/day limit).
 *
 * @see https://www.stopforumspam.com/usage
 */
export const stopforumspam: ProviderAdapter = async (indicator, _env, signal) => {
  const now = new Date().toISOString();
  const base = (status: ProviderResult['status'], extra: Partial<ProviderResult> = {}): ProviderResult => ({
    source: 'stopforumspam',
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
    const param = indicator.type === 'email' ? 'email' : 'ip';
    const url = `${API}?${param}=${encodeURIComponent(indicator.value)}&json&confidence`;
    const res = await fetch(url, {
      signal,
      headers: { 'User-Agent': 'threat-intel-platform/1.0', Accept: 'application/json' },
      cf: { cacheTtl: 3600, cacheEverything: true },
    });

    if (!res.ok) return base('error', toProviderError(classifyResponseError(res)));

    const data: StopForumSpamResponse = await res.json();
    if (!data.success) {
      return base('error', {
        error: data.error ?? 'API returned non-success',
        error_code: 'upstream_4xx',
        error_tags: ['upstream-4xx'],
      });
    }

    // The queried value is echoed back nested under the param key
    // (`data.ip` or `data.email`), not at the top level.
    const d: StopForumSpamEntry = data[param] ?? {};
    const appears = d.appears ?? 0;
    // `confidence` is already a 0-100 percentage in the upstream response and
    // is omitted entirely when the indicator is not listed.
    const confidence = d.confidence ?? 0;
    const frequency = d.frequency ?? 0;
    const lastseen = d.lastseen;

    if (!appears && !confidence) {
      return base('ok', {
        score: 0,
        verdict: 'clean',
        tags: ['not-listed'],
        raw_summary: { reason: 'Not found in StopForumSpam database' },
      });
    }

    const score = Math.min(95, Math.round(confidence));
    return base('ok', {
      score,
      verdict: score >= 70 ? 'malicious' : score >= 30 ? 'suspicious' : 'clean',
      tags: ['stopforumspam-listed', ...(frequency > 10 ? ['high-frequency'] : [])],
      raw_summary: {
        appears,
        confidence: Math.round(confidence * 100) / 100,
        frequency,
        lastseen,
      },
    });
  } catch (err) {
    return base('error', toProviderError(classifyThrownError(err)));
  }
};
