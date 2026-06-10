import type { Context } from 'hono';
import type { Env } from '../env';

interface PassiveDnsRecord {
  domain: string;
  ip: string;
  first_seen: string;
  last_seen: string;
  source: string;
  status: 'active' | 'inactive';
  asn?: string;
  country?: string;
  provider?: string;
}

interface PassiveDnsResponse {
  total: number;
  records: PassiveDnsRecord[];
  query: string;
  query_type: 'domain' | 'ip' | 'subdomain';
  timestamp: string;
  /** Set when the query type cannot be served by the available data sources
   *  (e.g. crt.sh resolves cert SANs for a name, not reverse-IP lookups). */
  note?: string;
}

/** crt.sh `output=json` row shape (subset we consume). Other fields exist but
 *  are unused here; crt.sh occasionally serves a 502/HTML or a non-array error
 *  body, so callers MUST guard with `Array.isArray` before iterating. */
interface CrtShCert {
  common_name?: string;
  name_value?: string;
  not_before?: string;
  not_after?: string;
  entry_timestamp?: string;
}

const CACHE_TTL = 3600;
const API_TIMEOUT = 15000;

async function fetchCrtShDns(domain: string): Promise<PassiveDnsRecord[]> {
  try {
    const url = `https://crt.sh/?q=%25.${encodeURIComponent(domain)}&output=json`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(API_TIMEOUT),
      headers: { 'User-Agent': 'pranithjain-dfir/1.0' },
    });
    if (!res.ok) return [];
    const data = await res.json();
    // crt.sh frequently returns a non-array body (502 HTML, `{}` error object)
    // even with a 200 — iterating that throws 'not iterable'. Guard first.
    const certs: CrtShCert[] = Array.isArray(data) ? (data as CrtShCert[]) : [];
    const records: PassiveDnsRecord[] = [];

    for (const cert of certs) {
      const names = cert.name_value
        ? cert.name_value.split('\n').filter(Boolean)
        : cert.common_name
          ? [cert.common_name]
          : [];
      for (const name of names.slice(0, 10)) {
        records.push({
          domain: name,
          ip: '',
          first_seen: cert.not_before ?? '',
          last_seen: cert.entry_timestamp ?? cert.not_after ?? '',
          source: 'crt.sh',
          status: 'active',
        });
      }
    }
    return records;
  } catch {
    return [];
  }
}

export async function passiveDnsLookupHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const query = (c.req.query('q') ?? '').trim();
  if (!query) return c.json({ error: 'missing query parameter (q)' }, 400);

  const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(query);
  const isDomain = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/.test(
    query
  );

  if (!isIp && !isDomain) {
    return c.json({ error: 'invalid query format (must be domain or IPv4)' }, 400);
  }

  const queryType: 'domain' | 'ip' | 'subdomain' = isIp
    ? 'ip'
    : query.includes('.') && query.split('.').length > 2
      ? 'subdomain'
      : 'domain';

  // crt.sh is a certificate-transparency search keyed on names — it cannot
  // resolve an IP back to the domains hosted on it. Rather than feeding an IP
  // to crt.sh (which yields garbage/empty), return a typed empty result that
  // explains the limitation while preserving the response contract.
  if (isIp) {
    const response: PassiveDnsResponse = {
      total: 0,
      records: [],
      query,
      query_type: 'ip',
      timestamp: new Date().toISOString(),
      note: 'Reverse-IP passive DNS is not available from the configured sources (crt.sh indexes certificate names, not IP→domain mappings). Query a domain instead.',
    };
    return c.json(response, 200, {
      'Cache-Control': `public, max-age=${CACHE_TTL}`,
    });
  }

  try {
    let records: PassiveDnsRecord[] = [];

    const [crtRecords] = await Promise.allSettled([fetchCrtShDns(query)]);

    if (crtRecords.status === 'fulfilled') records = [...records, ...crtRecords.value];

    const uniqueRecords = records
      .filter((r, i, arr) => arr.findIndex((x) => x.domain === r.domain && x.ip === r.ip) === i)
      .sort((a, b) => new Date(b.last_seen).getTime() - new Date(a.last_seen).getTime())
      .slice(0, 100);

    const response: PassiveDnsResponse = {
      total: uniqueRecords.length,
      records: uniqueRecords,
      query,
      query_type: queryType,
      timestamp: new Date().toISOString(),
    };

    return c.json(response, 200, {
      'Cache-Control': `public, max-age=${CACHE_TTL}`,
    });
  } catch (err) {
    return c.json(
      {
        error: 'Passive DNS lookup failed',
        message: err instanceof Error ? err.message : 'Unknown error',
      },
      502,
      { 'Cache-Control': 'no-store' }
    );
  }
}
