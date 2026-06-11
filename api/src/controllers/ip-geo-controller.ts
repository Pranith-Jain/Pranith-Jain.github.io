import type { Context } from 'hono';
import type { Env } from '../env';
import { abuseipdb } from '../providers/abuseipdb';
import { spur } from '../providers/spur';
import { ipinfo } from '../providers/ipinfo';
import { fetchResilient } from '../lib/fetch-resilient';
import { safeNullLog } from '../lib/safe-catch';
import { buildIpGeoResponse } from '../core/use-cases';
import type { IpWhoIsResponse } from '../core/use-cases';

const FETCH_TIMEOUT = 8_000;
const CACHE_TTL = 3600;
const RE_IPV4 = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;
const RE_IPV6 = /^[0-9a-fA-F:]+$/;

async function fetchIpWhoIs(ip: string): Promise<IpWhoIsResponse | null> {
  try {
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

function buildProviderEnv(c: Context<{ Bindings: Env }>) {
  return {
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
}

export function createIpGeoController() {
  return {
    async lookup(c: Context<{ Bindings: Env }>): Promise<Response> {
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
      const provEnv = buildProviderEnv(c);

      const [geoRaw, repRaw] = await Promise.all([
        fetchIpWhoIs(ip),
        safeNullLog('provider-abuseipdb', abuseipdb({ value: ip, type: kind }, provEnv, ctrl.signal)),
      ]);
      clearTimeout(timer);

      const provEnvForPrivacy = {
        ...provEnv,
        CROWDSEC_API_KEY: c.env.CROWDSEC_API_KEY,
        IPINFO_TOKEN: c.env.IPINFO_TOKEN,
      };

      const [spurRaw, ipinfoRaw] = await Promise.all([
        safeNullLog('provider-spur', spur({ value: ip, type: kind }, provEnvForPrivacy, ctrl.signal)),
        safeNullLog('provider-ipinfo', ipinfo({ value: ip, type: kind }, provEnvForPrivacy, ctrl.signal)),
      ]);

      const body = buildIpGeoResponse({
        ip,
        kind,
        ipwhois: geoRaw,
        abuseipdb: repRaw
          ? {
              score: repRaw.score,
              verdict: repRaw.verdict,
              raw_summary: repRaw.raw_summary,
              error: repRaw.error,
              status: repRaw.status,
            }
          : null,
        spur: spurRaw ? { status: spurRaw.status, raw_summary: spurRaw.raw_summary } : null,
        ipinfo: ipinfoRaw ? { status: ipinfoRaw.status, raw_summary: ipinfoRaw.raw_summary } : null,
      });

      const allFailed = !geoOk(body) && !repOk(repRaw) && !spurOk(spurRaw) && !ipinfoOk(ipinfoRaw);
      if (allFailed) {
        return c.json(body, 200, { 'Cache-Control': 'public, max-age=60' });
      }

      const response = c.json(body, 200, {
        'Cache-Control': `public, max-age=${CACHE_TTL}`,
      });
      c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));
      return response;
    },
  };
}

function geoOk(body: { geo: { ok: boolean } }): boolean {
  return body.geo.ok;
}

function repOk(r: { status?: string } | null): boolean {
  return !!r && r.status === 'ok';
}

function spurOk(r: { status?: string } | null): boolean {
  return !!r && r.status === 'ok';
}

function ipinfoOk(r: { status?: string } | null): boolean {
  return !!r && r.status === 'ok';
}
