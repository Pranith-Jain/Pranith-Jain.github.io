import type { Context } from 'hono';
import type { Env } from '../env';
import { abuseipdb } from '../providers/abuseipdb';
import { spur } from '../providers/spur';
import { ipinfo } from '../providers/ipinfo';
import { fetchResilient } from '../lib/fetch-resilient';

/**
 * IP geolocation + reputation lookup.
 *
 * Composite of two sources:
 *   - ipwho.is (free, no key, HTTPS, no documented rate limit) —
 *     country/region/city/isp/org/asn/timezone/lat/lon. Replaces
 *     ip-api.com which was HTTP-only and rate-limited at 45 req/min
 *     per source IP (the shared Worker egress IP hit that cap fast).
 *   - AbuseIPDB (existing provider, key already wired) — abuse
 *     confidence score, total reports, and `usage_type` (which
 *     covers the proxy/hosting/VPN signal we used to read from
 *     ip-api.com's `proxy`/`hosting`/`mobile` flags).
 *
 * Both run in parallel. Either failing degrades gracefully — the other
 * half still renders. Cached 1h at the edge.
 */

const FETCH_TIMEOUT = 8_000;
const CACHE_TTL = 3600; // 1 hour
const RE_IPV4 = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;
const RE_IPV6 = /^[0-9a-fA-F:]+$/;

interface IpWhoIsResponse {
  ip?: string;
  success?: boolean;
  message?: string;
  type?: 'IPv4' | 'IPv6';
  country?: string;
  country_code?: string;
  region?: string;
  region_code?: string;
  city?: string;
  postal?: string;
  latitude?: number;
  longitude?: number;
  timezone?: { id?: string; utc?: string };
  connection?: { asn?: number; org?: string; isp?: string; domain?: string };
}

export interface IpGeoResponse {
  ip: string;
  detected_kind: 'ipv4' | 'ipv6';
  geo: {
    ok: boolean;
    error?: string;
    country?: string;
    country_code?: string;
    region?: string;
    city?: string;
    zip?: string;
    lat?: number;
    lon?: number;
    timezone?: string;
    isp?: string;
    org?: string;
    asn?: string;
    asname?: string;
    reverse_dns?: string;
    is_proxy?: boolean;
    is_hosting?: boolean;
    is_mobile?: boolean;
    source: string;
    source_url: string;
  };
  reputation: {
    ok: boolean;
    error?: string;
    /** AbuseIPDB confidence 0-100. */
    confidence?: number;
    total_reports?: number;
    usage_type?: string;
    verdict?: 'malicious' | 'suspicious' | 'clean' | 'unknown';
    source: string;
    source_url: string;
  };
  /** Privacy/anonymization detection from Spur.us and IPinfo. */
  privacy?: {
    ok: boolean;
    error?: string;
    vpn?: boolean;
    proxy?: boolean;
    tor?: boolean;
    relay?: boolean;
    hosting?: boolean;
    service?: string;
    /** Source of the privacy detection data. */
    source: string;
    source_url: string;
  };
  generated_at: string;
}

async function fetchIpWhoIs(ip: string): Promise<IpWhoIsResponse | null> {
  try {
    // ipwho.is: free, no key, HTTPS, no documented rate cap. The 1h edge
    // cache below means analyst-burst doesn't translate to upstream burst.
    const res = await fetchResilient(
      `https://ipwho.is/${encodeURIComponent(ip)}`,
      { headers: { 'user-agent': 'pranithjain-dfir/1.0' } },
      { attempts: 3, timeoutMs: FETCH_TIMEOUT }
    );
    if (!res.ok) return null;
    return (await res.json()) as IpWhoIsResponse;
  } catch {
    return null;
  }
}

export async function ipGeoHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const ip = (c.req.query('ip') ?? '').trim();
  if (!ip) return c.json({ error: 'missing ip' }, 400);
  if (ip.length > 64) return c.json({ error: 'ip too long' }, 400);

  let kind: 'ipv4' | 'ipv6';
  if (RE_IPV4.test(ip)) kind = 'ipv4';
  else if (RE_IPV6.test(ip) && ip.includes(':')) kind = 'ipv6';
  else return c.json({ error: 'invalid ip address' }, 400);

  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(`https://ip-geo-cache.internal/v1?ip=${encodeURIComponent(ip)}`);
  const cached = await cache.match(cacheKey);
  if (cached) return new Response(cached.body, cached);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
  // Build an explicit ProviderEnv with `?? ''` fallbacks — Env's provider
  // keys are optional secrets, so c.env can't be passed directly to a
  // required-keyed ProviderEnv (same pattern as domain/file/phishing).
  const provEnv = {
    VT_API_KEY: c.env.VT_API_KEY ?? '',
    ABUSEIPDB_API_KEY: c.env.ABUSEIPDB_API_KEY ?? '',
    SHODAN_API_KEY: c.env.SHODAN_API_KEY ?? '',
    CENSYS_PAT: c.env.CENSYS_PAT ?? '',
    CENSYS_ORG_ID: c.env.CENSYS_ORG_ID ?? '',
    NETLAS_API_KEY: c.env.NETLAS_API_KEY ?? '',
    OTX_API_KEY: c.env.OTX_API_KEY ?? '',
    URLSCAN_API_KEY: c.env.URLSCAN_API_KEY ?? '',
    HYBRID_ANALYSIS_API_KEY: c.env.HYBRID_ANALYSIS_API_KEY ?? '',
    ABUSECH_AUTH_KEY: c.env.ABUSECH_AUTH_KEY,
  };
  const [geoRaw, repRaw] = await Promise.all([
    fetchIpWhoIs(ip),
    abuseipdb({ value: ip, type: kind }, provEnv, ctrl.signal).catch(() => null),
  ]);
  clearTimeout(timer);

  const geoOk = !!geoRaw && geoRaw.success === true;
  const repOk = !!repRaw && repRaw.status === 'ok';

  // Build a normalised AS string ("AS15169 Google LLC") to keep the
  // frontend's `asn` slot stable across the source swap — ip-api.com
  // returned `as: "AS15169 Google LLC"` whereas ipwho.is splits it
  // into `connection.asn: 15169` + `connection.org: "Google LLC"`.
  const asStr =
    geoRaw?.connection?.asn !== undefined
      ? `AS${geoRaw.connection.asn}${geoRaw.connection.org ? ` ${geoRaw.connection.org}` : ''}`
      : undefined;

  // AbuseIPDB's `usageType` covers the proxy/hosting/mobile signal we
  // used to read from ip-api.com. Surface a normalised boolean so the
  // frontend's existing `is_hosting`/`is_proxy` slots don't go dark.
  const usageType = (repRaw?.raw_summary as { usageType?: string } | undefined)?.usageType ?? '';
  const usageLower = usageType.toLowerCase();
  const isHosting = /(hosting|data\s*center|cdn)/.test(usageLower);
  const isProxy = /(vpn|proxy|anonymizer|tor)/.test(usageLower);
  const isMobile = /(mobile|cellular)/.test(usageLower);

  const body: IpGeoResponse = {
    ip,
    detected_kind: kind,
    geo:
      geoRaw && geoRaw.success === true
        ? {
            ok: true,
            country: geoRaw.country,
            country_code: geoRaw.country_code,
            region: geoRaw.region,
            city: geoRaw.city,
            zip: geoRaw.postal || undefined,
            lat: geoRaw.latitude,
            lon: geoRaw.longitude,
            timezone: geoRaw.timezone?.id,
            isp: geoRaw.connection?.isp,
            org: geoRaw.connection?.org,
            asn: asStr,
            asname: geoRaw.connection?.org,
            // ipwho.is doesn't return reverse-DNS; the field stays
            // optional so the UI just hides it.
            reverse_dns: undefined,
            is_proxy: repOk ? isProxy : undefined,
            is_hosting: repOk ? isHosting : undefined,
            is_mobile: repOk ? isMobile : undefined,
            source: 'ipwho.is',
            source_url: `https://ipwho.is/${encodeURIComponent(ip)}`,
          }
        : {
            ok: false,
            error: geoRaw?.message ?? 'ipwho.is unreachable or no data',
            source: 'ipwho.is',
            source_url: 'https://ipwho.is',
          },
    reputation:
      repRaw && repRaw.status === 'ok'
        ? {
            ok: true,
            confidence: typeof repRaw.score === 'number' ? repRaw.score : undefined,
            total_reports: (repRaw.raw_summary as { totalReports?: number }).totalReports,
            usage_type: (repRaw.raw_summary as { usageType?: string }).usageType,
            verdict: repRaw.verdict,
            source: 'AbuseIPDB',
            source_url: `https://www.abuseipdb.com/check/${encodeURIComponent(ip)}`,
          }
        : {
            ok: false,
            error: repRaw?.error ?? 'AbuseIPDB unavailable (key may be unset or rate-limited)',
            source: 'AbuseIPDB',
            source_url: `https://www.abuseipdb.com/check/${encodeURIComponent(ip)}`,
          },
    generated_at: new Date().toISOString(),
  };

  // Privacy detection: try Spur.us first (better VPN/proxy detection),
  // fall back to IPinfo's privacy field. Both run in parallel with the
  // existing geo/reputation lookups.
  const provEnvForPrivacy = {
    ...provEnv,
    CROWDSEC_API_KEY: c.env.CROWDSEC_API_KEY,
    IPINFO_TOKEN: c.env.IPINFO_TOKEN,
  };
  const [spurRaw, ipinfoRaw] = await Promise.all([
    spur({ value: ip, type: kind }, provEnvForPrivacy, ctrl.signal).catch(() => null),
    ipinfo({ value: ip, type: kind }, provEnvForPrivacy, ctrl.signal).catch(() => null),
  ]);

  // Merge privacy signals — prefer Spur (dedicated VPN/proxy DB) over
  // IPinfo's privacy field, but use IPinfo as fallback.
  const spurOk = !!spurRaw && spurRaw.status === 'ok';
  const ipinfoOk = !!ipinfoRaw && ipinfoRaw.status === 'ok';

  let privacyData: IpGeoResponse['privacy'];
  if (spurOk || ipinfoOk) {
    const spurSummary = spurOk ? (spurRaw!.raw_summary as { vpn?: boolean; proxy?: boolean; tor?: boolean; relay?: boolean; hosting?: boolean; service?: string }) : {};
    const ipinfoSummary = ipinfoOk ? (ipinfoRaw!.raw_summary as { privacy?: { vpn?: boolean; proxy?: boolean; tor?: boolean; relay?: boolean; hosting?: boolean; service?: string } }) : {};
    const ipinfoPrivacy = ipinfoSummary.privacy ?? {};

    privacyData = {
      ok: true,
      vpn: spurSummary.vpn ?? ipinfoPrivacy.vpn ?? false,
      proxy: spurSummary.proxy ?? ipinfoPrivacy.proxy ?? false,
      tor: spurSummary.tor ?? ipinfoPrivacy.tor ?? false,
      relay: spurSummary.relay ?? ipinfoPrivacy.relay ?? false,
      hosting: spurSummary.hosting ?? ipinfoPrivacy.hosting ?? false,
      service: spurSummary.service ?? ipinfoPrivacy.service ?? undefined,
      source: spurOk ? 'Spur.us' : 'IPinfo',
      source_url: spurOk ? `https://spur.us/context/${encodeURIComponent(ip)}` : `https://ipinfo.io/${encodeURIComponent(ip)}`,
    };
  } else {
    privacyData = {
      ok: false,
      error: 'Privacy detection unavailable (Spur.us and IPinfo both failed or are rate-limited)',
      source: 'none',
      source_url: '',
    };
  }

  body.privacy = privacyData;

  // Enrich the geo section with IPinfo data if ipwho.is failed
  if (!geoOk && ipinfoOk) {
    const ipinfoSummary = ipinfoRaw!.raw_summary as {
      country?: string; city?: string; region?: string;
      asn?: { asn?: string; name?: string };
      company?: { name?: string };
      hostname?: string;
    };
    body.geo = {
      ok: true,
      country: ipinfoSummary.country,
      city: ipinfoSummary.city,
      region: ipinfoSummary.region,
      asn: ipinfoSummary.asn?.asn ? `${ipinfoSummary.asn.asn} ${ipinfoSummary.asn.name ?? ''}`.trim() : undefined,
      asname: ipinfoSummary.asn?.name,
      org: ipinfoSummary.company?.name ?? ipinfoSummary.asn?.name,
      reverse_dns: ipinfoSummary.hostname,
      is_proxy: privacyData.vpn || privacyData.proxy,
      is_hosting: privacyData.hosting,
      source: 'IPinfo',
      source_url: `https://ipinfo.io/${encodeURIComponent(ip)}`,
    };
  }

  // If ALL providers failed this is an all-error body — caching it under a
  // 200 for the full TTL would lock the IP to "unreachable" even after the
  // upstreams recover (same degraded-cache class as breach-disclosures).
  // Serve it with a short TTL and don't poison the shared edge cache.
  if (!geoOk && !repOk && !spurOk && !ipinfoOk) {
    return c.json(body, 200, { 'Cache-Control': 'public, max-age=60' });
  }

  const response = c.json(body, 200, {
    'Cache-Control': `public, max-age=${CACHE_TTL}`,
  });
  c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}
