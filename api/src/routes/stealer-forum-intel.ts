import type { Context } from 'hono';
import type { Env } from '../env';
import { buildDeepDarkCti } from './deepdarkcti';
import { fetchTelegramFeed } from './telegram-feed';
import { fetchRedditFeed } from './reddit-feed';

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

export const STEALER_FORUM_INTEL_CACHE_KEY = 'https://stealer-forum-intel-cache.internal/v6-debug-rd';
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
  // The Telegram feed is fetched DIRECTLY (no cache) here. Reasons:
  //   - The feed uses a *bump-aware* cache key that rotates whenever the
  //     admin adds/removes a custom channel. The SFI's own cache.shadow
  //     lag (60s) means the SFI can read a stale bump and look up a key
  //     the feed no longer uses — that was the source of "0 chatter hits"
  //     on the infostealer page even when the feed had matching items.
  //   - The SFI has its own 30-min cache on the composite response, so
  //     re-fetching the Telegram feed here (one upstream call per SFI
  //     rebuild) is bounded and free in practice.
  //   - Direct fetch means the SFI always sees the freshest feed contents
  //     — important because the chatter counters are a daily-visited UI
  //     surface and a 60s shadow miss was leaving them silently empty.
  let tg: { items?: Array<{ channel_name?: string; permalink?: string; datetime?: string; text?: string }> } | null =
    null;
  try {
    tg = await fetchTelegramFeed(env.KV_CACHE);
  } catch {
    tg = null;
  }
  // Reddit is fetched the same way — the v11-raw key was returning cache-
  // miss results in the same colo where the feed endpoint itself was
  // serving fresh data, suggesting a key drift between the producer and
  // the consumer. Direct fetch is bounded by the SFI's own 30-min cache.
  let rd: {
    items?: Array<{ sub_label?: string; link?: string; pub_date?: string; title?: string; text?: string }>;
  } | null = null;
  try {
    rd = await fetchRedditFeed();
  } catch (e) {
    console.log('[sfi] reddit feed fetch error:', String(e));
    rd = null;
  }
  console.log(
    '[sfi] rd items:',
    rd?.items?.length ?? 0,
    'warnings:',
    (rd as { warnings?: string[] } | null)?.warnings ?? []
  );

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
