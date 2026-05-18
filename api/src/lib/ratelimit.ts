import type { Context, Next } from 'hono';
import type { Env } from '../env';

const LIMIT = 30; // requests per minute, applied to user-input endpoints
const WINDOW_SEC = 60;
const TTL = 120; // KV TTL > window so the bucket survives

/**
 * KV write budget on the free Workers KV tier is 1,000 writes/day per
 * namespace. Every non-bypassed request to /api/v1/* costs one write
 * (read-modify-write of the per-IP token bucket). Without aggressive
 * bypass, even modest portfolio traffic burns through the quota — every
 * /threatintel page load fans out to a dozen feed endpoints and turns
 * them all into KV writes.
 *
 * Strategy: only rate-limit endpoints that have an actual abuse vector
 * (user-input lookups that fan out to expensive upstream APIs). Cached
 * read-only feeds are bypassed; they're already protected by edge cache
 * (CF serves the cached response without invoking the worker most of the
 * time), and they're parameter-free so there's nothing to abuse anyway.
 */

/** Exact-match exempt paths. */
const BYPASS_EXACT = new Set<string>([
  '/api/v1/health',
  '/api/v1/pageviews',
  // Cached read-only aggregators — all served from edge cache; even cold-
  // cache hits do bounded upstream work and don't expose anything an
  // abuser couldn't get from RSS directly.
  '/api/v1/threat-pulse',
  '/api/v1/writeups',
  '/api/v1/cyber-crime',
  '/api/v1/telegram-feed',
  '/api/v1/reddit-feed',
  '/api/v1/x-feed',
  '/api/v1/live-iocs',
  '/api/v1/feed-status',
  '/api/v1/ransomware-recent',
  '/api/v1/breach-disclosures',
  '/api/v1/cve-recent',
  '/api/v1/phishing-urls',
  '/api/v1/malware-samples',
  '/api/v1/onion-watch',
  '/api/v1/threat-map',
  '/api/v1/rules',
  '/api/v1/ioc-correlation',
  '/api/v1/ioc-correlation/stix.json',
  '/api/v1/snapshot',
  '/api/v1/ioc-snapshot',
  '/api/v1/actor-timeline',
  '/api/v1/victim-releaks',
  '/api/v1/atlas/technique',
  '/api/v1/mitre/technique',
]);

/** Prefix-match exempt paths. Read-only endpoints only. */
const BYPASS_PREFIX = [
  '/api/v1/feeds/', // proxy, abuse-rss, ioc-summary, aggregate — all read-only feed aggregators
  '/api/v1/blog/', // public blog list + post detail — read-only, slug-validated, edge-cached
  '/api/v1/taxii2/', // read-only TAXII 2.1 server — GET only, edge-cached
  '/api/v1/cti/misp/', // read-only MISP feed (manifest + event json) — edge-cached
];

/**
 * Briefings: every GET path (list / today / rss / :slug detail) is read-only
 * and edge-cached, so none of them should pay a rate-limit KV read+write on
 * the way to a cache hit. The three admin mutations stay rate-limited — that
 * per-IP bucket is the brute-force protection on BRIEFINGS_ADMIN_TOKEN.
 */
const BRIEFINGS_ADMIN = new Set<string>([
  '/api/v1/briefings/build',
  '/api/v1/briefings/backfill',
  '/api/v1/briefings/sweep',
]);

function isBypassed(pathname: string): boolean {
  if (BYPASS_EXACT.has(pathname)) return true;
  if (pathname.startsWith('/api/v1/briefings/') && !BRIEFINGS_ADMIN.has(pathname)) return true;
  for (const prefix of BYPASS_PREFIX) {
    if (pathname.startsWith(prefix)) return true;
  }
  return false;
}

export async function rateLimit(c: Context<{ Bindings: Env }>, next: Next): Promise<Response | void> {
  const url = new URL(c.req.url);
  if (!url.pathname.startsWith('/api/v1/')) return next();
  if (isBypassed(url.pathname)) return next();

  const ip = c.req.header('cf-connecting-ip') ?? 'anon';
  const bucket = Math.floor(Date.now() / 1000 / WINDOW_SEC);
  const key = `rl:${bucket}:${ip}`;

  // No-op if KV is not bound (lets local dev + un-provisioned production work)
  if (!c.env.KV_CACHE) return next();

  let count = 0;
  try {
    const raw = await c.env.KV_CACHE.get(key);
    count = raw ? parseInt(raw, 10) : 0;
  } catch {
    return next(); // KV transient error — fail open (don't block legit traffic)
  }

  if (count >= LIMIT) {
    return c.json({ error: 'rate_limited', limit: LIMIT, window_seconds: WINDOW_SEC }, 429, {
      'retry-after': String(WINDOW_SEC),
      'x-ratelimit-limit': String(LIMIT),
      'x-ratelimit-remaining': '0',
      'x-ratelimit-reset': String((bucket + 1) * WINDOW_SEC),
      'cache-control': 'no-store',
    });
  }

  // Best-effort increment (don't await blocking)
  try {
    await c.env.KV_CACHE.put(key, String(count + 1), { expirationTtl: TTL });
  } catch {
    /* swallow */
  }

  return next();
}
