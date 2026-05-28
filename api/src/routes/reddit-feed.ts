import type { Context } from 'hono';
import type { Env } from '../env';

/**
 * Cybersec Reddit firehose. Curated set of public subreddits; each exposes
 * an RSS / JSON feed at /r/<name>/.rss (and /.json) — no auth, no rate-limit
 * key for low-frequency access. We use the .rss variant since it's
 * stable and the smallest parse surface.
 *
 * Cost: each subreddit returns ~25 posts × ~2KB RSS. Cap at 8 posts each;
 * fan out in parallel with bounded concurrency. Cached 30 min — Reddit's
 * pace + reddit.com's bot-detection make tighter polling counterproductive.
 *
 * Pattern mirrors api/src/routes/telegram-feed.ts so the shape is
 * familiar; consumed by /threatintel/reddit.
 */

const FETCH_TIMEOUT_MS = 12_000;
const CACHE_TTL = 30 * 60;
const CONCURRENCY = 4;
/** Per-sub cap. 2026-05-23: was 25. Reddit's RSS endpoint accepts
 *  limit=100 — bumping brings the firehose closer to the 500/7d ceiling
 *  the rest of the feeds target (16 subs × 100 = up to 1600 raw items
 *  before MAX_POST_AGE_DAYS + dedup/filter). */
const MAX_POSTS_PER_SUB = 100;
/** Drop posts older than this many days — keeps the firehose "current
 *  week" rather than the rolling all-time top of each RSS. */
const MAX_POST_AGE_DAYS = 7;
const MAX_TEXT_LEN = 400;

interface SubSpec {
  name: string;
  /** Display name. */
  label: string;
  blurb: string;
  topic: 'news' | 'research' | 'red-team' | 'blue-team' | 'osint' | 'malware' | 'help' | 'scams';
}

/**
 * Curated cybersec / DFIR subreddit set. Liveness-checked 2026-05-11.
 * Bump on additions / removals; the catalog is small enough to inline.
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
  // Carding / scam coverage (added 2026-05-11). Live-probed; r/fraud,
  // r/CreditCardFraud, r/carding, r/BankFraud, r/ScamAlert all 404'd or
  // are banned — only legitimate victim/researcher subs remain.
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
  /** ISO 8601 from Reddit's <updated> / <published>. */
  pub_date: string;
  /** Truncated post body (Reddit's RSS includes the text/preview). */
  text: string;
  /** Author handle (no /u/ prefix). */
  author: string;
}

export interface RedditFeedResponse {
  generated_at: string;
  subs: { name: string; label: string; topic: SubSpec['topic']; ok: boolean; count: number }[];
  items: RedditFeedItem[];
  warnings: string[];
}

/** Reddit's .rss is Atom-shaped: `<entry>` tags with title/link/updated/content/author. */
function parseAtomEntries(xml: string): Array<{
  title: string;
  link: string;
  pub_date: string;
  content: string;
  author: string;
}> {
  const out: Array<{ title: string; link: string; pub_date: string; content: string; author: string }> = [];
  const entryRe = /<entry[\s\S]*?<\/entry>/g;
  const entries = xml.match(entryRe) ?? [];
  for (const block of entries) {
    const title = /<title[^>]*>([\s\S]*?)<\/title>/.exec(block)?.[1] ?? '';
    const link = /<link[^>]*href="([^"]+)"/.exec(block)?.[1] ?? '';
    const updated = /<updated>([^<]+)<\/updated>/.exec(block)?.[1] ?? '';
    const content = /<content[^>]*>([\s\S]*?)<\/content>/.exec(block)?.[1] ?? '';
    // Author is nested: <author><name>name</name></author>
    const author = /<author>[\s\S]*?<name>([^<]+)<\/name>/.exec(block)?.[1] ?? '';
    out.push({
      title: decodeEntities(stripCdata(title)).trim(),
      link,
      pub_date: updated,
      content: stripHtml(stripCdata(content)),
      author: author.replace(/^\/u\//, ''),
    });
  }
  return out;
}

function stripCdata(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function stripHtml(s: string): string {
  const withBreaks = s.replace(/<br\s*\/?>/gi, '\n').replace(/<p[^>]*>/gi, '\n');
  return decodeEntities(withBreaks.replace(/<[^>]+>/g, '')).trim();
}

async function fetchSub(spec: SubSpec): Promise<{ ok: boolean; items: RedditFeedItem[] }> {
  const url = `https://www.reddit.com/r/${encodeURIComponent(spec.name)}/.rss?limit=${MAX_POSTS_PER_SUB}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        // Reddit blocks the default Workers UA — use a browser-shaped one
        // (Reddit's terms allow personal-use scraping from a clearly-identified
        // UA at low frequency, which is what this is).
        'user-agent': 'Mozilla/5.0 (compatible; pranithjain-dfir/1.0; +https://pranithjain.qzz.io)',
        accept: 'application/atom+xml, application/rss+xml, application/xml;q=0.9, */*;q=0.5',
        'accept-language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
      cf: { cacheTtl: 1800, cacheEverything: true },
    });
    if (!r.ok) return { ok: false, items: [] };
    const xml = await r.text();
    const cutoff = Date.now() - MAX_POST_AGE_DAYS * 86_400_000;
    const entries = parseAtomEntries(xml).slice(0, MAX_POSTS_PER_SUB);
    const items: RedditFeedItem[] = entries
      .filter((e) => e.title && e.link && e.pub_date)
      // Drop posts older than the 7d window. RSS feeds occasionally surface
      // "top of all time" entries that drown out current activity.
      .filter((e) => {
        const t = Date.parse(e.pub_date);
        return !Number.isFinite(t) || t >= cutoff;
      })
      .map((e) => ({
        sub: spec.name,
        sub_label: spec.label,
        sub_topic: spec.topic,
        sub_blurb: spec.blurb,
        title: e.title.slice(0, 240),
        link: e.link,
        pub_date: e.pub_date,
        text: e.content.slice(0, MAX_TEXT_LEN),
        author: e.author,
      }));
    return { ok: true, items };
  } catch {
    return { ok: false, items: [] };
  } finally {
    clearTimeout(timer);
  }
}

/** Pure-data fetcher exposed for snapshot composition. */
export async function fetchRedditFeed(): Promise<RedditFeedResponse> {
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

  // Newest-first across all subs.
  allItems.sort((a, b) => b.pub_date.localeCompare(a.pub_date));

  return {
    generated_at: new Date().toISOString(),
    subs: subStatus.sort((a, b) => a.label.localeCompare(b.label)),
    items: allItems,
    warnings,
  };
}

// Bumped v2 → v3 alongside MAX_POSTS_PER_SUB 8→25 and the 7d cutoff filter.
export const REDDIT_FEED_CACHE_KEY = 'https://reddit-feed-cache.internal/v4-7d-100pc';

export async function redditFeedHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(REDDIT_FEED_CACHE_KEY);
  const cached = await cache.match(cacheKey);
  if (cached) return new Response(cached.body, cached);

  const body = await fetchRedditFeed();
  const response = c.json(body, 200, { 'Cache-Control': `public, max-age=${CACHE_TTL}` });
  c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}
