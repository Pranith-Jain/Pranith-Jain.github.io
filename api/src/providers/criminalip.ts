import type { ProviderAdapter, ProviderResult, Verdict } from './types';

/**
 * CriminalIP — FREE TIER with API key.
 *
 * CriminalIP provides:
 *   - IP reputation scoring
 *   - Vulnerability scanning results
 *   - Malware/botnet detection
 *   - Phishing site detection
 *   - Mining/crypto detection
 *   - Remote access detection
 *
 * Free tier: 100 lookups/month with free registration.
 *
 * @see https://www.criminalip.io/
 */

const supports = new Set(['ipv4', 'ipv6']);

interface CriminalIPResponse {
  ip?: string;
  score?: {
    in_out_bound?: number;
    maliciousness_score?: number;
    recent_abuse?: boolean;
  };
  country?: string;
  city?: string;
  org?: string;
  as_no?: number;
  isp?: string;
  is_malicious?: boolean;
  is_vpn?: boolean;
  is_tor?: boolean;
  is_proxy?: boolean;
  is_cloud?: boolean;
  is_scanner?: boolean;
  is_botnet?: boolean;
  is_phishing?: boolean;
  is_mining?: boolean;
  is_remote_access?: boolean;
  port?: number[];
  vulnerability?: {
    count?: number;
    cves?: string[];
  };
}

export const criminalip: ProviderAdapter = async (indicator, env, signal) => {
  const now = new Date().toISOString();
  const base = (status: ProviderResult['status'], extra: Partial<ProviderResult> = {}): ProviderResult => ({
    source: 'criminalip',
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

  const apiKey = (env as { CRIMINALIP_API_KEY?: string }).CRIMINALIP_API_KEY;
  if (!apiKey) return base('unsupported', { error: 'no_api_key' });

  try {
    const url = `https://api.criminalip.io/v1/ip/data?ip=${encodeURIComponent(indicator.value)}`;
    const res = await fetch(url, {
      signal,
      headers: {
        'x-api-key': apiKey,
        Accept: 'application/json',
      },
      cf: { cacheTtl: 3600, cacheEverything: true },
    });

    if (res.status === 404) {
      return base('ok', {
        score: 0,
        verdict: 'clean',
        tags: ['not-found'],
        raw_summary: { reason: 'IP not found in CriminalIP' },
      });
    }

    if (res.status === 429) return base('error', { error: 'rate_limited' });
    if (!res.ok) return base('error', { error: `${res.status} ${res.statusText}`.trim() });

    const json = (await res.json()) as CriminalIPResponse;

    // ── Scoring ─────────────────────────────────────────────────────────
    let score = 0;

    // Use CriminalIP's own maliciousness score if available
    if (json.score?.maliciousness_score !== undefined) {
      score = Math.min(100, json.score.maliciousness_score);
    } else if (json.is_malicious) {
      score = 70;
    }

    // Boost for specific threat types
    if (json.is_botnet) score = Math.min(100, score + 20);
    if (json.is_phishing) score = Math.min(100, score + 15);
    if (json.is_malicious) score = Math.min(100, score + 10);

    // Lower for benign services
    if (json.is_cloud && !json.is_malicious) score = Math.max(0, score - 20);

    // ── Verdict ─────────────────────────────────────────────────────────
    let verdict: Verdict;
    if (score >= 70) verdict = 'malicious';
    else if (score >= 40) verdict = 'suspicious';
    else if (json.is_vpn || json.is_tor || json.is_proxy) verdict = 'suspicious';
    else verdict = 'clean';

    // ── Tags ────────────────────────────────────────────────────────────
    const tags: string[] = [];
    if (json.is_malicious) tags.push('malicious');
    if (json.is_vpn) tags.push('vpn');
    if (json.is_tor) tags.push('tor');
    if (json.is_proxy) tags.push('proxy');
    if (json.is_cloud) tags.push('cloud');
    if (json.is_scanner) tags.push('scanner');
    if (json.is_botnet) tags.push('botnet');
    if (json.is_phishing) tags.push('phishing');
    if (json.is_mining) tags.push('mining');
    if (json.is_remote_access) tags.push('remote-access');
    if (json.country) tags.push(json.country);
    if (json.org) tags.push(`org:${json.org}`);

    return base('ok', {
      score,
      verdict,
      tags: [...new Set(tags)].slice(0, 8),
      raw_summary: {
        maliciousness_score: json.score?.maliciousness_score,
        is_malicious: json.is_malicious,
        is_vpn: json.is_vpn,
        is_tor: json.is_tor,
        is_proxy: json.is_proxy,
        is_cloud: json.is_cloud,
        is_scanner: json.is_scanner,
        is_botnet: json.is_botnet,
        is_phishing: json.is_phishing,
        is_mining: json.is_mining,
        is_remote_access: json.is_remote_access,
        country: json.country,
        city: json.city,
        org: json.org,
        isp: json.isp,
        as_no: json.as_no,
        ports: json.port?.slice(0, 20),
        vulnerabilities: json.vulnerability,
      },
    });
  } catch (err) {
    return base('error', { error: err instanceof Error ? err.message : String(err) });
  }
};
