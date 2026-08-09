/**
 * ARGUS live-feed RSS proxy.
 *
 * The ARGUS Feed view aggregates a set of threat-intel RSS/Atom sources.
 * Fetching them directly from the browser fails on CORS for most publishers,
 * and public CORS proxies are unreliable — so the Worker fetches each
 * allowlisted feed server-side and returns the raw body with permissive CORS.
 * Parsing stays client-side (DOMParser). Results are edge-cached briefly so a
 * page of visitors doesn't hammer the upstream feeds.
 */

import { withSecurityHeaders } from './csp';
import type { Env } from './env';

const ALLOWED_RSS = new Set([
  'https://research.checkpoint.com/feed/',
  'https://blog.checkpoint.com/feed/',
  'https://www.crowdstrike.com/blog/feed/',
  'https://unit42.paloaltonetworks.com/feed/',
  'https://www.welivesecurity.com/feed/',
  'https://www.sentinelone.com/blog/feed/',
  'https://www.microsoft.com/en-us/security/blog/feed/',
  'https://securelist.com/feed/',
  // BleepingComputer 403s datacenter egress (Cloudflare bot challenge) —
  // serve its Google News mirror instead.
  'https://news.google.com/rss/search?q=site:bleepingcomputer.com&hl=en-US&gl=US&ceid=US:en',
  'https://www.darkreading.com/feeds/rss.xml',
  'https://krebsonsecurity.com/feed/',
  'https://feeds.feedburner.com/TheHackersNews',
  'https://therecord.media/feed',
  'https://www.securityweek.com/feed/',
  'https://www.cisa.gov/cybersecurity-advisories/all.xml',
  'https://www.ncsc.gov.uk/api/1/services/v1/report-rss-feed.xml',
]);

const CACHE_TTL = 300;

export async function handleArgusRss(request: Request, env: Env, url: URL): Promise<Response | null> {
  if (!url.pathname.startsWith('/api/v1/argus/rss')) return null;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, OPTIONS',
        'access-control-allow-headers': 'Content-Type',
        'access-control-max-age': '86400',
      },
    });
  }

  const target = url.searchParams.get('url') ?? '';
  if (!ALLOWED_RSS.has(target)) {
    return withSecurityHeaders(
      new Response(JSON.stringify({ error: 'feed url not allowlisted' }), {
        status: 400,
        headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
      }),
      undefined,
      url.origin
    );
  }

  const cacheKey = new Request(`https://argus-rss.internal/${encodeURIComponent(target)}`);
  const cached = await caches.default.match(cacheKey);
  if (cached) {
    const h = new Headers(cached.headers);
    h.set('access-control-allow-origin', '*');
    h.set('x-argus-feed', 'cache');
    return new Response(cached.body, { status: cached.status, headers: h });
  }

  try {
    const upstream = await fetch(target, {
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; ArgusFeedBot/1.0)' },
      redirect: 'follow',
    });
    if (!upstream.ok) {
      return withSecurityHeaders(
        new Response(JSON.stringify({ error: `upstream ${upstream.status}` }), {
          status: 502,
          headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
        }),
        undefined,
        url.origin
      );
    }
    const body = await upstream.text();
    const res = new Response(body, {
      status: 200,
      headers: {
        'content-type': 'text/xml; charset=utf-8',
        'access-control-allow-origin': '*',
        'cache-control': `public, max-age=${CACHE_TTL}`,
        'x-argus-feed': 'live',
      },
    });
    await caches.default.put(cacheKey, res.clone()).catch(() => {});
    return res;
  } catch {
    return withSecurityHeaders(
      new Response(JSON.stringify({ error: 'upstream fetch failed' }), {
        status: 502,
        headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
      }),
      undefined,
      url.origin
    );
  }
}
