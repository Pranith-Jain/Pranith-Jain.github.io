import type { ProviderAdapter, ProviderResult, Verdict } from './types';

/**
 * IPinfo.io — FREE TIER (50k requests/month with free token).
 *
 * IPinfo provides:
 *   - IP geolocation (country, city, region)
 *   - ASN and network information
 *   - Privacy detection (VPN, proxy, tor, relay)
 *   - Company information
 *   - Abuse contact
 *   - Hosted domains count
 *
 * The free tier without a token is rate-limited but still useful.
 * With a free token (register at ipinfo.io), you get 50k requests/month.
 *
 * @see https://ipinfo.io/
 */

const supports = new Set(['ipv4', 'ipv6']);

interface IPinfoResponse {
  ip?: string;
  hostname?: string;
  city?: string;
  region?: string;
  country?: string;
  loc?: string; // lat,long
  org?: string; // "AS13335 Cloudflare, Inc."
  postal?: string;
  timezone?: string;
  asn?: {
    asn?: string;
    name?: string;
    domain?: string;
    route?: string;
    type?: string;
  };
  company?: {
    name?: string;
    domain?: string;
    type?: string;
  };
  privacy?: {
    vpn?: boolean;
    proxy?: boolean;
    tor?: boolean;
    relay?: boolean;
    hosting?: boolean;
    service?: string;
  };
  abuse?: {
    address?: string;
    country?: string;
    email?: string;
    name?: string;
    network?: string;
    phone?: string;
  };
  domains?: {
    total?: number;
    domains?: string[];
  };
}

export const ipinfo: ProviderAdapter = async (indicator, env, signal) => {
  const now = new Date().toISOString();
  const base = (status: ProviderResult['status'], extra: Partial<ProviderResult> = {}): ProviderResult => ({
    source: 'ipinfo',
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
    // IPinfo token (optional — improves rate limits)
    const token = (env as { IPINFO_TOKEN?: string }).IPINFO_TOKEN;
    const tokenParam = token ? `?token=${token}` : '';

    const url = `https://ipinfo.io/${encodeURIComponent(indicator.value)}/json${tokenParam}`;
    const res = await fetch(url, {
      signal,
      headers: { Accept: 'application/json' },
      cf: { cacheTtl: 3600, cacheEverything: true },
    });

    if (res.status === 404) {
      return base('ok', {
        score: 0,
        verdict: 'clean',
        tags: ['no-record'],
        raw_summary: { reason: 'IP not found in IPinfo' },
      });
    }

    if (res.status === 429) return base('error', { error: 'rate_limited' });
    if (!res.ok) return base('error', { error: `${res.status} ${res.statusText}`.trim() });

    const json = (await res.json()) as IPinfoResponse;

    const privacy = json.privacy ?? {};
    const isVpn = privacy.vpn === true;
    const isProxy = privacy.proxy === true;
    const isTor = privacy.tor === true;
    const isRelay = privacy.relay === true;
    const isHosting = privacy.hosting === true;
    const privacyService = privacy.service ?? '';

    const asn = json.asn ?? {};
    const company = json.company ?? {};
    const abuse = json.abuse ?? {};
    const domains = json.domains ?? {};

    // ── Scoring ─────────────────────────────────────────────────────────
    let score = 0;

    // Privacy/anonymization scoring
    if (isTor) score += 35;
    if (isProxy) score += 25;
    if (isVpn) score += 15;
    if (isRelay) score += 10;
    if (isHosting) score += 5;

    // Many hosted domains can indicate shared hosting (common for phishing)
    const hostedDomains = domains.total ?? 0;
    if (hostedDomains > 100) score += 15;
    else if (hostedDomains > 50) score += 8;
    else if (hostedDomains > 10) score += 3;

    // Known hosting providers with abuse contacts are lower risk
    if (abuse.email && isHosting) score = Math.max(0, score - 10);

    score = Math.min(100, score);

    // ── Verdict ─────────────────────────────────────────────────────────
    let verdict: Verdict;
    if (isTor) verdict = 'suspicious';
    else if (isProxy) verdict = 'suspicious';
    else if (isVpn) verdict = 'suspicious';
    else if (isHosting && hostedDomains > 50) verdict = 'suspicious';
    else if (isHosting) verdict = 'clean';
    else verdict = 'clean';

    // ── Tags ────────────────────────────────────────────────────────────
    const tags: string[] = [];

    // Privacy tags
    if (isTor) tags.push('tor-exit-node');
    if (isVpn) tags.push('vpn');
    if (isProxy) tags.push('proxy');
    if (isRelay) tags.push('relay');
    if (isHosting) tags.push('hosting-provider');
    if (privacyService) tags.push(`privacy:${privacyService}`);

    // Network tags
    if (asn.name) tags.push(`asn:${asn.name}`);
    if (asn.asn) tags.push(asn.asn);
    if (asn.type) tags.push(`type:${asn.type}`);

    // Company tags
    if (company.name && company.name !== asn.name) tags.push(`company:${company.name}`);
    if (company.type) tags.push(`company-type:${company.type}`);

    // Location tags
    if (json.country) tags.push(json.country);
    if (json.city) tags.push(json.city);

    // Domain count
    if (hostedDomains > 0) tags.push(`domains:${hostedDomains}`);

    // Abuse contact available
    if (abuse.email) tags.push('has-abuse-contact');

    return base('ok', {
      score,
      verdict,
      tags: [...new Set(tags)].slice(0, 10),
      raw_summary: {
        country: json.country,
        city: json.city,
        region: json.region,
        loc: json.loc,
        timezone: json.timezone,
        hostname: json.hostname,
        asn: {
          asn: asn.asn,
          name: asn.name,
          domain: asn.domain,
          route: asn.route,
          type: asn.type,
        },
        company: {
          name: company.name,
          domain: company.domain,
          type: company.type,
        },
        privacy: {
          vpn: isVpn,
          proxy: isProxy,
          tor: isTor,
          relay: isRelay,
          hosting: isHosting,
          service: privacyService,
        },
        abuse: {
          email: abuse.email,
          name: abuse.name,
          phone: abuse.phone,
        },
        hosted_domains: hostedDomains,
        org: json.org,
      },
    });
  } catch (err) {
    return base('error', { error: err instanceof Error ? err.message : String(err) });
  }
};
