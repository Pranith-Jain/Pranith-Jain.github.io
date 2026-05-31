import type { ProviderAdapter, ProviderResult, Verdict } from './types';

/**
 * Spur.us — requires API key for v2 endpoint.
 *
 * Spur.us provides intelligence on VPN, proxy, and residential IP
 * addresses. The v2 API requires authentication — the old community
 * endpoint no longer works without a token.
 *
 * Set SPUR_API_KEY environment variable with your Spur.us API token.
 * Free tier available at https://spur.us/
 *
 * @see https://spur.us/
 */

const supports = new Set(['ipv4', 'ipv6']);

interface SpurResponse {
  ip?: string;
  client?: {
    proxy?: boolean;
    vpn?: boolean;
    tor?: boolean;
    relay?: boolean;
    hosting?: boolean;
    service?: string;
  };
  organizations?: Array<{
    name?: string;
    type?: string;
  }>;
  location?: {
    country?: string;
    state?: string;
    city?: string;
  };
}

export const spur: ProviderAdapter = async (indicator, env, signal) => {
  const now = new Date().toISOString();
  const base = (status: ProviderResult['status'], extra: Partial<ProviderResult> = {}): ProviderResult => ({
    source: 'spur',
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

  // Spur.us v2 API requires authentication
  const apiKey = (env as { SPUR_API_KEY?: string }).SPUR_API_KEY;
  if (!apiKey) return base('unsupported', { error: 'no_api_key' });

  try {
    const url = `https://api.spur.us/v2/context/${encodeURIComponent(indicator.value)}`;
    const res = await fetch(url, {
      signal,
      headers: {
        Accept: 'application/json',
        Token: apiKey,
      },
      cf: { cacheTtl: 3600, cacheEverything: true },
    });

    if (res.status === 404) {
      return base('ok', {
        score: 0,
        verdict: 'clean',
        tags: ['no-record'],
        raw_summary: { reason: 'IP not found in Spur database' },
      });
    }

    if (res.status === 429) return base('error', { error: 'rate_limited' });
    if (!res.ok) return base('error', { error: `${res.status} ${res.statusText}`.trim() });

    const json = (await res.json()) as SpurResponse;

    const client = json.client ?? {};
    const isVpn = client.vpn === true;
    const isProxy = client.proxy === true;
    const isTor = client.tor === true;
    const isRelay = client.relay === true;
    const isHosting = client.hosting === true;
    const service = client.service ?? '';
    const orgs = json.organizations ?? [];

    // ── Scoring ─────────────────────────────────────────────────────────
    // Anonymization services get a moderate score — they're suspicious but
    // not inherently malicious. The context from other providers matters.
    let score = 0;
    if (isTor) score += 40; // Tor exit nodes are higher risk
    if (isVpn) score += 15;
    if (isProxy) score += 20;
    if (isRelay) score += 10;
    if (isHosting) score += 5; // hosting alone is low risk

    score = Math.min(100, score);

    // ── Verdict ─────────────────────────────────────────────────────────
    let verdict: Verdict;
    if (isTor) verdict = 'suspicious';
    else if (isProxy) verdict = 'suspicious';
    else if (isVpn) verdict = 'suspicious';
    else if (isHosting) verdict = 'clean';
    else verdict = 'clean';

    // If there's a specific service name, it's less likely to be malicious
    // (known VPN provider vs unknown proxy)
    if (service && (isVpn || isProxy)) {
      score = Math.max(0, score - 10);
    }

    // ── Tags ────────────────────────────────────────────────────────────
    const tags: string[] = [];
    if (isTor) tags.push('tor-exit-node');
    if (isVpn) tags.push('vpn');
    if (isProxy) tags.push('proxy');
    if (isRelay) tags.push('relay');
    if (isHosting) tags.push('hosting-provider');
    if (service) tags.push(`service:${service}`);
    if (orgs.length > 0 && orgs[0]?.name) tags.push(`org:${orgs[0].name}`);
    if (json.location?.country) tags.push(json.location.country);

    return base('ok', {
      score,
      verdict,
      tags: [...new Set(tags)].slice(0, 8),
      raw_summary: {
        vpn: isVpn,
        proxy: isProxy,
        tor: isTor,
        relay: isRelay,
        hosting: isHosting,
        service,
        organizations: orgs.slice(0, 3).map((o) => ({ name: o.name, type: o.type })),
        location: json.location,
      },
    });
  } catch (err) {
    return base('error', { error: err instanceof Error ? err.message : String(err) });
  }
};
