import type { Context } from 'hono';
import type { Env } from '../env';

const ASN_RE = /^(AS)?\d{1,10}$/i;

interface BgpViewAsnData {
  asn: number;
  name?: string;
  description_short?: string;
  country_code?: string;
  website?: string;
  email_contacts?: string[];
  abuse_contacts?: string[];
  rir_allocation?: {
    rir_name?: string;
    country_code?: string;
    date_allocated?: string;
  };
  date_updated?: string;
}

interface BgpViewPrefixEntry {
  prefix: string;
}

interface BgpViewPrefixData {
  ipv4_prefixes?: BgpViewPrefixEntry[];
  ipv6_prefixes?: BgpViewPrefixEntry[];
}

export interface AsnLookupResponse {
  asn: number;
  name?: string;
  description?: string;
  country_code?: string;
  website?: string;
  abuse_contacts?: string[];
  email_contacts?: string[];
  rir?: { name: string; country: string; date_allocated?: string };
  prefixes_v4: number;
  prefixes_v6: number;
  sample_prefixes_v4?: string[];
  sample_prefixes_v6?: string[];
  date_updated?: string;
}

export async function asnLookupHandler(c: Context<{ Bindings: Env }>) {
  const raw = c.req.query('asn');

  if (!raw) {
    return c.json({ error: 'missing_param', message: 'Provide ?asn=AS15169 or ?asn=15169' }, 400);
  }

  if (!ASN_RE.test(raw.trim())) {
    return c.json(
      { error: 'invalid_asn', message: 'ASN must be a number with optional AS prefix (e.g. AS15169 or 15169)' },
      400
    );
  }

  const num = raw.trim().replace(/^AS/i, '');

  const [asnRes, prefixRes] = await Promise.all([
    fetch(`https://api.bgpview.io/asn/${num}`, {
      headers: { 'User-Agent': 'pranithjain-dfir/1.0 (+https://pranithjain.qzz.io)' },
    }).catch(() => null),
    fetch(`https://api.bgpview.io/asn/${num}/prefixes`, {
      headers: { 'User-Agent': 'pranithjain-dfir/1.0 (+https://pranithjain.qzz.io)' },
    }).catch(() => null),
  ]);

  if (!asnRes || !asnRes.ok) {
    return c.json({ error: 'upstream_error', message: 'Could not reach BGPView API' }, 502);
  }

  let asnBody: { status: string; data?: BgpViewAsnData };
  try {
    asnBody = (await asnRes.json()) as typeof asnBody;
  } catch {
    return c.json({ error: 'parse_error', message: 'Failed to parse BGPView response' }, 502);
  }

  if (asnBody.status !== 'ok' || !asnBody.data) {
    return c.json({ error: 'not_found', message: `ASN ${num} not found` }, 404);
  }

  const d = asnBody.data;

  let prefixV4: string[] = [];
  let prefixV6: string[] = [];

  if (prefixRes?.ok) {
    try {
      const prefixBody = (await prefixRes.json()) as { status?: string; data?: BgpViewPrefixData };
      if (prefixBody.data) {
        prefixV4 = (prefixBody.data.ipv4_prefixes ?? []).map((p) => p.prefix);
        prefixV6 = (prefixBody.data.ipv6_prefixes ?? []).map((p) => p.prefix);
      }
    } catch {
      // prefix data is optional — silently ignore
    }
  }

  const response: AsnLookupResponse = {
    asn: d.asn,
    ...(d.name ? { name: d.name } : {}),
    ...(d.description_short ? { description: d.description_short } : {}),
    ...(d.country_code ? { country_code: d.country_code } : {}),
    ...(d.website ? { website: d.website } : {}),
    ...(d.abuse_contacts?.length ? { abuse_contacts: d.abuse_contacts } : {}),
    ...(d.email_contacts?.length ? { email_contacts: d.email_contacts } : {}),
    ...(d.rir_allocation?.rir_name
      ? {
          rir: {
            name: d.rir_allocation.rir_name,
            country: d.rir_allocation.country_code ?? '',
            ...(d.rir_allocation.date_allocated ? { date_allocated: d.rir_allocation.date_allocated } : {}),
          },
        }
      : {}),
    prefixes_v4: prefixV4.length,
    prefixes_v6: prefixV6.length,
    ...(prefixV4.length ? { sample_prefixes_v4: prefixV4.slice(0, 5) } : {}),
    ...(prefixV6.length ? { sample_prefixes_v6: prefixV6.slice(0, 5) } : {}),
    ...(d.date_updated ? { date_updated: d.date_updated } : {}),
  };

  return c.json(response, 200, {
    'Cache-Control': 'public, max-age=86400',
  });
}
