import type { Context } from 'hono';
import type { Env } from '../env';

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
  if (!query) return c.json({ error: 'missing ip, asn, or domain param' }, 400);

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
    return c.json({ error: 'unrecognized input — use IP, ASN (ASxxxx), or domain' }, 400);
  }

  try {
    const res = await fetch(searchUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DFIR-Portfolio/1.0)' },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      return c.json({ error: `bgp.he.net returned ${res.status}` }, 502);
    }

    const data = (await res.json()) as Array<{
      cidr: string;
      asn: string;
      as_description: string;
      as_country: string;
      rir: string;
      // For DNS lookups, the shape is different
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

    const result: CidrLookupResult = {
      query: clean,
      query_type: queryType,
      cidrs,
      total: cidrs.length,
      source: 'bgp.he.net',
      fetched_at: new Date().toISOString(),
    };

    return c.json(result, 200, { 'Cache-Control': 'public, max-age=3600' });
  } catch (err) {
    console.error('handler failed:', err instanceof Error ? err.message : String(err));
    return c.json({ error: `CIDR lookup failed: ${err instanceof Error ? err.message : String(err)}` }, 502);
  }
}
