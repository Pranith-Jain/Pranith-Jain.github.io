import type { Context } from 'hono';
import type { Env } from '../env';

/**
 * Live X (Twitter) feed for cybersec researchers — hybrid pipeline:
 *
 *   1. Pull TweetFeed CSV (0xDanielLopez/TweetFeed) — chronological CSV
 *      of researcher-posted IOC tweets with status permalinks. This is
 *      the only free, no-auth source that exposes RECENT (within-hours)
 *      x.com status IDs from cybersec accounts.
 *
 *   2. For each unique status ID in the window, hit api.fxtwitter.com
 *      to fetch the full tweet (text, author, media, engagement counts,
 *      timestamp). fxtwitter is the Discord/Telegram link-preview proxy
 *      Twitter keeps alive for embed previews — per-tweet enrichment is
 *      free, no auth, and stable.
 *
 *   3. Sort chronologically, return as JSON.
 *
 * Why this works when "X live tweets" otherwise doesn't (as of 2026-05):
 *   - X's anonymous profile timeline returns `profile_best_highlights`,
 *     NOT chronological. There's no public path to recent tweets.
 *   - But fxtwitter per-status JSON IS unrestricted — Twitter has to keep
 *     it alive so embed previews work everywhere.
 *   - TweetFeed gives us a free, fresh source of status IDs to enrich.
 *
 * Limitations:
 *   - Coverage is whatever TweetFeed monitors (~30-40 IOC-posting accounts).
 *     malwrhunterteam, JAMESWT_MHT, bushidotoken, blackorbird, Coolcarlos17,
 *     vxunderground (when they posted IOCs), etc. — not ALL of X.
 *   - Tweets shown are biased toward IOC content (URLs, hashes, domains)
 *     because TweetFeed filters for those. Pure-prose researcher tweets
 *     don't appear.
 *   - Cache TTL: TweetFeed updates ~hourly, so we hold the aggregated
 *     feed for 10 min.
 */

const TWEETFEED_URL = 'https://raw.githubusercontent.com/0xDanielLopez/TweetFeed/master/today.csv';
const FXTWITTER_BASE = 'https://api.fxtwitter.com/i/status/';
const FETCH_TIMEOUT = 12_000;
const FEED_CACHE_TTL = 600;
const STATUS_CACHE_TTL = 6 * 3600;
const MAX_STATUS_LOOKUPS = 35;

const STATUS_ID_RE = /\/status\/(\d{15,25})/;
const HANDLE_FROM_URL_RE = /^https?:\/\/[^/]+\/([^/]+)\/status\/\d+/;

interface FxTweet {
  url?: string;
  id?: string;
  text?: string;
  author?: { screen_name?: string; name?: string; avatar_url?: string };
  replies?: number;
  retweets?: number;
  likes?: number;
  views?: number;
  bookmarks?: number;
  quotes?: number;
  created_at?: string;
  created_timestamp?: number;
  media?: { all?: Array<{ type?: string; url?: string; thumbnail_url?: string }> };
  is_note_tweet?: boolean;
}

interface FxResponse {
  code?: number;
  tweet?: FxTweet;
  message?: string;
}

interface LiveTweet {
  id: string;
  url: string;
  text: string;
  author: { screen_name: string; name: string; avatar_url?: string };
  created_at: string;
  created_at_ms: number;
  replies: number;
  retweets: number;
  likes: number;
  views: number;
  media: Array<{ type: 'photo' | 'video' | 'gif'; url: string }>;
  /** Tags TweetFeed assigned to the original IOC (e.g. "#phishing #malware"). */
  tweetfeed_tags: string[];
  /** IOC types the tweet contained (per TweetFeed classification). */
  ioc_types: string[];
}

export interface XLiveResponse {
  generated_at: string;
  source: string;
  since_hours: number;
  total_status_ids_seen: number;
  enriched_count: number;
  items: LiveTweet[];
}

/** Parse a single CSV row from TweetFeed: ts,user,type,value,tags,permalink. */
function parseTweetFeedRow(line: string): {
  ts: string;
  user: string;
  type: string;
  tags: string[];
  permalink: string;
  status_id: string;
} | null {
  // TweetFeed CSV is comma-separated; the `value` column can be a quoted
  // URL containing commas. Use a split-from-the-right strategy: the LAST
  // field is the permalink, second-to-last is tags, etc.
  const trimmed = line.trim();
  if (!trimmed) return null;
  // Permalink is always the last field — no commas in a status URL.
  const lastComma = trimmed.lastIndexOf(',');
  if (lastComma < 0) return null;
  const permalink = trimmed.slice(lastComma + 1);
  const m = STATUS_ID_RE.exec(permalink);
  if (!m) return null;
  const status_id = m[1]!;

  // Split the remaining prefix into ts, user, type, value(maybe quoted), tags.
  // We only need ts/user/type/tags so we can keep this loose.
  const prefix = trimmed.slice(0, lastComma);
  const parts = prefix.split(',');
  const ts = parts[0] ?? '';
  const user = parts[1] ?? '';
  const type = parts[2] ?? '';
  // Tags are the field right before permalink. Split by whitespace.
  const tagsStr = parts[parts.length - 1] ?? '';
  const tags = tagsStr.split(/\s+/).filter((t) => t.startsWith('#'));

  return { ts, user, type, tags, permalink, status_id };
}

async function fetchTweetFeed(): Promise<string> {
  const res = await fetch(TWEETFEED_URL, {
    headers: { accept: 'text/csv', 'user-agent': 'pranithjain-dfir/1.0' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
    cf: { cacheTtl: FEED_CACHE_TTL, cacheEverything: true },
  } as RequestInit);
  if (!res.ok) throw new Error(`TweetFeed HTTP ${res.status}`);
  return res.text();
}

/**
 * Fetch one tweet from fxtwitter with edge caching. fxtwitter's responses
 * are stable per-status (tweet content rarely changes after posting), so
 * a 6h TTL is safe and dramatically reduces subrequest pressure on
 * repeated visits.
 */
async function fetchFxTweet(statusId: string): Promise<FxTweet | null> {
  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(`https://x-live-status-cache.internal/v1?id=${statusId}`);
  try {
    const hit = await cache.match(cacheKey);
    if (hit) {
      const body = (await hit.json()) as FxResponse;
      return body.tweet ?? null;
    }
  } catch {
    /* fall through */
  }
  try {
    const res = await fetch(`${FXTWITTER_BASE}${statusId}`, {
      headers: { accept: 'application/json', 'user-agent': 'pranithjain-dfir/1.0' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as FxResponse;
    if (!body.tweet) return null;
    // Cache the parsed response.
    const cacheable = new Response(JSON.stringify(body), {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'cache-control': `public, max-age=${STATUS_CACHE_TTL}, s-maxage=${STATUS_CACHE_TTL}`,
      },
    });
    await cache.put(cacheKey, cacheable);
    return body.tweet;
  } catch {
    return null;
  }
}

function normalizeMedia(fx: FxTweet): LiveTweet['media'] {
  const arr = fx.media?.all ?? [];
  return arr
    .map((m): LiveTweet['media'][number] => {
      const t = (m.type ?? 'photo').toLowerCase();
      const type: 'photo' | 'video' | 'gif' =
        t === 'video' ? 'video' : t === 'gif' || t === 'animated_gif' ? 'gif' : 'photo';
      const url = m.url || m.thumbnail_url || '';
      return { type, url };
    })
    .filter((m) => m.url);
}

/**
 * Pure data fetcher — same logic as the HTTP handler, but returns the
 * body directly so the snapshot / threat-pulse pipelines can compose
 * without a worker-internal HTTP roundtrip (Cloudflare Workers fetching
 * their own hostname is unreliable). Exported for `threat-pulse.ts`.
 */
export async function fetchXLive(options: {
  sinceHours?: number;
  limit?: number;
  handleFilter?: string;
}): Promise<XLiveResponse> {
  const sinceHours = options.sinceHours ?? 24;
  const limit = Math.min(options.limit ?? 30, MAX_STATUS_LOOKUPS);
  const handleFilter = (options.handleFilter ?? '').toLowerCase();

  const csv = await fetchTweetFeed();
  const cutoffMs = Date.now() - sinceHours * 3600 * 1000;
  const seen = new Map<
    string,
    { ts: string; ts_ms: number; user: string; tags: Set<string>; types: Set<string>; permalink: string }
  >();
  for (const line of csv.split('\n')) {
    const row = parseTweetFeedRow(line);
    if (!row) continue;
    const tsMs = Date.parse(row.ts.replace(' ', 'T') + 'Z');
    if (!Number.isFinite(tsMs) || tsMs < cutoffMs) continue;
    if (handleFilter) {
      const hmatch = HANDLE_FROM_URL_RE.exec(row.permalink);
      const handleInUrl = (hmatch?.[1] ?? row.user).toLowerCase();
      if (handleInUrl !== handleFilter) continue;
    }
    const existing = seen.get(row.status_id);
    if (existing) {
      for (const t of row.tags) existing.tags.add(t);
      existing.types.add(row.type);
      if (tsMs < existing.ts_ms) {
        existing.ts = row.ts;
        existing.ts_ms = tsMs;
      }
    } else {
      seen.set(row.status_id, {
        ts: row.ts,
        ts_ms: tsMs,
        user: row.user,
        tags: new Set(row.tags),
        types: new Set([row.type]),
        permalink: row.permalink,
      });
    }
  }
  const ordered = [...seen.entries()].sort((a, b) => b[1].ts_ms - a[1].ts_ms).slice(0, limit);
  const enriched = await Promise.all(
    ordered.map(async ([statusId, meta]) => {
      const fx = await fetchFxTweet(statusId);
      if (!fx) return null;
      const createdMs = fx.created_timestamp ? fx.created_timestamp * 1000 : Date.parse(fx.created_at ?? '');
      const item: LiveTweet = {
        id: fx.id ?? statusId,
        url: fx.url ?? `https://x.com/${meta.user}/status/${statusId}`,
        text: fx.text ?? '',
        author: {
          screen_name: fx.author?.screen_name ?? meta.user,
          name: fx.author?.name ?? meta.user,
          avatar_url: fx.author?.avatar_url,
        },
        created_at: fx.created_at ?? meta.ts,
        created_at_ms: Number.isFinite(createdMs) ? createdMs : meta.ts_ms,
        replies: fx.replies ?? 0,
        retweets: fx.retweets ?? 0,
        likes: fx.likes ?? 0,
        views: fx.views ?? 0,
        media: normalizeMedia(fx),
        tweetfeed_tags: [...meta.tags],
        ioc_types: [...meta.types],
      };
      return item;
    })
  );
  const items = enriched.filter((x): x is LiveTweet => x !== null).sort((a, b) => b.created_at_ms - a.created_at_ms);
  return {
    generated_at: new Date().toISOString(),
    source: 'tweetfeed→fxtwitter hybrid',
    since_hours: sinceHours,
    total_status_ids_seen: seen.size,
    enriched_count: items.length,
    items,
  };
}

export async function xLiveHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const sinceHoursRaw = Number(c.req.query('since_hours') ?? '24');
  const sinceHours = Number.isFinite(sinceHoursRaw) ? Math.max(1, Math.min(168, Math.floor(sinceHoursRaw))) : 24;
  const limitRaw = Number(c.req.query('limit') ?? '30');
  const limit = Number.isFinite(limitRaw) ? Math.max(5, Math.min(MAX_STATUS_LOOKUPS, Math.floor(limitRaw))) : 30;
  const handleFilter = (c.req.query('handle') ?? '').trim().toLowerCase();

  let csv: string;
  try {
    csv = await fetchTweetFeed();
  } catch (err) {
    return c.json({ error: `TweetFeed fetch failed: ${(err as Error).message}` }, 502);
  }

  // Parse the CSV, dedupe by status ID, filter to the time window, sort newest-first.
  const cutoffMs = Date.now() - sinceHours * 3600 * 1000;
  const seen = new Map<
    string,
    { ts: string; ts_ms: number; user: string; tags: Set<string>; types: Set<string>; permalink: string }
  >();
  for (const line of csv.split('\n')) {
    const row = parseTweetFeedRow(line);
    if (!row) continue;
    // CSV timestamp is "YYYY-MM-DD HH:MM:SS" UTC-implied.
    const tsMs = Date.parse(row.ts.replace(' ', 'T') + 'Z');
    if (!Number.isFinite(tsMs) || tsMs < cutoffMs) continue;
    // Handle filter — comparison via the permalink's username segment.
    if (handleFilter) {
      const hmatch = HANDLE_FROM_URL_RE.exec(row.permalink);
      const handleInUrl = (hmatch?.[1] ?? row.user).toLowerCase();
      if (handleInUrl !== handleFilter) continue;
    }
    const existing = seen.get(row.status_id);
    if (existing) {
      for (const t of row.tags) existing.tags.add(t);
      existing.types.add(row.type);
      // Take the earliest ts so a tweet's "posted at" is its first observation.
      if (tsMs < existing.ts_ms) {
        existing.ts = row.ts;
        existing.ts_ms = tsMs;
      }
    } else {
      seen.set(row.status_id, {
        ts: row.ts,
        ts_ms: tsMs,
        user: row.user,
        tags: new Set(row.tags),
        types: new Set([row.type]),
        permalink: row.permalink,
      });
    }
  }

  // Newest-first, take the top `limit` status IDs to enrich. Bounded to
  // protect the Worker subrequest budget — each lookup is one fetch.
  const ordered = [...seen.entries()].sort((a, b) => b[1].ts_ms - a[1].ts_ms).slice(0, limit);

  // Parallel enrich.
  const enriched = await Promise.all(
    ordered.map(async ([statusId, meta]) => {
      const fx = await fetchFxTweet(statusId);
      if (!fx) return null;
      const createdMs = fx.created_timestamp ? fx.created_timestamp * 1000 : Date.parse(fx.created_at ?? '');
      const item: LiveTweet = {
        id: fx.id ?? statusId,
        url: fx.url ?? `https://x.com/${meta.user}/status/${statusId}`,
        text: fx.text ?? '',
        author: {
          screen_name: fx.author?.screen_name ?? meta.user,
          name: fx.author?.name ?? meta.user,
          avatar_url: fx.author?.avatar_url,
        },
        created_at: fx.created_at ?? meta.ts,
        created_at_ms: Number.isFinite(createdMs) ? createdMs : meta.ts_ms,
        replies: fx.replies ?? 0,
        retweets: fx.retweets ?? 0,
        likes: fx.likes ?? 0,
        views: fx.views ?? 0,
        media: normalizeMedia(fx),
        tweetfeed_tags: [...meta.tags],
        ioc_types: [...meta.types],
      };
      return item;
    })
  );
  const items = enriched.filter((x): x is LiveTweet => x !== null).sort((a, b) => b.created_at_ms - a.created_at_ms);

  const body: XLiveResponse = {
    generated_at: new Date().toISOString(),
    source: 'tweetfeed→fxtwitter hybrid',
    since_hours: sinceHours,
    total_status_ids_seen: seen.size,
    enriched_count: items.length,
    items,
  };

  return c.json(body, 200, {
    'cache-control': `public, max-age=300, s-maxage=${FEED_CACHE_TTL}`,
  });
}
