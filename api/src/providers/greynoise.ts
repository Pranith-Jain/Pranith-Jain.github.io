import type { ProviderAdapter, ProviderResult, Verdict } from './types';
import { classifyResponseError, classifyThrownError, toProviderError } from '../lib/provider-errors';

/**
 * GreyNoise community endpoint — KEYLESS.
 *
 * The community endpoint is rate-limited (~50 lookups/day from any one
 * source IP, per their public docs) but requires no signup. We use it
 * to enrich IP verdicts with two specific signals:
 *
 *   • `noise=true`           → the IP is mass-scanning the internet
 *     (Shodan / Censys / Stretchoid / Recyber / Onyphe / etc). Most
 *     SOCs treat scanner noise as low-priority once attributed.
 *   • `riot=true`            → the IP belongs to a known benign service
 *     (Google DNS, Cloudflare 1.1.1.1, Microsoft, etc). RIOT entries
 *     are basically "do not block".
 *
 * Plus `classification` ∈ {malicious, suspicious, benign, unknown}.
 *
 * The endpoint returns HTTP 404 when GreyNoise has no record of an IP —
 * not an error from our perspective, just an "unknown" signal. We treat
 * 404 the same as a 200 with classification=unknown.
 */

const supports = new Set(['ipv4', 'ipv6']);

interface GreyNoiseCommunityResponse {
  ip?: string;
  noise?: boolean;
  riot?: boolean;
  classification?: 'malicious' | 'suspicious' | 'benign' | 'unknown';
  name?: string;
  link?: string;
  last_seen?: string;
  message?: string;
}

export const greynoise: ProviderAdapter = async (indicator, _env, signal) => {
  const now = new Date().toISOString();
  const base = (status: ProviderResult['status'], extra: Partial<ProviderResult> = {}): ProviderResult => ({
    source: 'greynoise',
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
    const res = await fetch(`https://api.greynoise.io/v3/community/${encodeURIComponent(indicator.value)}`, {
      headers: { Accept: 'application/json' },
      signal,
      cf: { cacheTtl: 1800, cacheEverything: true },
    });

    // 404 is the "no record" case — surface as unknown, not an error.
    if (res.status === 404) {
      return base('ok', {
        verdict: 'unknown',
        raw_summary: { classification: 'unknown', noise: false, riot: false },
        tags: ['no-record'],
      });
    }
    if (res.status === 429) return base('error', toProviderError(classifyResponseError(res)));
    if (!res.ok) return base('error', toProviderError(classifyResponseError(res)));

    const json = (await res.json()) as GreyNoiseCommunityResponse;
    const classification = json.classification ?? 'unknown';
    const noise = json.noise === true;
    const riot = json.riot === true;

    // Verdict mapping prioritises GreyNoise's own classification, then
    // RIOT (benign service) — overrides any "malicious" if the IP is e.g.
    // Cloudflare's resolver — and finally noise (which only means
    // mass-scanner, not necessarily hostile).
    let verdict: Verdict;
    if (riot) verdict = 'clean';
    else if (classification === 'malicious') verdict = 'malicious';
    else if (classification === 'suspicious') verdict = 'suspicious';
    else if (classification === 'benign') verdict = 'clean';
    else verdict = 'unknown';

    // Score from verdict so the IOC checker's combined-score logic works.
    const score = verdict === 'malicious' ? 90 : verdict === 'suspicious' ? 50 : verdict === 'clean' ? 0 : 10;

    const tags: string[] = [];
    if (riot) tags.push(`RIOT: ${json.name ?? 'benign service'}`);
    if (noise) tags.push('internet-scanner');
    if (classification === 'malicious') tags.push('classified-malicious');
    if (classification === 'suspicious') tags.push('classified-suspicious');

    return base('ok', {
      score,
      verdict,
      raw_summary: {
        classification,
        noise,
        riot,
        name: json.name,
        last_seen: json.last_seen,
        link: json.link,
      },
      tags,
    });
  } catch (err) {
    return base('error', toProviderError(classifyThrownError(err)));
  }
};
