import type { Context } from 'hono';
import type { Env } from '../env';

/**
 * Cybersec Reddit firehose. Curated set of public subreddits.
 *
 * Reddit blocks Cloudflare Workers IP ranges at the network level, so the
 * Worker NEVER fetches Reddit directly. A GitHub Action cron
 * (scripts/fetch-reddit-feed.mjs, every 30 min) fetches each subreddit's RSS
 * from a non-blocked runner, builds the feed, and publishes it as a single
 * JSON file on the orphan `reddit-feed-data` branch. This handler reads that
 * file from raw.githubusercontent.com — no Cloudflare KV, no API token, no
 * RSS2JSON / Deno proxy. There is no live-fetch fallback (every proxy that ran
 * on a datacenter IP was blocked by Reddit anyway).
 *
 * Consumed by /threatintel/reddit.
 */

const FEED_RAW_URL =
  'https://raw.githubusercontent.com/Pranith-Jain/Pranith-Jain.github.io/reddit-feed-data/reddit-feed.json';
const CACHE_TTL = 30 * 60;

type RedditTopic = 'news' | 'research' | 'red-team' | 'blue-team' | 'osint' | 'malware' | 'help' | 'scams';

export interface RedditFeedItem {
  sub: string;
  sub_label: string;
  sub_topic: RedditTopic;
  sub_blurb: string;
  title: string;
  link: string;
  /** ISO 8601 from Reddit's <updated> / <published>. */
  pub_date: string;
  /** Truncated post body. */
  text: string;
  /** Author handle (no /u/ prefix). */
  author: string;
}

export interface RedditFeedResponse {
  generated_at: string;
  subs: { name: string; label: string; topic: RedditTopic; ok: boolean; count: number }[];
  items: RedditFeedItem[];
  warnings: string[];
}

function emptyFeed(warning: string): RedditFeedResponse {
  return { generated_at: new Date().toISOString(), subs: [], items: [], warnings: [warning] };
}

/**
 * Pure-data fetcher exposed for snapshot composition. Reads the feed published
 * by the GitHub Action from GitHub raw. Returns an empty feed (with a warning)
 * if it isn't published yet or the fetch fails.
 */
export async function fetchRedditFeed(): Promise<RedditFeedResponse> {
  try {
    const r = await fetch(FEED_RAW_URL, {
      headers: { 'user-agent': 'pranithjain-dfir/1.0', accept: 'application/json' },
      // GitHub raw has its own ~5min CDN cache; this caches it at our edge too.
      cf: { cacheTtl: 300, cacheEverything: true },
      // GitHub-raw CDN rarely hangs but the upstream can stall on a
      // cold-cache miss — cap the request so a slow egress can't pin
      // the Worker past the 30s CPU budget. 10s is generous for a CDN.
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) return emptyFeed(`reddit feed unavailable (raw HTTP ${r.status})`);
    const data = (await r.json()) as RedditFeedResponse;
    if (!Array.isArray(data.items) || !Array.isArray(data.subs)) {
      return emptyFeed('reddit feed malformed');
    }
    return data;
  } catch {
    return emptyFeed('reddit feed not yet published — the fetcher cron publishes every 30 min');
  }
}

export const REDDIT_FEED_CACHE_KEY = 'https://reddit-feed-cache.internal/v11-raw';

export async function redditFeedHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(REDDIT_FEED_CACHE_KEY);
  const cached = await cache.match(cacheKey);
  if (cached) return new Response(cached.body, cached);

  const body = await fetchRedditFeed();
  const cacheable = body.items.length > 0;
  const response = c.json(body, 200, {
    'Cache-Control': cacheable ? `public, max-age=${CACHE_TTL}, stale-while-revalidate=${CACHE_TTL * 4}` : 'no-store',
  });
  if (cacheable) c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}
