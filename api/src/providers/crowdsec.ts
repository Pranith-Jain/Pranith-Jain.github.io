import type { ProviderAdapter, ProviderResult, Verdict } from './types';

/**
 * CrowdSec CTI — FREE TIER with API key.
 *
 * CrowdSec is an open-source, crowd-sourced threat intelligence platform.
 * Their CTI API provides:
 *   - IP reputation (malicious, suspicious, safe)
 *   - Attack categories (DDoS, scanner, brute-force, etc.)
 *   - Associated behaviors (what the IP has been doing)
 *   - CrowdSec community reports
 *   - Country, ASN, and reverse DNS
 *   - First/last seen timestamps
 *   - Community trust score
 *
 * Free tier: 1000 lookups/month with API key (free registration).
 * Community endpoint (no key): very limited but still useful.
 *
 * @see https://www.crowdsec.net/cti-api
 */

const supports = new Set(['ipv4', 'ipv6']);

interface CrowdSecResponse {
  ip?: string;
  ip_range?: string;
  ip_range_score?: number;
  country?: string;
  city?: string;
  as?: {
    name?: string;
    number?: number;
  };
  reverse_dns?: string;
 behaviors?: Array<{
    name?: string;
    label?: string;
    description?: string;
  }>;
  attack_details?: Array<{
    name?: string;
    label?: string;
    description?: string;
  }>;
  target_countries?: Record<string, number>;
  classifications?: {
    false_positives?: Array<{ label?: string }>;
    classifications?: Array<{ label?: string; name?: string }>;
  };
  scores?: {
    overall?: {
      agressiveness?: number;
      threat?: number;
      trust?: number;
      anomaly?: number;
      total?: number;
    };
    last_day?: {
      agressiveness?: number;
      threat?: number;
      trust?: number;
      anomaly?: number;
      total?: number;
    };
    last_week?: {
      agressiveness?: number;
      threat?: number;
      trust?: number;
      anomaly?: number;
      total?: number;
    };
    last_month?: {
      agressiveness?: number;
      threat?: number;
      trust?: number;
      anomaly?: number;
      total?: number;
    };
  };
  community?: {
    votes?: {
      malicious?: number;
      safe?: number;
    };
    reports?: Array<{
      reported_at?: string;
      message?: string;
    }>;
  };
  first_seen?: string;
  last_seen?: string;
}

export const crowdsec: ProviderAdapter = async (indicator, env, signal) => {
  const now = new Date().toISOString();
  const base = (status: ProviderResult['status'], extra: Partial<ProviderResult> = {}): ProviderResult => ({
    source: 'crowdsec',
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

  // CrowdSec CTI API key (free registration at crowdsec.net)
  const apiKey = (env as { CROWDSEC_API_KEY?: string }).CROWDSEC_API_KEY;
  if (!apiKey) return base('unsupported', { error: 'no_api_key' });

  try {
    const url = `https://cti.api.crowdsec.net/v2/smoke/${encodeURIComponent(indicator.value)}`;
    const res = await fetch(url, {
      signal,
      headers: {
        Accept: 'application/json',
        'x-api-key': apiKey,
      },
      cf: { cacheTtl: 1800, cacheEverything: true },
    });

    if (res.status === 404) {
      return base('ok', {
        score: 0,
        verdict: 'clean',
        tags: ['no-record'],
        raw_summary: { reason: 'IP not found in CrowdSec CTI' },
      });
    }

    if (res.status === 429) return base('error', { error: 'rate_limited' });
    if (!res.ok) return base('error', { error: `${res.status} ${res.statusText}`.trim() });

    const json = (await res.json()) as CrowdSecResponse;

    // ── Scoring ─────────────────────────────────────────────────────────
    // Use CrowdSec's own threat score (0-100) as primary signal
    const threatScore = json.scores?.overall?.threat ?? 0;
    const trustScore = json.scores?.overall?.trust ?? 100;
    const anomalyScore = json.scores?.overall?.anomaly ?? 0;
    const agressivenessScore = json.scores?.overall?.agressiveness ?? 0;

    // Composite score: weight threat highest, trust is inverse
    let score = Math.round(
      threatScore * 0.5 +
      (100 - trustScore) * 0.3 +
      anomalyScore * 0.1 +
      agressivenessScore * 0.1
    );

    // Community votes boost
    const community = json.community;
    if (community?.votes) {
      const maliciousVotes = community.votes.malicious ?? 0;
      const safeVotes = community.votes.safe ?? 0;
      if (maliciousVotes > safeVotes * 2) score = Math.min(100, score + 15);
    }

    score = Math.min(100, Math.max(0, score));

    // ── Verdict ─────────────────────────────────────────────────────────
    let verdict: Verdict;
    if (score >= 70) verdict = 'malicious';
    else if (score >= 40) verdict = 'suspicious';
    else if (score >= 15) verdict = 'suspicious';
    else verdict = 'clean';

    // ── Tags ────────────────────────────────────────────────────────────
    const tags: string[] = [];

    // Behaviors
    const behaviors = json.behaviors ?? [];
    behaviors.slice(0, 5).forEach((b) => {
      if (b.label) tags.push(b.label);
    });

    // Attack details
    const attacks = json.attack_details ?? [];
    attacks.slice(0, 3).forEach((a) => {
      if (a.label) tags.push(`attack:${a.label}`);
    });

    // Country
    if (json.country) tags.push(json.country);

    // ASN
    if (json.as?.name) tags.push(`asn:${json.as.name}`);

    // First/last seen
    if (json.first_seen) tags.push(`first-seen:${json.first_seen.split('T')[0]}`);
    if (json.last_seen) tags.push(`last-seen:${json.last_seen.split('T')[0]}`);

    // Community reports
    const reports = community?.reports ?? [];
    if (reports.length > 0) tags.push(`reports:${reports.length}`);

    return base('ok', {
      score,
      verdict,
      tags: [...new Set(tags)].slice(0, 10),
      raw_summary: {
        scores: json.scores,
        behaviors: behaviors.slice(0, 5).map((b) => ({ name: b.name, label: b.label })),
        attack_details: attacks.slice(0, 5).map((a) => ({ name: a.name, label: a.label })),
        country: json.country,
        city: json.city,
        as_name: json.as?.name,
        as_number: json.as?.number,
        reverse_dns: json.reverse_dns,
        first_seen: json.first_seen,
        last_seen: json.last_seen,
        community_votes: community?.votes,
        community_reports: reports.slice(0, 3).map((r) => ({
          reported_at: r.reported_at,
          message: r.message?.slice(0, 200),
        })),
        target_countries: json.target_countries,
      },
    });
  } catch (err) {
    return base('error', { error: err instanceof Error ? err.message : String(err) });
  }
};
