import type { Context } from 'hono';
import type { Fetcher } from '@cloudflare/workers-types';
import type { Env } from '../env';

/**
 * Cybersec Reddit firehose. Curated set of public subreddits.
 *
 * Reddit blocks Cloudflare Workers IP ranges at the network level, so the
 * Worker NEVER fetches Reddit directly. A GitHub Action cron
 * (scripts/fetch-reddit-feed.mjs, every 30 min) fetches each subreddit's RSS
 * from a non-blocked runner, builds the feed, and commits it to the main
 * branch at public/data/reddit-feed.json. The handler reads that file from the
 * ASSETS binding (bundled with the Worker on deploy), so there is zero
 * external network dependency at runtime.
 *
 * Consumed by /threatintel/reddit and /threatintel/social/reddit.
 */

const REDDIT_FEED_ASSETS_PATH = '/data/reddit-feed.json';
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
 * Pure-data fetcher exposed for snapshot composition. Reads the feed from the
 * ASSETS bundle (public/data/reddit-feed.json, committed by the GitHub Action
 * on every run). Falls back to raw.githubusercontent.com for backward compat
 * with the older orphan-branch publishing approach.
 * Returns an empty feed (with a warning) if every source fails.
 */
const FEED_RAW_URL =
  'https://raw.githubusercontent.com/Pranith-Jain/Pranith-Jain.github.io/reddit-feed-data/reddit-feed.json';

function validFeed(data: unknown): data is RedditFeedResponse {
  const d = data as RedditFeedResponse;
  return !!d && Array.isArray(d.items) && Array.isArray(d.subs);
}

async function fromAssets(env?: { ASSETS: Fetcher }): Promise<RedditFeedResponse | null> {
  if (!env?.ASSETS) return null;
  try {
    const url = new URL('https://placeholder');
    url.pathname = REDDIT_FEED_ASSETS_PATH;
    const r = await env.ASSETS.fetch(new Request(url));
    if (r.ok) {
      const data = await r.json();
      if (validFeed(data)) return data;
    }
  } catch {
    /* ignore */
  }
  return null;
}

async function fromRawBranch(): Promise<RedditFeedResponse | null> {
  try {
    const r = await fetch(FEED_RAW_URL, {
      headers: { 'user-agent': 'pranithjain-dfir/1.0', accept: 'application/json' },
      cf: { cacheTtl: 300, cacheEverything: true },
      signal: AbortSignal.timeout(10_000),
    });
    if (r.ok) {
      const data = await r.json();
      if (validFeed(data)) return data;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export async function fetchRedditFeed(env?: { ASSETS: Fetcher }): Promise<RedditFeedResponse> {
  // Serve whichever source is freshest. The deploy-bundled ASSETS snapshot only
  // updates on deploy; the reddit-feed-data branch is refreshed every 30 min by
  // the GitHub Action. Fetch both and pick the newer generated_at so the feed
  // self-heals: between deploys the live branch wins, and if the branch/Action
  // is down the bundled snapshot still serves. (Previously ASSETS was returned
  // unconditionally, so a fresh branch never reached prod without a redeploy —
  // the cause of the feed showing stale data when the Action stalled.)
  const [assets, raw] = await Promise.all([fromAssets(env), fromRawBranch()]);
  const candidates = [assets, raw].filter((d): d is RedditFeedResponse => d !== null);
  if (candidates.length === 0) {
    return emptyFeed('reddit feed unavailable — ASSETS and raw.githubusercontent.com both failed');
  }
  candidates.sort((a, b) => Date.parse(b.generated_at || '') - Date.parse(a.generated_at || ''));
  const [freshest] = candidates;
  return freshest ?? emptyFeed('reddit feed unavailable');
}

export const REDDIT_FEED_CACHE_KEY = 'https://reddit-feed-cache.internal/v11-raw';

export async function redditFeedHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(REDDIT_FEED_CACHE_KEY);
  const cached = await cache.match(cacheKey);
  if (cached) return new Response(cached.body, cached);

  const body = await fetchRedditFeed(c.env as unknown as { ASSETS: Fetcher });
  const cacheable = body.items.length > 0;
  const response = c.json(body, 200, {
    'Cache-Control': cacheable ? `public, max-age=${CACHE_TTL}, stale-while-revalidate=${CACHE_TTL * 4}` : 'no-store',
  });
  if (cacheable) c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}
