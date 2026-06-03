import type { Context } from 'hono';
import type { Env } from '../env';
import { requireAdmin } from '../lib/admin-auth';

/**
 * Cybersec Reddit firehose. Curated set of public subreddits.
 *
 * Reddit blocks Cloudflare Workers IP ranges at the network level. Data
 * is pushed to KV by a GitHub Action cron (scripts/fetch-reddit-feed.mjs)
 * which runs every 30 min. The KV-backed read replaces the now-defunct
 * RSS2JSON proxy (also on Cloudflare, also blocked).
 *
 * KV key is written by the admin endpoint POST /api/v1/admin/reddit-feed
 * and read here as the primary data source.
 */

const RSS2JSON_API = 'https://api.rss2json.com/v1/api.json';
const REDDIT_FEED_KV_KEY = 'reddit-feed:data:v1';
const FETCH_TIMEOUT_MS = 15_000;
const CACHE_TTL = 30 * 60;
const CONCURRENCY = 4;
const MAX_POSTS_PER_SUB = 100;
const MAX_POST_AGE_DAYS = 7;
const MAX_TEXT_LEN = 400;

interface SubSpec {
  name: string;
  label: string;
  blurb: string;
  topic: 'news' | 'research' | 'red-team' | 'blue-team' | 'osint' | 'malware' | 'help' | 'scams';
}

/**
 * Curated cybersec / DFIR subreddit set. Liveness-checked 2026-06-03.
 */
const SUBS: SubSpec[] = [
  {
    name: 'netsec',
    label: 'r/netsec',
    blurb: 'Practical netsec — research, advisories, deep-dives',
    topic: 'research',
  },
  { name: 'cybersecurity', label: 'r/cybersecurity', blurb: 'General cybersec news + career', topic: 'news' },
  { name: 'blueteamsec', label: 'r/blueteamsec', blurb: 'Defensive security — DFIR, hunting, IR', topic: 'blue-team' },
  { name: 'redteamsec', label: 'r/redteamsec', blurb: 'Red team tradecraft + offensive research', topic: 'red-team' },
  { name: 'AskNetsec', label: 'r/AskNetsec', blurb: 'Q&A — practical netsec problems', topic: 'help' },
  { name: 'Malware', label: 'r/Malware', blurb: 'Malware analysis + reverse engineering', topic: 'malware' },
  {
    name: 'ReverseEngineering',
    label: 'r/ReverseEngineering',
    blurb: 'RE — IDA, Ghidra, binary internals, CTFs',
    topic: 'malware',
  },
  {
    name: 'computerforensics',
    label: 'r/computerforensics',
    blurb: 'Digital forensics — disk, memory, mobile, cloud',
    topic: 'blue-team',
  },
  { name: 'OSINT', label: 'r/OSINT', blurb: 'Open-source intelligence tradecraft', topic: 'osint' },
  { name: 'threatintel', label: 'r/threatintel', blurb: 'CTI — actors, campaigns, IOCs', topic: 'research' },
  {
    name: 'crowdstrike',
    label: 'r/crowdstrike',
    blurb: 'CrowdStrike Falcon user community, detections',
    topic: 'blue-team',
  },
  {
    name: 'AzureSentinel',
    label: 'r/AzureSentinel',
    blurb: 'Microsoft Sentinel — KQL hunts, content packs',
    topic: 'blue-team',
  },
  {
    name: 'Scams',
    label: 'r/Scams',
    blurb: 'Largest scam-victim community — fresh-scam reporting + advice',
    topic: 'scams',
  },
  {
    name: 'IdentityTheft',
    label: 'r/IdentityTheft',
    blurb: 'ID theft + credit-card-fraud victim reports, recovery tradecraft',
    topic: 'scams',
  },
  {
    name: 'phishing',
    label: 'r/phishing',
    blurb: 'Phishing-campaign samples + analysis · educator-friendly',
    topic: 'scams',
  },
  {
    name: 'scambait',
    label: 'r/scambait',
    blurb: 'Scam-baiting community — surfaces fresh fraud playbooks + tactics in real-time',
    topic: 'scams',
  },
];

export interface RedditFeedItem {
  sub: string;
  sub_label: string;
  sub_topic: SubSpec['topic'];
  sub_blurb: string;
  title: string;
  link: string;
  pub_date: string;
  text: string;
  author: string;
}

export interface RedditFeedResponse {
  generated_at: string;
  subs: { name: string; label: string; topic: SubSpec['topic']; ok: boolean; count: number }[];
  items: RedditFeedItem[];
  warnings: string[];
}

interface Rss2JsonItem {
  title: string;
  pubDate: string;
  link: string;
  author: string;
  content: string;
}

function stripHtml(s: string): string {
  const withBreaks = s.replace(/<br\s*\/?>/gi, '\n').replace(/<p[^>]*>/gi, '\n');
  return withBreaks.replace(/<[^>]+>/g, '').trim();
}

async function fetchSub(spec: SubSpec): Promise<{ ok: boolean; items: RedditFeedItem[] }> {
  const rssUrl = `https://www.reddit.com/r/${encodeURIComponent(spec.name)}/.rss?limit=${MAX_POSTS_PER_SUB}`;
  const proxyUrl = `${RSS2JSON_API}?rss_url=${encodeURIComponent(rssUrl)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(proxyUrl, {
      signal: ctrl.signal,
      headers: {
        'user-agent': 'pranithjain-dfir/1.0',
        accept: 'application/json',
      },
    });
    if (!r.ok) return { ok: false, items: [] };
    const body = (await r.json()) as { status?: string; items?: Rss2JsonItem[] };
    if (body.status !== 'ok' || !Array.isArray(body.items)) return { ok: false, items: [] };

    const cutoff = Date.now() - MAX_POST_AGE_DAYS * 86_400_000;
    const items: RedditFeedItem[] = body.items
      .filter((e) => e.title && e.link && e.pubDate)
      .filter((e) => {
        const t = Date.parse(e.pubDate);
        return !Number.isFinite(t) || t >= cutoff;
      })
      .slice(0, MAX_POSTS_PER_SUB)
      .map((e) => ({
        sub: spec.name,
        sub_label: spec.label,
        sub_topic: spec.topic,
        sub_blurb: spec.blurb,
        title: e.title.slice(0, 240),
        link: e.link,
        pub_date: new Date(e.pubDate).toISOString(),
        text: stripHtml(e.content ?? '').slice(0, MAX_TEXT_LEN),
        author: (e.author ?? '').replace(/^\/u\//, ''),
      }));
    return { ok: true, items };
  } catch {
    return { ok: false, items: [] };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Try reading the Reddit feed from KV (pushed by GitHub Action).
 * Returns null if no data or any error occurs.
 */
async function readKvFeed(kv: KVNamespace | undefined): Promise<RedditFeedResponse | null> {
  if (!kv) return null;
  try {
    const raw = await kv.get(REDDIT_FEED_KV_KEY, 'json');
    if (!raw) return null;
    const data = raw as unknown as RedditFeedResponse;
    if (!Array.isArray(data.items) || !Array.isArray(data.subs)) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Pure-data fetcher exported for snapshot composition.
 *
 * Reads from KV first (GitHub Action push), falls back to direct RSS2JSON
 * fetch (which will likely fail since Reddit blocks Cloudflare Workers).
 */
export async function fetchRedditFeed(kv?: KVNamespace | undefined): Promise<RedditFeedResponse> {
  const fromKv = await readKvFeed(kv);
  if (fromKv) return fromKv;

  const warnings: string[] = [];
  const subStatus: RedditFeedResponse['subs'] = [];
  const allItems: RedditFeedItem[] = [];

  const queue = [...SUBS];
  async function worker() {
    while (queue.length > 0) {
      const spec = queue.shift();
      if (!spec) return;
      const r = await fetchSub(spec);
      if (!r.ok) warnings.push(`could not fetch r/${spec.name}`);
      subStatus.push({ name: spec.name, label: spec.label, topic: spec.topic, ok: r.ok, count: r.items.length });
      allItems.push(...r.items);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  allItems.sort((a, b) => b.pub_date.localeCompare(a.pub_date));

  return {
    generated_at: new Date().toISOString(),
    subs: subStatus.sort((a, b) => a.label.localeCompare(b.label)),
    items: allItems,
    warnings,
  };
}

export const REDDIT_FEED_CACHE_KEY = 'https://reddit-feed-cache.internal/v9-kv';

export async function redditFeedHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(REDDIT_FEED_CACHE_KEY);
  const cached = await cache.match(cacheKey);
  if (cached) return new Response(cached.body, cached);

  const body = await fetchRedditFeed(c.env.KV_CACHE);
  const response = c.json(body, 200, { 'Cache-Control': `public, max-age=${CACHE_TTL}` });
  c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

/**
 * POST /api/v1/admin/reddit-feed — accepts a pre-fetched RedditFeedResponse
 * payload from the GitHub Action feeder and stores it in KV. The public
 * handler reads KV next time it serves the endpoint.
 */
export async function pushRedditFeedHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const gate = requireAdmin(c);
  if ('error' in gate) return gate.error;

  if (!c.env.KV_CACHE) {
    return c.json({ error: 'KV_CACHE not bound' }, 500);
  }

  const body = (await c.req.json().catch(() => null)) as RedditFeedResponse | null;
  if (!body || !Array.isArray(body.items) || !Array.isArray(body.subs)) {
    return c.json({ error: 'invalid payload: expected RedditFeedResponse shape' }, 400);
  }

  await c.env.KV_CACHE.put(REDDIT_FEED_KV_KEY, JSON.stringify(body));

  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(REDDIT_FEED_CACHE_KEY);
  c.executionCtx.waitUntil(cache.delete(cacheKey).catch(() => {}));

  return c.json({ ok: true, items: body.items.length, subs: body.subs.length });
}
