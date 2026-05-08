import type { Context } from 'hono';
import type { Env } from '../env';
import { safeErrorMessage } from '../lib/error';

const TIMEOUT_MS = 10_000;

const ALLOWED_HOSTS = new Set([
  'www.cisa.gov',
  'cisa.gov',
  'nvd.nist.gov',
  'isc.sans.edu',
  'threatpost.com',
  'krebsonsecurity.com',
  'feeds.feedburner.com',
  'thehackernews.com',
  'www.bleepingcomputer.com',
  'bleepingcomputer.com',
  'threatfox.abuse.ch',
  'urlhaus.abuse.ch',
  'bazaar.abuse.ch',
  'mb-api.abuse.ch',
  'feodotracker.abuse.ch',
  'openphish.com',
  'www.openphish.com',
  'www.securityweek.com',
  'securityweek.com',
  'www.darkreading.com',
  'darkreading.com',
  'dfir-lab.ch',
  'www.dfir-lab.ch',
  'feeds.fireeye.com',
  'us-cert.cisa.gov',
  // Vendor threat-intel feeds — probed and confirmed returning XML (2026-05-07)
  'blog.talosintelligence.com',
  'talosintelligence.com',
  'unit42.paloaltonetworks.com',
  'www.welivesecurity.com',
  'welivesecurity.com',
  'securelist.com',
  'www.securelist.com',
  'www.crowdstrike.com',
  'crowdstrike.com',
  'www.sentinelone.com',
  'sentinelone.com',
  'flashpoint.io',
  'www.flashpoint.io',
  'falhumaid.github.io',
  // Hacker News + YC (AI / Tech / Cybersecurity feeds)
  'hnrss.org',
  'news.ycombinator.com',
  'www.ycombinator.com',
  'ycombinator.com',
]);

export async function feedProxyHandler(c: Context<{ Bindings: Env }>) {
  const url = c.req.query('url');
  if (!url) return c.json({ error: 'missing url' }, 400);

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return c.json({ error: 'invalid url' }, 400);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return c.json({ error: 'unsupported protocol' }, 400);
  }
  // Allow-list to prevent SSRF / abuse
  if (!ALLOWED_HOSTS.has(parsed.hostname.toLowerCase())) {
    return c.json({ error: `host not in allow-list: ${parsed.hostname}` }, 403);
  }

  try {
    const upstream = await fetch(parsed.toString(), {
      redirect: 'manual',
      headers: { 'user-agent': 'pranithjain-rss-proxy/1.0' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (upstream.status >= 300 && upstream.status < 400) {
      return c.json({ error: 'upstream redirect not followed' }, 502);
    }
    if (!upstream.ok) {
      return c.json({ error: `upstream ${upstream.status}` }, 502);
    }
    const body = await upstream.text();
    return new Response(body, {
      status: 200,
      headers: {
        'content-type': upstream.headers.get('content-type') ?? 'application/xml',
        'cache-control': 'public, max-age=300', // 5min cache hint
      },
    });
  } catch (err) {
    return c.json({ error: safeErrorMessage(c.env as unknown as Record<string, unknown>, err) }, 502);
  }
}
