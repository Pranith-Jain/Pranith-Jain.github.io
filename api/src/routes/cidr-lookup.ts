import type { Context } from 'hono';
import type { Env } from '../env';
import { badRequest, notFound, internalError, badGateway, serviceUnavailable, tooManyRequests, payloadTooLarge } from '../lib/api-error';
import { cachedJson } from '../lib/route-cache';

interface CidrEntry {
  cidr: string;
  description: string;
  country: string;
  registry: string;
}

interface CidrLookupResult {
  query: string;
  query_type: 'ip' | 'asn' | 'domain';
  cidrs: CidrEntry[];
  total: number;
  source: string;
  fetched_at: string;
}

/**
 * CIDR/ASN discovery — finds IP ranges for a given IP, ASN, or domain.
 * Uses bgp.he.net (free, no API key). Equivalent to metabigor's `net` command.
 */
export async function cidrLookupHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const query = c.req.query('ip') ?? c.req.query('asn') ?? c.req.query('domain');
  if (!query) return badRequest(c, 'missing ip, asn, or domain param');

  const clean = query.trim().toLowerCase();

  // Detect input type
  let searchUrl: string;
  let queryType: 'ip' | 'asn' | 'domain';

  if (/^as\d+$/i.test(clean)) {
    // ASN input like AS13335
    searchUrl = `https://bgp.he.net/${encodeURIComponent(clean)}/json`;
    queryType = 'asn';
  } else if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(clean)) {
    // IP input
    searchUrl = `https://bgp.he.net/net/${encodeURIComponent(clean)}/json`;
    queryType = 'ip';
  } else if (/^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}$/i.test(clean)) {
    // Domain — resolve first then look up
    searchUrl = `https://bgp.he.net/dns/${encodeURIComponent(clean)}/json`;
    queryType = 'domain';
  } else {
    return badRequest(c, 'unrecognized input — use IP, ASN (ASxxxx), or domain');
  }

  return cachedJson(c, `cidr-lookup:${queryType}:${clean}`, 3600, async () => {
    const res = await fetch(searchUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DFIR-Portfolio/1.0)' },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) throw new Error(`bgp.he.net returned ${res.status}`);

    const data = (await res.json()) as Array<{
      cidr: string;
      asn: string;
      as_description: string;
      as_country: string;
      rir: string;
      ip?: string;
    }>;

    const cidrs: CidrEntry[] = [];
    const seen = new Set<string>();

    for (const entry of data) {
      const cidr = entry.cidr;
      if (cidr && !seen.has(cidr)) {
        seen.add(cidr);
        cidrs.push({
          cidr,
          description: entry.as_description || entry.asn || '',
          country: entry.as_country || '',
          registry: entry.rir || '',
        });
      }
    }

    return {
      query: clean,
      query_type: queryType,
      cidrs,
      total: cidrs.length,
      source: 'bgp.he.net',
      fetched_at: new Date().toISOString(),
    } as CidrLookupResult;
  });
}
