import type { Context } from 'hono';
import type { Env } from '../env';
import { abuseipdb } from '../providers/abuseipdb';
import { fetchResilient } from '../lib/fetch-resilient';

/**
 * IP geolocation + reputation lookup.
 *
 * Composite of two sources:
 *   - ip-api.com (free, no key, 45 req/min/IP) — country/region/city/isp/
 *     org/asn/timezone/proxy/hosting/mobile/reverse-dns
 *   - AbuseIPDB (existing provider, key already wired) — abuse confidence
 *     score, total reports, usage type
 *
 * Both run in parallel. Either failing degrades gracefully — the other
 * half still renders. Cached 1h at the edge.
 *
 * Single-IP only here. Batch mode (paste up to N IPs, get a table) is
 * a planned follow-up — ip-api.com has a JSON POST batch endpoint up to
 * 100 IPs/request.
 */

const FETCH_TIMEOUT = 8_000;
const CACHE_TTL = 3600; // 1 hour
const RE_IPV4 = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;
const RE_IPV6 = /^[0-9a-fA-F:]+$/;

interface IpApiResponse {
  status?: 'success' | 'fail';
  message?: string;
  country?: string;
  countryCode?: string;
  region?: string;
  regionName?: string;
  city?: string;
  zip?: string;
  lat?: number;
  lon?: number;
  timezone?: string;
  currency?: string;
  isp?: string;
  org?: string;
  as?: string;
  asname?: string;
  reverse?: string;
  mobile?: boolean;
  proxy?: boolean;
  hosting?: boolean;
  query?: string;
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
  generated_at: string;
}

async function fetchIpApi(ip: string): Promise<IpApiResponse | null> {
  try {
    // Bitmask 66846719 = all useful fields except those we don't render.
    // ip-api.com free tier is HTTP-only (45 req/min/IP — rate-limits the
    // shared Worker IP), so retry on 429/5xx via fetchResilient.
    const res = await fetchResilient(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=66846719`,
      { headers: { 'user-agent': 'pranithjain-dfir/1.0' } },
      { attempts: 3, timeoutMs: FETCH_TIMEOUT }
    );
    if (!res.ok) return null;
    return (await res.json()) as IpApiResponse;
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
  if (cached) return cached;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
  const [geoRaw, repRaw] = await Promise.all([
    fetchIpApi(ip),
    abuseipdb({ value: ip, type: kind }, c.env, ctrl.signal).catch(() => null),
  ]);
  clearTimeout(timer);

  const body: IpGeoResponse = {
    ip,
    detected_kind: kind,
    geo:
      geoRaw && geoRaw.status === 'success'
        ? {
            ok: true,
            country: geoRaw.country,
            country_code: geoRaw.countryCode,
            region: geoRaw.regionName,
            city: geoRaw.city,
            zip: geoRaw.zip || undefined,
            lat: geoRaw.lat,
            lon: geoRaw.lon,
            timezone: geoRaw.timezone,
            isp: geoRaw.isp,
            org: geoRaw.org,
            asn: geoRaw.as,
            asname: geoRaw.asname,
            reverse_dns: geoRaw.reverse || undefined,
            is_proxy: geoRaw.proxy,
            is_hosting: geoRaw.hosting,
            is_mobile: geoRaw.mobile,
            source: 'ip-api.com',
            source_url: 'https://ip-api.com',
          }
        : {
            ok: false,
            error: geoRaw?.message ?? 'ip-api.com unreachable or no data',
            source: 'ip-api.com',
            source_url: 'https://ip-api.com',
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

  const response = c.json(body, 200, {
    'Cache-Control': `public, max-age=${CACHE_TTL}`,
  });
  c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}
