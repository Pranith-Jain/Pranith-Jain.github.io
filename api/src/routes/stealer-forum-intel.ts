import type { Context } from 'hono';
import type { Env } from '../env';
import { buildDeepDarkCti } from './deepdarkcti';
import { fetchTelegramFeed, getTelegramFeedCacheKey, TELEGRAM_FEED_CACHE_KEY } from './telegram-feed';
import { REDDIT_FEED_CACHE_KEY } from './reddit-feed';

/**
 * Combo & stealer-forum INTELLIGENCE — strictly metadata-about, never the
 * data itself.
 *
 * This endpoint composes signals we already hold:
 *   1. deepdarkCTI directory rows for criminal forums, dark markets and
 *      infostealer/threat-actor Telegram channels (names, links, status).
 *   2. Keyword-tagged *counts + permalinks* of combolist/stealer chatter
 *      across our curated Telegram and Reddit feeds.
 *
 * HARD BOUNDARY: it surfaces only directory metadata (name, url, status)
 * and chatter pointers (source, permalink, timestamp, matched keyword). It
 * MUST NOT fetch, parse, store, or relay stolen credentials, combolists or
 * breach contents. No post body text is returned — only the fact that a
 * tracked source mentioned a tracked term, and where to read it.
 *
 * Cached 30 min — inputs are themselves cached upstream.
 */

export const STEALER_FORUM_INTEL_CACHE_KEY = 'https://stealer-forum-intel-cache.internal/v9-tg-fallback';
const CACHE_TTL_SECONDS = 30 * 60;

/** deepdarkCTI category labels that map to combo/stealer/forum tradecraft. */
const FORUM_CATEGORIES = new Set(['Criminal Forums', 'Dark Markets', 'Infostealer Telegram', 'Threat-Actor Telegram']);

/** Combolist / stealer-log tradecraft terms. Word-ish to limit over-match. */
const STEALER_TERMS =
  /\b(combolist|combo list|ulp|url[- ]?log[- ]?pass|cloud logs?|stealer logs?|logs? cloud|fullz|redline|lumma|stealc|vidar|raccoon|rhadamanthys|meta ?stealer|risepro|lockbit logs|infostealer)\b/i;

interface ForumEntry {
  name: string;
  url: string;
  onion: boolean;
  status: string;
}
interface ForumGroup {
  category: string;
  count: number;
  entries: ForumEntry[];
}
interface ChatterSample {
  source: string;
  link: string;
  when?: string;
  keyword: string;
}
interface ChatterBlock {
  matches: number;
  samples: ChatterSample[];
}

export interface StealerForumIntelResponse {
  generated_at: string;
  forums: ForumGroup[];
  chatter: { telegram: ChatterBlock; reddit: ChatterBlock };
  totals: { tracked_sources: number; categories: number };
}

async function readCachedJson<T>(cacheKey: string): Promise<T | null> {
  try {
    const cache = (caches as unknown as { default: Cache }).default;
    const hit = await cache.match(cacheKey);
    if (!hit) return null;
    return (await hit.json()) as T;
  } catch {
    return null;
  }
}

function firstMatch(text: string): string | null {
  const m = STEALER_TERMS.exec(text);
  return m ? m[0].toLowerCase() : null;
}

export async function buildStealerForumIntel(env: Env, ctx: ExecutionContext): Promise<StealerForumIntelResponse> {
  // 1. deepdarkCTI directory — metadata rows only.
  let forums: ForumGroup[] = [];
  try {
    const ddc = await buildDeepDarkCti(env.KV_CACHE, ctx);
    const byCat = new Map<string, ForumEntry[]>();
    for (const e of ddc.entries) {
      if (!FORUM_CATEGORIES.has(e.category)) continue;
      const arr = byCat.get(e.category) ?? [];
      arr.push({ name: e.name, url: e.url, onion: e.onion, status: e.status });
      byCat.set(e.category, arr);
    }
    forums = [...byCat.entries()]
      .map(([category, entries]) => ({ category, count: entries.length, entries }))
      .sort((a, b) => b.count - a.count);
  } catch {
    forums = [];
  }

  // 2. Keyword-tagged chatter — counts + pointers, never body text.
  //
  // Read both feeds from the *Cache API*. The SFI build is already at the
  // Cloudflare concurrent-subrequest limit (7 forum fetches in parallel),
  // so we keep tg/rd reads sequential AFTER the forum block completes.
  //   - The telegram feed uses a *bump-aware* cache key; we resolve it
  //     via getTelegramFeedCacheKey(env) so the SFI reads the same key
  //     the feed producer wrote to (no string-vs-Request drift).
  //   - Reddit uses a static cache key. The producer wraps it in
  //     `new Request(...)` for `cache.put`; we mirror that here with
  //     `new Request(...)` for `cache.match` so the keys normalize
  //     identically (string-vs-Request mismatch has been a real cause
  //     of silent 0s in this codebase).
  //   - If the telegram cache misses (e.g. bump just changed and the
  //     hourly cron hasn't republished yet), fall back to a direct
  //     fetchTelegramFeed() call. This hits t.me but is bounded by the
  //     SFI's own 30-min cache on the composite response.
  const tgCache = (caches as unknown as { default: Cache }).default;
  const tgKeyReq = await getTelegramFeedCacheKey(env);
  const tgMatch = await tgCache.match(tgKeyReq);
  let tg: {
    items?: Array<{ channel_name?: string; permalink?: string; datetime?: string; text?: string }>;
  } | null = null;
  if (tgMatch) {
    tg = (await tgMatch.clone().json()) as typeof tg;
    tgMatch.body?.cancel();
  } else {
    // Cache miss — try the base key (no bump) and fall back to a direct fetch.
    const baseMatch = await tgCache.match(new Request(TELEGRAM_FEED_CACHE_KEY));
    if (baseMatch) {
      tg = (await baseMatch.clone().json()) as typeof tg;
      baseMatch.body?.cancel();
    } else if (env.KV_CACHE) {
      try {
        const fresh = await fetchTelegramFeed(env.KV_CACHE);
        tg = fresh;
        // Warm the cache for next time (and shadow write the bump-aware key).
        ctx.waitUntil(
          tgCache.put(
            tgKeyReq,
            new Response(JSON.stringify(fresh), {
              headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=1800' },
            })
          )
        );
      } catch {
        tg = null;
      }
    }
  }
  const rdKeyReq = new Request(REDDIT_FEED_CACHE_KEY);
  const rdMatch = await tgCache.match(rdKeyReq);
  const rd = rdMatch
    ? ((await rdMatch.clone().json()) as {
        items?: Array<{ sub_label?: string; link?: string; pub_date?: string; title?: string; text?: string }>;
      } | null)
    : null;
  rdMatch?.body?.cancel();

  const tgSamples: ChatterSample[] = [];
  let tgMatches = 0;
  for (const it of tg?.items ?? []) {
    const kw = firstMatch(`${it.text ?? ''} ${it.permalink ?? ''}`);
    if (!kw) continue;
    tgMatches++;
    if (tgSamples.length < 12)
      tgSamples.push({
        source: it.channel_name ?? 'telegram',
        link: it.permalink ?? '',
        when: it.datetime,
        keyword: kw,
      });
  }

  const rdSamples: ChatterSample[] = [];
  let rdMatches = 0;
  for (const it of rd?.items ?? []) {
    const kw = firstMatch(`${it.title ?? ''} ${it.text ?? ''}`);
    if (!kw) continue;
    rdMatches++;
    if (rdSamples.length < 12)
      rdSamples.push({ source: it.sub_label ?? 'reddit', link: it.link ?? '', when: it.pub_date, keyword: kw });
  }

  const trackedSources = forums.reduce((s, g) => s + g.count, 0);
  return {
    generated_at: new Date().toISOString(),
    forums,
    chatter: {
      telegram: { matches: tgMatches, samples: tgSamples },
      reddit: { matches: rdMatches, samples: rdSamples },
    },
    totals: { tracked_sources: trackedSources, categories: forums.length },
  };
}

export async function stealerForumIntelHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const cache = (caches as unknown as { default: Cache }).default;
  const cacheReq = new Request(STEALER_FORUM_INTEL_CACHE_KEY);
  const cached = await cache.match(cacheReq);
  if (cached) return new Response(cached.body, cached);

  const body = await buildStealerForumIntel(c.env, c.executionCtx);
  const cacheable = body.forums.length > 0 || body.chatter.telegram.matches > 0 || body.chatter.reddit.matches > 0;
  const response = new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': cacheable ? `public, max-age=${CACHE_TTL_SECONDS}` : 'no-store',
    },
  });
  if (cacheable) c.executionCtx.waitUntil(cache.put(cacheReq, response.clone()));
  return response;
}
