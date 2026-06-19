/**
 * Telegram channel search via tgstat.com public pages.
 *
 * tgstat.com runs the largest public Telegram channel catalog and offers
 * searchable channel directories by keyword. The HTML pages are public
 * and unauthenticated for the basic "find a channel" path:
 *
 *   - Search results: https://tgstat.com/en/search?q=<keyword>
 *   - Channel detail: https://tgstat.com/en/channel/@<handle>
 *
 * We don't use the tgstat API (it requires signup + key); the HTML path
 * is good enough for our "should we add this channel to the curated
 * list?" triage use case. We cache 12h in `caches.default` — channel
 * subscriber counts move slowly and we never want to hammer tgstat.
 *
 * Why HTML and not RSSHub? RSSHub's `/telegram/search` route is more
 * fragile (relies on Telegram's preview HTML, which changes) and doesn't
 * carry the subscriber / post-per-day / growth metadata we need for
 * triage. tgstat IS the metadata source.
 *
 * Cost shape: 1 upstream fetch per search, 1 per channel-detail. 12h
 * Cache API TTL means a typical user session hits 0 upstream requests.
 *
 * Failure modes:
 *   - tgstat HTML structure changes → parser returns fewer rows but
 *     never throws; the UI shows "0 results" gracefully.
 *   - tgstat 5xx / 429 → we return 502 with a stale-cache fallback
 *     (re-read the previous 12h payload if it exists).
 *   - Empty query → 400 with a clear hint to add a keyword.
 */

import type { Context } from 'hono';
import type { Env } from '../env';
import { safeNullLog } from '../lib/safe-catch';
import { badRequest, badGateway, validationError } from '../lib/api-error';
import { correlateHandle, type ActorHit } from '../lib/telegram-actor-correlate';

const TGSTAT_BASE = 'https://tgstat.com';
const CACHE_KEY_PREFIX = 'https://telegram-search.internal/v1';
const CHANNEL_CACHE_KEY_PREFIX = 'https://telegram-channel-meta.internal/v1';
const CACHE_TTL_SECONDS = 12 * 60 * 60;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_RESULTS = 20;
const MAX_QUERY_LEN = 80;
const HANDLE_RE = /^[a-zA-Z][a-zA-Z0-9_]{3,31}$/;

interface TelegramSearchResult {
  handle: string;
  name: string;
  description: string;
  /** Approximate subscriber count (parsed from "12.5K" / "1.2M" strings). */
  subscribers: number | null;
  /** Posts per day — float, may be 0 if tgstat doesn't surface it. */
  posts_per_day: number | null;
  /** Category label from tgstat (e.g. "Technology", "News"). */
  category: string | null;
  /** URL of the tgstat detail page. */
  tgstat_url: string;
  /** Linked actors (from the in-repo catalog + deepdarkCTI). */
  linked_actors: ActorHit[];
  /** Source label, used in the UI. */
  source: 'tgstat';
}

interface TelegramSearchResponse {
  query: string;
  generated_at: string;
  results: TelegramSearchResult[];
  warnings: string[];
  /** When the underlying tgstat HTML was last fetched (UTC ISO). */
  fetched_at: string;
  /** True when we served from a stale cache after a fetch failure. */
  stale: boolean;
}

// ── HTML parsing helpers ─────────────────────────────────────────────────────

/**
 * tgstat's search-results HTML is a Bootstrap-style list with each channel
 * as a card. The fields we need are in `<a class="..." href="/en/channel/@<handle>">`,
 * followed by the channel name (inside the same anchor), a description in
 * a sibling `<div>`, and a small meta block with subscribers + posts.
 *
 * Because the live page is heavily JS-rendered, the HTML we get is the
 * server-rendered SSR shell. Recent (2026) tgstat pages expose:
 *
 *   <div class="media-body">
 *     <a href="/en/channel/@<handle>" class="...">
 *       <h5 class="...">@<handle></h5>
 *       <div class="text-muted">channel title</div>
 *     </a>
 *     <div class="text-muted">description text</div>
 *     <div class="text-muted font-12">12.5K subscribers · 4 posts/day</div>
 *   </div>
 *
 * The parser is conservative: if a field can't be found, it's null. The
 * only hard requirement is the handle (extracted from the href).
 */
export function parseTgstatSearch(html: string): Array<Omit<TelegramSearchResult, 'linked_actors'>> {
  const out: Array<Omit<TelegramSearchResult, 'linked_actors'>> = [];
  // Cards are anchored on the channel-page link.
  const linkRe = /<a[^>]*href="\/en\/channel\/@([a-zA-Z][a-zA-Z0-9_]{3,31})"[^>]*>([\s\S]*?)<\/a>/g;
  let m: RegExpExecArray | null;
  const seen = new Set<string>();
  while ((m = linkRe.exec(html)) !== null) {
    const handle = m[1]!;
    if (seen.has(handle)) continue;
    seen.add(handle);
    const anchorHtml = m[2] ?? '';

    // Channel name: tgstat puts the handle in an <h5> (`@<handle>`) and
    // the human-friendly title in a sibling `<div class="text-muted">`.
    // We try the second anchor child first, then the whole-anchor text.
    const h5Text = /<h5[^>]*>([\s\S]*?)<\/h5>/.exec(anchorHtml)?.[1]?.replace(/<[^>]+>/g, '').trim() ?? '';
    const innerDivText = /<div[^>]*class="[^"]*text-muted[^"]*"[^>]*>([\s\S]*?)<\/div>/.exec(anchorHtml)?.[1]?.replace(/<[^>]+>/g, '').trim() ?? '';
    const nameRaw = innerDivText || h5Text || anchorHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    // If the only text is the `@handle` (no friendly name), fall back to
    // the handle itself — a sensible default.
    const name = nameRaw.startsWith('@') || nameRaw === '' || nameRaw === h5Text ? handle : nameRaw;

    // The card block extends from the link start to the next card or end
    // of section. We grab the next ~600 chars and pull description + meta.
    const tail = html.slice(m.index, m.index + 800);

    const description = extractDescription(tail);
    const meta = extractMeta(tail);

    out.push({
      handle,
      name,
      description,
      subscribers: meta.subscribers,
      posts_per_day: meta.posts_per_day,
      category: meta.category,
      tgstat_url: `${TGSTAT_BASE}/en/channel/@${handle}`,
      source: 'tgstat',
    });
    if (out.length >= MAX_RESULTS) break;
  }
  return out;
}

export function extractDescription(tail: string): string {
  // The description sits in a text-muted div under the anchor. The most
  // reliable marker is the second `text-muted` div in the card (the first
  // holds the channel name).
  const re = /<div[^>]*class="[^"]*text-muted[^"]*"[^>]*>([\s\S]*?)<\/div>/g;
  let m: RegExpExecArray | null;
  let idx = 0;
  while ((m = re.exec(tail)) !== null) {
    if (idx === 1) {
      const raw = m[1]!.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (raw.length > 0) return raw.slice(0, 280);
    }
    idx++;
  }
  return '';
}

export function extractMeta(tail: string): {
  subscribers: number | null;
  posts_per_day: number | null;
  category: string | null;
} {
  // tgstat shows meta in a font-12 div like "12.5K subscribers · 4 posts/day".
  // Sometimes the post/day is missing; the subscriber count is always first.
  const meta = tail.match(/<div[^>]*font-12[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1] ?? tail;
  const text = meta.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  const subsMatch = text.match(/([\d.,]+)\s*([KkMm])?\s*subscribers?/i);
  const subscribers = subsMatch ? parseCount(subsMatch[1]!, subsMatch[2]) : null;

  const postsMatch = text.match(/([\d.]+)\s*posts?\s*\/\s*day/i);
  const posts_per_day = postsMatch ? parseFloat(postsMatch[1]!) : null;

  // Category isn't always inline; the search-result header carries it.
  // We accept what's in the meta as a best-effort hint.
  const categoryMatch = text.match(/in\s+([A-Z][\w& ]{2,40})/);
  const category = categoryMatch ? categoryMatch[1]!.trim() : null;

  return { subscribers, posts_per_day, category };
}

export function parseCount(numStr: string, suffix: string | undefined): number | null {
  const cleaned = numStr.replace(/,/g, '');
  const n = parseFloat(cleaned);
  if (!Number.isFinite(n)) return null;
  if (!suffix) return Math.round(n);
  const s = suffix.toUpperCase();
  if (s === 'K') return Math.round(n * 1_000);
  if (s === 'M') return Math.round(n * 1_000_000);
  return Math.round(n);
}

// ── Upstream fetch ──────────────────────────────────────────────────────────

export async function fetchTgstatSearch(query: string): Promise<string | null> {
  const url = `${TGSTAT_BASE}/en/search?q=${encodeURIComponent(query)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'en-US,en;q=0.9',
        'user-agent': 'Mozilla/5.0 (compatible; pranithjain-dfir/1.0; +https://pranithjain.qzz.io)',
      },
      redirect: 'follow',
    });
    if (!r.ok) return null;
    return await r.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function cache(): Cache | null {
  try {
    return (caches as unknown as { default: Cache }).default;
  } catch {
    return null;
  }
}

export function searchCacheKey(query: string): Request {
  return new Request(`${CACHE_KEY_PREFIX}/q=${encodeURIComponent(query.toLowerCase())}`);
}

interface CachedSearchPayload {
  body: TelegramSearchResponse;
  fetched_at: string;
}

async function readStaleSearchCache(query: string): Promise<CachedSearchPayload | null> {
  const c = cache();
  if (!c) return null;
  const cached = await safeNullLog('tgsearch-stale', c.match(searchCacheKey(query)));
  if (!cached) return null;
  try {
    return (await cached.json()) as CachedSearchPayload;
  } catch {
    return null;
  }
}

// ── Handler ─────────────────────────────────────────────────────────────────

export async function telegramSearchHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const queryRaw = c.req.query('q') ?? '';
  const query = queryRaw.trim();
  if (!query) {
    return validationError(c, { q: 'query is required' });
  }
  if (query.length > MAX_QUERY_LEN) {
    return validationError(c, { q: `query must be ≤${MAX_QUERY_LEN} chars` });
  }

  // Hit-by-handle shortcut: if the query is itself a valid handle, the
  // tgstat search will likely surface it; but we also enrich the result
  // with the actor-catalog correlation, which works without going to
  // tgstat first. Saves a subrequest on the single-handle use case.
  const isHandle = HANDLE_RE.test(query.replace(/^@/, ''));
  const warnings: string[] = [];

  const c2 = cache();
  // Cache lookup (fast path).
  let cachedPayload: CachedSearchPayload | null = null;
  if (c2) {
    const hit = await safeNullLog('tgsearch-cache', c2.match(searchCacheKey(query)));
    if (hit) {
      try {
        cachedPayload = (await hit.json()) as CachedSearchPayload;
      } catch {
        cachedPayload = null;
      }
    }
  }

  let results: TelegramSearchResult[] = [];
  let fetchedAt = new Date().toISOString();
  let stale = false;

  if (cachedPayload) {
    // Re-attach a fresh generated_at for the client, but keep the
    // underlying results — they don't change in 12h.
    const out: TelegramSearchResponse = {
      ...cachedPayload.body,
      generated_at: new Date().toISOString(),
      warnings: [],
    };
    return c.json(out, 200, {
      'cache-control': `public, max-age=${CACHE_TTL_SECONDS}`,
      'x-tgsearch-stale': 'false',
    });
  }

  // Cache miss → upstream fetch.
  const html = await fetchTgstatSearch(query);
  if (!html) {
    // Try to serve a stale payload from a wider key window. The Cache
    // API does not have a "stale" mode, so we re-read whatever was
    // written previously under the same key.
    const stalePayload = await readStaleSearchCache(query);
    if (stalePayload) {
      stale = true;
      warnings.push('tgstat upstream failed; serving previous result');
      const out: TelegramSearchResponse = {
        ...stalePayload.body,
        generated_at: new Date().toISOString(),
        warnings,
        stale: true,
      };
      return c.json(out, 200, {
        'cache-control': `public, max-age=300`, // short revalidation window
        'x-tgsearch-stale': 'true',
      });
    }
    return badGateway(c, 'tgstat upstream unavailable');
  }

  const parsed = parseTgstatSearch(html);
  if (parsed.length === 0 && !isHandle) {
    warnings.push('tgstat returned no results; the keyword may be too specific or unsupported');
  }

  // Actor correlation — runs in parallel for the small N we got back.
  // For each handle, fetch ActorHits; merge.
  const handleCache = cache();
  const enriched = await Promise.all(
    parsed.map(async (r) => {
      const hits = await correlateHandle(r.handle, { cache: handleCache });
      return { ...r, linked_actors: hits };
    })
  );
  results = enriched;

  const body: TelegramSearchResponse = {
    query,
    generated_at: new Date().toISOString(),
    results,
    warnings,
    fetched_at: fetchedAt,
    stale: false,
  };

  // Write the cache entry — we cache the full response so subsequent
  // requests skip both the upstream and the actor-corr… pass.
  if (c2) {
    const payload: CachedSearchPayload = { body, fetched_at: fetchedAt };
    const resp = new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${CACHE_TTL_SECONDS}` },
    });
    c.executionCtx?.waitUntil(c2.put(searchCacheKey(query), resp));
  }

  return c.json(body, 200, {
    'cache-control': `public, max-age=${CACHE_TTL_SECONDS}`,
    'x-tgsearch-stale': 'false',
  });
}

// ── Channel detail (single-handle) ───────────────────────────────────────────

interface ChannelMetaResponse {
  handle: string;
  name: string;
  description: string;
  subscribers: number | null;
  posts_per_day: number | null;
  category: string | null;
  tgstat_url: string;
  /** True when tgstat doesn't have a record (e.g. very small channel). */
  not_found: boolean;
  linked_actors: ActorHit[];
  generated_at: string;
  stale: boolean;
}

export async function telegramChannelMetaHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const handleRaw = c.req.query('handle') ?? '';
  const handle = handleRaw.trim().replace(/^@/, '');
  if (!HANDLE_RE.test(handle)) {
    return validationError(c, { handle: 'invalid handle — must be 4-32 alphanumeric chars, starting with a letter' });
  }
  const c2 = cache();
  const key = new Request(`${CHANNEL_CACHE_KEY_PREFIX}/h=${handle.toLowerCase()}`);
  // Cache hit
  if (c2) {
    const hit = await safeNullLog('tgchan-cache', c2.match(key));
    if (hit) {
      const body = (await hit.json()) as ChannelMetaResponse;
      return c.json({ ...body, generated_at: new Date().toISOString() }, 200, {
        'cache-control': `public, max-age=${CACHE_TTL_SECONDS}`,
      });
    }
  }
  // Upstream
  const url = `${TGSTAT_BASE}/en/channel/@${encodeURIComponent(handle)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  let html: string | null = null;
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'en-US,en;q=0.9',
        'user-agent': 'Mozilla/5.0 (compatible; pranithjain-dfir/1.0; +https://pranithjain.qzz.io)',
      },
      redirect: 'follow',
    });
    if (r.ok) html = await r.text();
  } catch {
    html = null;
  } finally {
    clearTimeout(timer);
  }

  if (!html) {
    const out: ChannelMetaResponse = {
      handle,
      name: handle,
      description: '',
      subscribers: null,
      posts_per_day: null,
      category: null,
      tgstat_url: `${TGSTAT_BASE}/en/channel/@${handle}`,
      not_found: true,
      linked_actors: await correlateHandle(handle, { cache: c2 }),
      generated_at: new Date().toISOString(),
      stale: false,
    };
    return c.json(out, 200, { 'cache-control': 'public, max-age=600' });
  }

  // Detail page parsing. The detail page is simpler than search; the
  // channel name is in the page title, the subscriber count in a
  // dedicated stat block, and the description in the meta description.
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i)?.[1] ?? handle;
  const name = titleMatch.replace(/\s*\|\s*TGStat.*$/i, '').replace(/^@/, '').trim() || handle;
  const subsMatch = html.match(/([\d.,]+)\s*([KkMm])?\s*subscribers?/i);
  const subscribers = subsMatch ? parseCount(subsMatch[1]!, subsMatch[2]) : null;
  const postsMatch = html.match(/([\d.]+)\s*posts?\s*\/\s*day/i);
  const posts_per_day = postsMatch ? parseFloat(postsMatch[1]!) : null;
  const descMatch =
    html.match(/<meta\s+name="description"\s+content="([^"]+)"/i)?.[1] ??
    html.match(/<div[^>]*class="[^"]*channel-about[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1] ??
    '';
  const description = descMatch.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400);

  const out: ChannelMetaResponse = {
    handle,
    name,
    description,
    subscribers,
    posts_per_day,
    category: null,
    tgstat_url: `${TGSTAT_BASE}/en/channel/@${handle}`,
    not_found: false,
    linked_actors: await correlateHandle(handle, { cache: c2 }),
    generated_at: new Date().toISOString(),
    stale: false,
  };

  if (c2) {
    const resp = new Response(JSON.stringify(out), {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${CACHE_TTL_SECONDS}` },
    });
    c.executionCtx?.waitUntil(c2.put(key, resp));
  }
  return c.json(out, 200, { 'cache-control': `public, max-age=${CACHE_TTL_SECONDS}` });
}
