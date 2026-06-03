import type { Context } from 'hono';
import type { Env } from '../env';

// ── Domain Reputation ─────────────────────────────────────────────────────

interface BlacklistCheck {
  source: string;
  listed: boolean;
  details?: string;
}

const IP_DNSBLS = [
  'zen.spamhaus.org',
  'bl.spamcop.net',
  'b.barracudacentral.org',
  'dnsbl.sorbs.net',
  'spam.dnsbl.sorbs.net',
  'dul.dnsbl.sorbs.net',
  'http.dnsbl.sorbs.net',
  'socks.dnsbl.sorbs.net',
  'misc.dnsbl.sorbs.net',
  'smtp.dnsbl.sorbs.net',
  'web.dnsbl.sorbs.net',
  'rbl.interserver.net',
  'bad.psky.me',
  'cbl.abuseat.org',
  'dyna.spamrats.com',
  'noptr.spamrats.com',
  'spam.spamrats.com',
  'all.s5h.net',
  'rbl.efnetrbl.org',
  'ircbl.ueberstimmt.net',
];

const DOMAIN_DNSBLS = [
  'dbl.spamhaus.org',
  'multi.surbl.org',
  'multi.uribl.com',
  'rhsbl.sorbs.net',
  'dbl.nordspam.com',
  'uri.blacklist.list',
];

async function checkIpBlacklist(ip: string, bl: string, signal?: AbortSignal): Promise<BlacklistCheck> {
  try {
    const reversed = ip.split('.').reverse().join('.');
    const query = `${reversed}.${bl}`;
    const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(query)}&type=A`;
    const res = await fetch(url, {
      headers: { accept: 'application/dns-json' },
      signal,
    });
    if (!res.ok) return { source: bl, listed: false };
    const data = (await res.json()) as { Answer?: Array<{ data: string }>; Status?: number };
    const listed = data.Status === 0 && (data.Answer?.length ?? 0) > 0;
    return {
      source: bl,
      listed,
      details: listed ? data.Answer?.[0]?.data : undefined,
    };
  } catch {
    return { source: bl, listed: false };
  }
}

async function checkDomainBlacklist(domain: string, bl: string, signal?: AbortSignal): Promise<BlacklistCheck> {
  try {
    const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(`${domain}.${bl}`)}&type=A`;
    const res = await fetch(url, {
      headers: { accept: 'application/dns-json' },
      signal,
    });
    if (!res.ok) return { source: bl, listed: false };
    const data = (await res.json()) as { Answer?: Array<{ data: string }>; Status?: number };
    const listed = data.Status === 0 && (data.Answer?.length ?? 0) > 0;
    return {
      source: bl,
      listed,
      details: listed ? data.Answer?.[0]?.data : undefined,
    };
  } catch {
    return { source: bl, listed: false };
  }
}

function computeScore(checks: BlacklistCheck[]): number {
  const listed = checks.filter((c) => c.listed).length;
  if (listed === 0) return 100;
  if (listed <= 2) return 70;
  if (listed <= 5) return 40;
  return 10;
}

async function resolveDomain(domain: string, signal?: AbortSignal): Promise<string[]> {
  try {
    const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=A`;
    const res = await fetch(url, {
      headers: { accept: 'application/dns-json' },
      signal,
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { Answer?: Array<{ data: string }>; Status?: number };
    if (data.Status === 3) return [];
    return (data.Answer ?? []).map((a) => a.data).filter((ip) => /^\d+\.\d+\.\d+\.\d+$/.test(ip));
  } catch {
    return [];
  }
}

export async function domainRepHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const domain = c.req.query('domain')?.trim().toLowerCase();
  const ip = c.req.query('ip')?.trim();

  if (!domain && !ip) {
    return c.json({ error: 'domain or ip parameter required' }, 400);
  }

  const target = domain || ip!;
  const isIp = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(target);

  try {
    const signal = AbortSignal.timeout(15_000);

    if (isIp) {
      const checks = await Promise.all(IP_DNSBLS.map((bl) => checkIpBlacklist(target, bl, signal)));
      const score = computeScore(checks);
      return c.json(
        {
          target,
          type: 'ip',
          score,
          checks,
          generated_at: new Date().toISOString(),
        },
        200,
        { 'Cache-Control': 'public, max-age=300' }
      );
    }

    const ips = await resolveDomain(target, signal);
    if (ips.length === 0) {
      return c.json(
        {
          target,
          type: 'domain',
          score: 0,
          error: 'domain does not resolve',
          checks: [],
          generated_at: new Date().toISOString(),
        },
        200,
        { 'Cache-Control': 'public, max-age=60' }
      );
    }

    // Subrequest budget: each DNSBL check is one DoH fetch, and CF caps a
    // Worker at 50 subrequests/invocation. DOMAIN_DNSBLS (6) + N IPs × IP_DNSBLS
    // (17) must stay under that. At 3 IPs this was 6 + 51 = 57 — over the cap,
    // so the tail checks failed with "Too many subrequests". Check only the
    // primary resolved IP (6 + 17 = 23): the A records for one domain almost
    // always share reputation, so the marginal coverage of IPs 2–3 wasn't
    // worth blowing the budget.
    const ipsToCheck = ips.slice(0, 1);
    const [domainChecks, ...ipResults] = await Promise.all([
      Promise.all(DOMAIN_DNSBLS.map((bl) => checkDomainBlacklist(target, bl, signal))),
      ...ipsToCheck.map(async (ipAddr) => ({
        ip: ipAddr,
        checks: await Promise.all(IP_DNSBLS.map((bl) => checkIpBlacklist(ipAddr, bl, signal))),
      })),
    ]);

    const allChecks = [...domainChecks, ...ipResults.flatMap((r) => r.checks)];
    const score = computeScore(allChecks);

    return c.json(
      {
        target,
        type: 'domain',
        score,
        domain: domainChecks,
        ips: ipResults,
        generated_at: new Date().toISOString(),
      },
      200,
      { 'Cache-Control': 'public, max-age=300' }
    );
  } catch (e) {
    return c.json(
      {
        error: e instanceof Error ? e.message : 'reputation check failed',
      },
      500
    );
  }
}

// ── Domain Monitor (Typosquat Detection) ──────────────────────────────────

const TLD_SWAPS = ['.com', '.net', '.org', '.co', '.io', '.ai', '.app', '.dev', '.xyz', '.top', '.club', '.online'];
const AFFIXES = [
  '-login',
  '-secure',
  '-verify',
  '-auth',
  '-support',
  '-help',
  '-account',
  '-admin',
  'mail.',
  'vpn.',
  'secure.',
  'login.',
  'account.',
  'support.',
  'verify.',
  'auth.',
];

function generateTyposquats(
  domain: string
): Array<{ domain: string; type: 'typo' | 'homoglyph' | 'affix' | 'tld-swap' }> {
  const out = new Map<string, { domain: string; type: 'typo' | 'homoglyph' | 'affix' | 'tld-swap' }>();
  const [name, tld] = domain.includes('.')
    ? [domain.slice(0, domain.lastIndexOf('.')), domain.slice(domain.lastIndexOf('.'))]
    : [domain, ''];

  if (!name) return [];

  const n = name.toLowerCase();

  // Typosquatting: character omission
  for (let i = 0; i < n.length; i++) {
    const typo = n.slice(0, i) + n.slice(i + 1) + tld;
    if (!out.has(typo) && typo !== domain) out.set(typo, { domain: typo, type: 'typo' });
  }

  // Typosquatting: character duplication
  for (let i = 0; i < n.length; i++) {
    const typo = n.slice(0, i) + n[i] + n[i] + n.slice(i + 1) + tld;
    if (!out.has(typo) && typo !== domain) out.set(typo, { domain: typo, type: 'typo' });
  }

  // Typosquatting: adjacent character swap
  for (let i = 0; i < n.length - 1; i++) {
    const arr = [...n];
    const temp = arr[i]!;
    arr[i] = arr[i + 1]!;
    arr[i + 1] = temp;
    const typo = arr.join('') + tld;
    if (!out.has(typo) && typo !== domain) out.set(typo, { domain: typo, type: 'typo' });
  }

  // Homoglyph substitutions
  const homoglyphs: Array<[string, string]> = [
    ['a', 'а'],
    ['e', 'е'],
    ['o', 'о'],
    ['p', 'р'],
    ['c', 'с'],
    ['x', 'х'],
    ['y', 'у'],
    ['a', '4'],
    ['e', '3'],
    ['i', '1'],
    ['o', '0'],
    ['s', '5'],
    ['t', '7'],
  ];
  for (const [from, to] of homoglyphs) {
    if (n.includes(from)) {
      const typo = n.replace(from, to) + tld;
      if (!out.has(typo) && typo !== domain) out.set(typo, { domain: typo, type: 'homoglyph' });
    }
  }

  // Affix additions
  for (const affix of AFFIXES) {
    const typo = affix.includes('.') ? `${affix}${n}${tld}` : `${n}${affix}${tld}`;
    if (!out.has(typo) && typo !== domain) out.set(typo, { domain: typo, type: 'affix' });
  }

  // TLD swaps
  for (const swap of TLD_SWAPS) {
    if (swap !== tld) {
      const typo = `${n}${swap}`;
      if (!out.has(typo) && typo !== domain) out.set(typo, { domain: typo, type: 'tld-swap' });
    }
  }

  return [...out.values()].slice(0, 50);
}

interface TyposquatVariant {
  domain: string;
  type: 'typo' | 'homoglyph' | 'affix' | 'tld-swap';
}

async function batchResolve(
  variants: TyposquatVariant[],
  batchSize = 6
): Promise<Array<{ domain: string; ips: string[]; type: string }>> {
  const results: Array<{ domain: string; ips: string[]; type: string }> = [];

  for (let i = 0; i < variants.length; i += batchSize) {
    const batch = variants.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (v) => {
        try {
          const ips = await resolveDomain(v.domain);
          return { domain: v.domain, ips, type: v.type };
        } catch {
          return { domain: v.domain, ips: [] as string[], type: v.type };
        }
      })
    );
    results.push(...batchResults);
    // Small delay between batches to avoid rate limiting
    if (i + batchSize < variants.length) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  return results;
}

export async function domainMonitorHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const domain = c.req.query('domain')?.trim().toLowerCase();

  if (!domain) {
    return c.json({ error: 'domain parameter required' }, 400);
  }

  // Basic domain validation
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z]{2,})+$/.test(domain)) {
    return c.json({ error: 'invalid domain format' }, 400);
  }

  try {
    const typosquats = generateTyposquats(domain);

    // Resolve a sample to check for active domains
    const sample = typosquats.slice(0, 20);
    const resolved = await batchResolve(sample);

    // Filter to only active domains (those that resolve)
    const active = resolved.filter((r) => r.ips.length > 0);
    const inactive = resolved.filter((r) => r.ips.length === 0);

    return c.json(
      {
        domain,
        total_variants: typosquats.length,
        checked: resolved.length,
        active: active.length,
        inactive: inactive.length,
        results: {
          active: active.map((r) => ({
            domain: r.domain,
            type: r.type,
            ips: r.ips,
          })),
          inactive: inactive.map((r) => ({
            domain: r.domain,
            type: r.type,
          })),
          unchecked: typosquats.slice(20).map((t) => ({
            domain: t.domain,
            type: t.type,
          })),
        },
        generated_at: new Date().toISOString(),
      },
      200,
      { 'Cache-Control': 'public, max-age=300' }
    );
  } catch (e) {
    return c.json(
      {
        error: e instanceof Error ? e.message : 'domain monitor failed',
      },
      500
    );
  }
}
