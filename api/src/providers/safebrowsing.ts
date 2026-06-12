import type { ProviderAdapter, ProviderResult, Verdict } from './types';
import { classifyResponseError, classifyThrownError, toProviderError } from '../lib/provider-errors';

const supports = new Set(['url', 'domain']);

/**
 * Google Safe Browsing v4 — checks URLs against Google's threat database
 * (malware, social engineering, unwanted software, potentially harmful apps).
 * Free tier: 10,000 req/day. No credit card required.
 *
 * https://developers.google.com/safe-browsing/v4/get-started
 */
export const safebrowsing: ProviderAdapter = async (indicator, env, signal) => {
  const now = new Date().toISOString();
  const base = (status: ProviderResult['status'], extra: Partial<ProviderResult> = {}): ProviderResult => ({
    source: 'safebrowsing',
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

  const key = (env as { GOOGLE_SAFE_BROWSING_API_KEY?: string }).GOOGLE_SAFE_BROWSING_API_KEY;
  if (!key) return base('unsupported', { error: 'no_api_key', error_code: 'no_api_key', error_tags: ['no-api-key'] });

  try {
    // For domains, check the root URL. For URLs, check as-is.
    const checkUrl = indicator.type === 'domain' ? `https://${indicator.value}/` : indicator.value;

    const res = await fetch(
      `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${encodeURIComponent(key)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client: { clientId: 'pranithjain-portfolio', clientVersion: '1.0' },
          threatInfo: {
            threatTypes: ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE', 'POTENTIALLY_HARMFUL_APPLICATION'],
            platformTypes: ['ANY_PLATFORM'],
            threatEntryTypes: ['URL'],
            threatEntries: [{ url: checkUrl }],
          },
        }),
        signal,
      }
    );

    if (!res.ok) return base('error', toProviderError(classifyResponseError(res)));

    const json = (await res.json()) as {
      matches?: Array<{
        threatType?: string;
        platformType?: string;
        threat?: { url?: string };
        cacheDuration?: string;
      }>;
    };

    const matches = json.matches ?? [];

    if (matches.length === 0) {
      return base('ok', {
        score: 0,
        verdict: 'clean',
        raw_summary: { safe: true, threats: [] },
        tags: ['safe'],
      });
    }

    // Derive score and verdict from threat types
    const threatTypes = [...new Set(matches.map((m) => m.threatType ?? 'UNKNOWN'))];
    const hasMalware = threatTypes.includes('MALWARE');
    const hasPhishing = threatTypes.includes('SOCIAL_ENGINEERING');
    const hasUnwanted = threatTypes.includes('UNWANTED_SOFTWARE');

    let score = 40; // base for any match
    if (hasMalware) score = 90;
    else if (hasPhishing) score = 80;
    else if (hasUnwanted) score = 60;

    const verdict: Verdict = score >= 80 ? 'malicious' : score >= 50 ? 'suspicious' : 'unknown';

    const tags: string[] = threatTypes.map((t) => t.toLowerCase().replace(/_/g, '-'));

    return base('ok', {
      score,
      verdict,
      raw_summary: {
        safe: false,
        threats: threatTypes,
        threat_count: matches.length,
      },
      tags,
    });
  } catch (err) {
    return base('error', toProviderError(classifyThrownError(err)));
  }
};
