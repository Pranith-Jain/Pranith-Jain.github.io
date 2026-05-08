import type { Context } from 'hono';
import type { Env } from '../env';
import { safeErrorMessage } from '../lib/error';

const ASN_RE = /^(?:AS)?(\d{1,10})$/i;
const UA = 'Mozilla/5.0 (compatible; pranithjain-dfir/1.0; +https://pranithjain.qzz.io)';

interface RipeAsOverview {
  data?: {
    holder?: string;
    type?: string;
    block?: { resource?: string; desc?: string; name?: string };
    is_announced?: boolean;
  };
}

interface RipeAnnouncedPrefixes {
  data?: {
    prefixes?: Array<{ prefix?: string; timelines?: Array<{ starttime?: string }> }>;
  };
}

interface RipeWhois {
  data?: {
    records?: Array<Array<{ key?: string; value?: string }>>;
  };
}

export interface AsnLookupResponse {
  asn: number;
  name?: string;
  description?: string;
  type?: string;
  is_announced?: boolean;
  abuse_contacts?: string[];
  rir?: { name?: string; description?: string };
  prefixes_v4: number;
  prefixes_v6: number;
  sample_prefixes_v4: string[];
  sample_prefixes_v6: string[];
}

function isV6(prefix: string): boolean {
  return prefix.includes(':');
}

export async function asnLookupHandler(c: Context<{ Bindings: Env }>) {
  const raw = c.req.query('asn');
  if (!raw) return c.json({ error: 'missing asn' }, 400);
  const m = raw.match(ASN_RE);
  if (!m) return c.json({ error: 'invalid asn (expected AS15169 or 15169)' }, 400);
  const num = parseInt(m[1], 10);

  try {
    const headers = { 'user-agent': UA, accept: 'application/json' };
    const signal = AbortSignal.timeout(8000);
    const [overviewRes, prefixesRes, whoisRes] = await Promise.all([
      fetch(`https://stat.ripe.net/data/as-overview/data.json?resource=AS${num}`, { headers, signal }),
      fetch(`https://stat.ripe.net/data/announced-prefixes/data.json?resource=AS${num}`, { headers, signal }),
      fetch(`https://stat.ripe.net/data/whois/data.json?resource=AS${num}`, { headers, signal }),
    ]);

    if (!overviewRes.ok) {
      return c.json({ error: `upstream ${overviewRes.status}` }, 502, { 'Cache-Control': 'no-store' });
    }
    const overview = (await overviewRes.json()) as RipeAsOverview;
    const prefixes = prefixesRes.ok
      ? ((await prefixesRes.json()) as RipeAnnouncedPrefixes)
      : { data: { prefixes: [] } };
    const whois = whoisRes.ok ? ((await whoisRes.json()) as RipeWhois) : { data: { records: [] } };

    const allPrefixes = (prefixes.data?.prefixes ?? []).map((p) => p.prefix).filter((s): s is string => !!s);
    const v4 = allPrefixes.filter((p) => !isV6(p));
    const v6 = allPrefixes.filter(isV6);

    // Extract abuse contacts from whois records (looking for keys like 'abuse-mailbox')
    const abuseContacts: string[] = [];
    for (const record of whois.data?.records ?? []) {
      for (const field of record) {
        if (field.key === 'abuse-mailbox' && field.value) abuseContacts.push(field.value);
      }
    }

    const body: AsnLookupResponse = {
      asn: num,
      name: overview.data?.holder,
      description: overview.data?.holder,
      type: overview.data?.type,
      is_announced: overview.data?.is_announced,
      abuse_contacts: Array.from(new Set(abuseContacts)).slice(0, 5),
      rir: {
        name: overview.data?.block?.name,
        description: overview.data?.block?.desc,
      },
      prefixes_v4: v4.length,
      prefixes_v6: v6.length,
      sample_prefixes_v4: v4.slice(0, 5),
      sample_prefixes_v6: v6.slice(0, 5),
    };

    return c.json(body, 200, { 'Cache-Control': 'public, max-age=86400' });
  } catch (err) {
    return c.json({ error: safeErrorMessage(c.env as never, err) }, 502, { 'Cache-Control': 'no-store' });
  }
}
