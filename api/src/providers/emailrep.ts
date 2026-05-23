import type { ProviderAdapter, ProviderResult, Verdict } from './types';

/**
 * EmailRep.io — reputation lookup for an email address.
 *
 * Free anonymous tier (~100 req/hr per IP) works without a key. Setting
 * `EMAILREP_API_KEY` as a Worker secret bumps the rate-limit ceiling.
 *
 * Maps the upstream verdict surface to our composite shape:
 *   - malicious (score ≥ 85) when `malicious_activity` OR `details.blacklisted`
 *     OR `details.spam` is true
 *   - suspicious (score 55) when `credentials_leaked` OR `data_breach` OR
 *     the top-level `suspicious` flag is set
 *   - clean (score 0) otherwise
 *
 * `tags` mirror the upstream booleans so downstream consumers can re-derive
 * verdict without re-calling. `details.disposable` and `details.free_provider`
 * are surfaced as informational tags rather than risk signals — many
 * legitimate users have disposable or free-provider addresses.
 */

const supports = new Set(['email']);

interface EmailRepResponse {
  email?: string;
  reputation?: 'high' | 'medium' | 'low' | 'none';
  suspicious?: boolean;
  references?: number;
  details?: {
    blacklisted?: boolean;
    malicious_activity?: boolean;
    malicious_activity_recent?: boolean;
    credentials_leaked?: boolean;
    credentials_leaked_recent?: boolean;
    data_breach?: boolean;
    first_seen?: string;
    last_seen?: string;
    domain_exists?: boolean;
    domain_reputation?: string;
    new_domain?: boolean;
    days_since_domain_creation?: number;
    suspicious_tld?: boolean;
    spam?: boolean;
    free_provider?: boolean;
    disposable?: boolean;
    deliverable?: boolean;
    accept_all?: boolean;
    valid_mx?: boolean;
    spoofable?: boolean;
    spf_strict?: boolean;
    dmarc_enforced?: boolean;
    profiles?: string[];
  };
}

export const emailrep: ProviderAdapter = async (indicator, env, signal) => {
  const now = new Date().toISOString();
  const base = (status: ProviderResult['status'], extra: Partial<ProviderResult> = {}): ProviderResult => ({
    source: 'emailrep',
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

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': 'pranithjain.qzz.io DFIR toolkit',
  };
  // The free tier accepts unauthenticated calls; the key just lifts the
  // rate ceiling. We tolerate either configuration silently.
  const key = (env as { EMAILREP_API_KEY?: string }).EMAILREP_API_KEY;
  if (key) headers.Key = key;

  try {
    const res = await fetch(`https://emailrep.io/${encodeURIComponent(indicator.value)}`, {
      headers,
      signal,
    });

    // 429 → quota; surface as error so the composite shows the gap rather
    // than implying a clean verdict.
    if (res.status === 429) return base('error', { error: 'rate_limited' });
    if (!res.ok) return base('error', { error: `${res.status} ${res.statusText}`.trim() });

    const data = (await res.json()) as EmailRepResponse;
    const d = data.details ?? {};

    const malicious = Boolean(d.blacklisted || d.malicious_activity || d.spam);
    const suspicious = Boolean(d.credentials_leaked || d.data_breach || data.suspicious);

    const tags: string[] = [];
    if (d.blacklisted) tags.push('blacklisted');
    if (d.malicious_activity) tags.push('malicious-activity');
    if (d.malicious_activity_recent) tags.push('malicious-activity-recent');
    if (d.credentials_leaked) tags.push('credentials-leaked');
    if (d.data_breach) tags.push('data-breach');
    if (d.spam) tags.push('spam');
    if (d.disposable) tags.push('disposable');
    if (d.free_provider) tags.push('free-provider');
    if (d.spoofable) tags.push('spoofable');
    if (d.suspicious_tld) tags.push('suspicious-tld');

    let score: number;
    let verdict: Verdict;
    if (malicious) {
      score = 90;
      verdict = 'malicious';
    } else if (suspicious) {
      score = 55;
      verdict = 'suspicious';
    } else if (data.reputation === 'low') {
      // Low reputation without any explicit malicious/suspicious flag —
      // worth surfacing as suspicious so the composite reflects it.
      score = 40;
      verdict = 'suspicious';
    } else {
      score = 0;
      verdict = 'clean';
    }

    return base('ok', {
      score,
      verdict,
      tags,
      raw_summary: {
        reputation: data.reputation ?? 'unknown',
        references: data.references ?? 0,
        domain_exists: d.domain_exists ?? false,
        domain_reputation: d.domain_reputation ?? '',
        first_seen: d.first_seen ?? '',
        last_seen: d.last_seen ?? '',
        deliverable: d.deliverable ?? false,
        free_provider: d.free_provider ?? false,
        disposable: d.disposable ?? false,
      },
    });
  } catch (err) {
    return base('error', { error: err instanceof Error ? err.message : String(err) });
  }
};
