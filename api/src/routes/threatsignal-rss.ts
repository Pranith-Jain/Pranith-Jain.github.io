/**
 * RSS proxy + parser for the /threatintel/threatsignal page.
 *
 * Endpoints:
 *   GET /api/v1/threatsignal/rss           — threatsignal.in parsed JSON
 *   GET /api/v1/threatsignal/rss.xml       — threatsignal.in raw RSS
 *   GET /api/v1/opensourcemalware/rss      — opensourcemalware.com parsed JSON
 *   GET /api/v1/opensourcemalware/rss.xml  — opensourcemalware.com raw RSS
 *   GET /api/v1/rss/aggregate              — merged feed across all sources
 *   GET /api/v1/rss/aggregate?source=…     — single source via aggregate
 *
 * Why a Worker proxy and not a direct browser fetch:
 *   - The upstream RSS feeds send `Access-Control-Allow-Origin: *` (confirmed
 *     against threatsignal.in/rss.xml and opensourcemalware.com/rss.xml), so
 *     a direct browser fetch *would* work. The reason we still proxy is:
 *       1. Edge caching — Cloudflare holds the parsed JSON in KV for 15 min
 *          per source, so the first visitor of a 15-min window pays the
 *          upstream cost and everyone after is a near-zero-latency KV read.
 *       2. Privacy — visitors' IPs are not exposed to the upstream feeds.
 *       3. Robustness — we can transform the shape (add a stable id,
 *          normalize the pubDate to ISO 8601, strip tracking params, tag
 *          the source) once here instead of in every client.
 *
 * Cache strategy:
 *   - KV key '<sourceId>:rss:v2' holds the parsed JSON, 15-min TTL via
 *     expirationTtl (Cloudflare KV enforces hard expiry).
 *   - On a miss, we fetch upstream with a 15s timeout. If upstream is down
 *     we serve the last good value (or 502 if no value is cached).
 *   - The aggregate endpoint fans out to all sources IN PARALLEL. If one
 *     source is unreachable, that source's items are simply absent from
 *     the aggregate; the other source still serves. A source marked
 *     `stale: true` is included in the aggregate with its own stale flag
 *     so the client can surface a per-source warning.
 *
 * Failure mode:
 *   - If upstream returns non-200 AND no cached value exists, we return
 *     { error: 'upstream_unavailable' } with HTTP 502. The client renders
 *     a "source is currently unreachable" empty state.
 */

import type { Context } from 'hono';
import type { Env } from '../env';
import { getSiteUrl } from '../lib/site-config';
import { safeErrorMessage } from '../lib/error';

/* ── Source registry ────────────────────────────────────────────── */

export interface RssSource {
  /** Stable id used in the aggregate response, KV cache key, and page
   *  filter pills. Lowercase, no spaces. */
  id: string;
  /** Human-readable name shown on cards and pills. */
  name: string;
  /** Author / publisher. Used for the "By {author}" footer on cards. */
  author: string | null;
  /** Display color for the source pill. */
  accent: 'rose' | 'emerald' | 'amber' | 'cyan' | 'violet' | 'sky' | 'slate';
  /** URL of the upstream RSS feed. Must serve application/xml or
   *  application/rss+xml. CORS must allow our origin (we proxy via the
   *  Worker so the visitor IP never hits the upstream). */
  upstream: string;
  /** What we advertise as `channel.link` in the parsed JSON. Some
   *  upstreams return a sub-domain for `<link>` (threatsignal uses
   *  threatsignal.research while the marketing site is threatsignal.in).
   *  Override here so the page can link to the human-readable site. */
  displayLink: string;
  /** Per-item link origin rewrites. The upstream RSS may put each
   *  post's `<link>` under a stale or non-resolving sub-domain
   *  (threatsignal.in's RSS uses threatsignal.research, which doesn't
   *  resolve at all), so the card click would 404. We rewrite the
   *  origin (host + protocol) of every item link + the channel link
   *  through this table before the response leaves the Worker.
   *  Path / query / hash are preserved verbatim. */
  linkOriginRewrite?: Array<{ from: string; to: string }>;
}

const SOURCES: RssSource[] = [
  {
    id: 'threatsignal',
    name: 'ThreatSignal',
    author: 'threatsignal.in',
    accent: 'rose',
    upstream: 'https://www.threatsignal.in/rss.xml',
    displayLink: 'https://www.threatsignal.in/',
    // threatsignal.in's RSS hard-codes <link>https://threatsignal.research/...
    // for both the channel and every item. threatsignal.research doesn't
    // resolve (no A record), so the raw links 404. Rewrite them to the
    // real www.threatsignal.in host. Path/query/hash preserved.
    linkOriginRewrite: [
      { from: 'threatsignal.research', to: 'www.threatsignal.in' },
      { from: 'www.threatsignal.research', to: 'www.threatsignal.in' },
    ],
  },
  {
    id: 'opensourcemalware',
    name: 'OpenSourceMalware',
    author: 'opensourcemalware.com',
    accent: 'emerald',
    upstream: 'https://opensourcemalware.com/rss.xml',
    displayLink: 'https://opensourcemalware.com/',
  },
];

const SOURCE_BY_ID: Record<string, RssSource> = Object.fromEntries(SOURCES.map((s) => [s.id, s]));

/** Cache key prefix — bumping the version invalidates all per-source
 *  cached entries without a manual KV purge. */
const CACHE_VERSION = 'v3';
const CACHE_KEY_FOR = (id: string) => `${id}:rss:${CACHE_VERSION}`;
const CACHE_TTL_SECONDS = 900;
/** Hard ceiling on what we'll cache per source. */
const MAX_ITEMS_PER_SOURCE = 50;

const FETCH_UA = 'Mozilla/5.0 (compatible; pranithjain-threatintel/1.0; +https://pranithjain.qzz.io/threatintel/threatsignal)';

/* ── Public types ───────────────────────────────────────────────── */

export interface RssItem {
  id: string;
  title: string;
  link: string;
  description: string;
  pubDate: string;        // ISO 8601
  pubDateRaw: string;     // original RFC 822 string
  category: string | null;
  guid: string;
  author: string | null;  // extracted from <author>jenn</author> if present
  sourceId: string;       // 'threatsignal' | 'opensourcemalware' | …
  sourceName: string;
  sourceAuthor: string | null;
  sourceAccent: RssSource['accent'];
}

export interface RssChannel {
  title: string;
  link: string;
  description: string;
  language: string | null;
  lastBuildDate: string | null;
}

export interface RssFeed {
  source: Pick<RssSource, 'id' | 'name' | 'author' | 'accent' | 'displayLink'>;
  channel: RssChannel;
  items: RssItem[];
  cachedAt: string;
  stale: boolean;
}

export interface RssAggregate {
  /** ISO 8601 timestamp of when this aggregate was assembled. */
  assembledAt: string;
  /** Per-source status. A source is omitted from `feeds` (and its items
   *  are absent from `items`) only if both the live fetch AND the
   *  fallback cache have failed. */
  sources: Array<{
    source: Pick<RssSource, 'id' | 'name' | 'author' | 'accent' | 'displayLink'>;
    cachedAt: string;
    stale: boolean;
    error: string | null;
    itemCount: number;
  }>;
  feeds: RssFeed[];
  items: RssItem[];   // pre-sorted by pubDate DESC, deduplicated by id
}

/* ── Tiny XML parser (RSS 2.0 only) ─────────────────────────────── */

// threatsignal + opensourcemalware both ship well-formed enough RSS 2.0
// that a tag-walk handles them. Adding a dependency (fast-xml-parser /
// xml2js) for a 6-element schema would be overkill.

function extractChannel(xml: string, source: RssSource): RssChannel {
  const channelMatch = /<channel>([\s\S]*?)<\/channel>/.exec(xml);
  if (!channelMatch) {
    return {
      title: '',
      link: source.displayLink,
      description: '',
      language: null,
      lastBuildDate: null,
    };
  }
  const fullBody = channelMatch[1]!;
  // Channel-level metadata lives between <channel> and the first <item>.
  // A non-greedy channel match + readCdata('title') would return the first
  // item's title because readCdata matches the first occurrence of the tag.
  const beforeFirstItem = fullBody.split(/<item>/i, 1)[0] ?? '';
  // Prefer the upstream `<link>` (rewritten through the source's
  // linkOriginRewrite table so a stale / non-resolving sub-domain
  // gets swapped for the real host), otherwise fall back to the
  // source's displayLink.
  const upstreamLinkRaw = readCdata(beforeFirstItem, 'link') ?? '';
  const link = upstreamLinkRaw
    ? (rewriteLinkOrigin(upstreamLinkRaw, source.linkOriginRewrite) || source.displayLink)
    : source.displayLink;
  return {
    title: readCdata(beforeFirstItem, 'title') ?? '',
    link,
    description: readCdata(beforeFirstItem, 'description') ?? '',
    language: readCdata(beforeFirstItem, 'language'),
    lastBuildDate: readCdata(beforeFirstItem, 'lastBuildDate'),
  };
}

function extractItems(xml: string, source: RssSource): RssItem[] {
  const items: RssItem[] = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) !== null) {
    const body = m[1]!;
    const title = readCdata(body, 'title') ?? '';
    const link = readCdata(body, 'link') ?? '';
    const description = readCdata(body, 'description') ?? '';
    const pubDateRaw = readCdata(body, 'pubDate') ?? '';
    const guid = readCdata(body, 'guid') ?? link;
    const category = readCdata(body, 'category');
    const author = readCdata(body, 'author');
    const pubDate = normalizePubDate(pubDateRaw);
    // Source-prefix the id so a guid collision across feeds can't collapse
    // two distinct items into one React key.
    const id = `${source.id}-${stableId(guid, link, pubDateRaw)}`;
    items.push({
      id,
      title: title.trim(),
      link: rewriteLinkOrigin(stripTracking(link), source.linkOriginRewrite),
      description: description.trim(),
      pubDate,
      pubDateRaw,
      category: category ? category.trim().toUpperCase() : null,
      guid: guid.trim(),
      author: author ? author.trim() : null,
      sourceId: source.id,
      sourceName: source.name,
      sourceAuthor: source.author,
      sourceAccent: source.accent,
    });
    if (items.length >= MAX_ITEMS_PER_SOURCE) break;
  }
  return items;
}

function readCdata(scope: string, tag: string): string | null {
  const cdata = new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`, 'i').exec(scope);
  if (cdata) return cdata[1] ?? '';
  const plain = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i').exec(scope);
  if (plain) return (plain[1] ?? '').trim();
  return null;
}

function normalizePubDate(raw: string): string {
  if (!raw) return new Date(0).toISOString();
  const t = Date.parse(raw);
  if (Number.isFinite(t)) return new Date(t).toISOString();
  return raw;
}

function stableId(guid: string, link: string, pubDateRaw: string): string {
  const s = `${guid}|${link}|${pubDateRaw}`;
  let h = 5381;
  for (let i = 0; i < s.length; i += 1) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

const TRACKING_PARAMS = /^(utm_[a-z]+|ref(_src|_url)?|gclid|fbclid|mc_(cid|eid)|igshid|_hsenc|_hsmi|mkt_tok)$/i;

/** Rewrite the origin (protocol + host [+ optional :port]) of `url`
 *  according to the source's `linkOriginRewrite` table. The path,
 *  query, and hash are preserved verbatim. Returns the original URL
 *  unchanged if it can't be parsed or no rule matches. */
function rewriteLinkOrigin(url: string, rules: RssSource['linkOriginRewrite']): string {
  if (!rules || rules.length === 0) return url;
  try {
    const u = new URL(url);
    for (const rule of rules) {
      if (u.hostname === rule.from || u.host.endsWith('.' + rule.from)) {
        u.protocol = 'https:';
        u.hostname = rule.to;
        return u.toString();
      }
    }
    return url;
  } catch {
    return url;
  }
}

function stripTracking(url: string): string {
  try {
    const u = new URL(url);
    const toDelete: string[] = [];
    u.searchParams.forEach((_, k) => {
      if (TRACKING_PARAMS.test(k)) toDelete.push(k);
    });
    for (const k of toDelete) u.searchParams.delete(k);
    return u.toString();
  } catch {
    return url;
  }
}

/* ── Cache helpers ──────────────────────────────────────────────── */

async function loadCached(env: Env, sourceId: string): Promise<RssFeed | null> {
  try {
    const raw = await env.CASE_STUDIES.get(CACHE_KEY_FOR(sourceId));
    if (!raw) return null;
    return JSON.parse(raw) as RssFeed;
  } catch {
    return null;
  }
}

async function writeCached(env: Env, sourceId: string, feed: Omit<RssFeed, 'stale'>): Promise<void> {
  try {
    await env.CASE_STUDIES.put(CACHE_KEY_FOR(sourceId), JSON.stringify(feed), {
      expirationTtl: CACHE_TTL_SECONDS,
    });
  } catch {
    // Cache write failure is non-fatal.
  }
}

async function fetchFresh(source: RssSource): Promise<{ channel: RssChannel; items: RssItem[] }> {
  const res = await fetch(source.upstream, {
    headers: { 'user-agent': FETCH_UA, accept: 'application/rss+xml, application/xml, text/xml, */*' },
    signal: AbortSignal.timeout(15_000),
    cf: { cacheTtl: CACHE_TTL_SECONDS, cacheEverything: true, cacheTtlByStatus: { '200-299': CACHE_TTL_SECONDS, '400-599': 0 } },
  } as RequestInit);
  if (!res.ok) throw new Error(`upstream returned HTTP ${res.status}`);
  const xml = await res.text();
  const channel = extractChannel(xml, source);
  const items = extractItems(xml, source);
  return { channel, items };
}

async function loadOneSource(env: Env, source: RssSource): Promise<{ feed: RssFeed | null; error: string | null }> {
  const cached = await loadCached(env, source.id);
  const now = Date.now();

  // 1) Fresh cache hit
  if (cached) {
    const cachedAtMs = Date.parse(cached.cachedAt);
    if (Number.isFinite(cachedAtMs) && now - cachedAtMs < CACHE_TTL_SECONDS * 1000) {
      return { feed: { ...cached, stale: false }, error: null };
    }
  }

  // 2) Try upstream
  try {
    const fresh = await fetchFresh(source);
    const feed: RssFeed = {
      source: { id: source.id, name: source.name, author: source.author, accent: source.accent, displayLink: source.displayLink },
      channel: fresh.channel,
      items: fresh.items,
      cachedAt: new Date().toISOString(),
      stale: false,
    };
    await writeCached(env, source.id, feed);
    return { feed, error: null };
  } catch (e) {
    // 3) Fallback to stale cache
    if (cached) {
      return { feed: { ...cached, stale: true }, error: safeErrorMessage(env, e) };
    }
    return { feed: null, error: safeErrorMessage(env, e) };
  }
}

/* ── Handlers ───────────────────────────────────────────────────── */

/** GET /api/v1/threatsignal/rss — single-source, back-compat with the
 *  page that existed before the multi-source refactor. */
export async function threatSignalRssHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  return singleSourceHandler(c, 'threatsignal');
}

/** GET /api/v1/threatsignal/rss.xml — raw upstream passthrough. */
export async function threatSignalRssXmlHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  return passthroughHandler(c, 'threatsignal');
}

/** GET /api/v1/opensourcemalware/rss — same shape as the threatsignal
 *  handler, just pointed at the second source. */
export async function openSourceMalwareRssHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  return singleSourceHandler(c, 'opensourcemalware');
}

/** GET /api/v1/opensourcemalware/rss.xml — raw upstream passthrough. */
export async function openSourceMalwareRssXmlHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  return passthroughHandler(c, 'opensourcemalware');
}

/** GET /api/v1/rss/aggregate — merged feed across all sources (or one
 *  source if `?source=…` is passed). */
export async function rssAggregateHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const requested = c.req.query('source');
  const sources = requested
    ? SOURCES.filter((s) => s.id === requested)
    : SOURCES;
  if (requested && sources.length === 0) {
    return c.json({ error: 'unknown_source', valid: SOURCES.map((s) => s.id) }, 400);
  }

  // Fan out in parallel; one bad source doesn't fail the aggregate.
  const results = await Promise.all(sources.map(async (source) => {
    const { feed, error } = await loadOneSource(c.env, source);
    return { source, feed, error };
  }));

  const feeds: RssFeed[] = [];
  const items: RssItem[] = [];
  const sourceStatuses: RssAggregate['sources'] = [];
  for (const { source, feed, error } of results) {
    if (feed) {
      feeds.push(feed);
      items.push(...feed.items);
    }
    sourceStatuses.push({
      source: { id: source.id, name: source.name, author: source.author, accent: source.accent, displayLink: source.displayLink },
      cachedAt: feed?.cachedAt ?? new Date(0).toISOString(),
      stale: feed?.stale ?? false,
      error,
      itemCount: feed?.items.length ?? 0,
    });
  }

  // Sort by pubDate DESC and dedupe by id (defensive — different sources
  // could syndicate the same research).
  items.sort((a, b) => (b.pubDate ?? '').localeCompare(a.pubDate ?? ''));
  const seen = new Set<string>();
  const dedupedItems: RssItem[] = [];
  for (const it of items) {
    if (seen.has(it.id)) continue;
    seen.add(it.id);
    dedupedItems.push(it);
  }

  const aggregate: RssAggregate = {
    assembledAt: new Date().toISOString(),
    sources: sourceStatuses,
    feeds,
    items: dedupedItems,
  };

  // 200 even if some sources are missing — partial data is better than a
  // hard 502. The source-level `error` field tells the client to render
  // a per-source warning.
  const anyErrors = sourceStatuses.some((s) => s.error && s.itemCount === 0);
  return c.json(aggregate, anyErrors ? 207 : 200, {
    'cache-control': 'public, max-age=60, s-maxage=300',
  });
}

/** Public: list of available sources, for clients that want to render
 *  their own source-picker without hard-coding ids. */
export async function rssSourcesHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  return c.json(
    { sources: SOURCES.map((s) => ({ id: s.id, name: s.name, author: s.author, accent: s.accent, displayLink: s.displayLink })) },
    200,
    { 'cache-control': 'public, max-age=300, s-maxage=3600' }
  );
}

/* ── Internal handlers shared by the per-source routes ──────────── */

async function singleSourceHandler(c: Context<{ Bindings: Env }>, sourceId: string): Promise<Response> {
  const source = SOURCE_BY_ID[sourceId];
  if (!source) {
    return c.json({ error: 'unknown_source', valid: SOURCES.map((s) => s.id) }, 400);
  }
  const { feed, error } = await loadOneSource(c.env, source);
  if (!feed) {
    return c.json({ error: 'upstream_unavailable', message: error }, 502, { 'cache-control': 'no-store' });
  }
  return c.json(feed, 200, {
    'cache-control': feed.stale ? 'public, max-age=30, s-maxage=60' : 'public, max-age=60, s-maxage=300',
    'x-cache': feed.stale ? 'STALE' : (feed.cachedAt ? 'HIT' : 'MISS'),
  });
}

async function passthroughHandler(c: Context<{ Bindings: Env }>, sourceId: string): Promise<Response> {
  const source = SOURCE_BY_ID[sourceId];
  if (!source) {
    return c.json({ error: 'unknown_source', valid: SOURCES.map((s) => s.id) }, 400);
  }
  try {
    const res = await fetch(source.upstream, {
      headers: { 'user-agent': FETCH_UA, accept: 'application/rss+xml, application/xml, text/xml, */*' },
      signal: AbortSignal.timeout(15_000),
      cf: { cacheTtl: CACHE_TTL_SECONDS, cacheEverything: true },
    } as RequestInit);
    if (!res.ok) throw new Error(`upstream returned HTTP ${res.status}`);
    const body = await res.text();
    return new Response(body, {
      status: 200,
      headers: {
        'content-type': 'application/rss+xml; charset=utf-8',
        'cache-control': 'public, max-age=60, s-maxage=300',
        'x-source': source.upstream,
        'link': `<${getSiteUrl(c.env)}/api/v1/rss/aggregate?source=${source.id}>; rel="alternate"; type="application/json"`,
      },
    });
  } catch (e) {
    return c.json({ error: 'upstream_unavailable', message: safeErrorMessage(c.env, e) }, 502, { 'cache-control': 'no-store' });
  }
}
