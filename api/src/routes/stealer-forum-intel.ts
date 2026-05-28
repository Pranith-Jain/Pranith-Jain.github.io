import type { Context } from 'hono';
import type { Env } from '../env';
import { buildDeepDarkCti } from './deepdarkcti';
import { TELEGRAM_FEED_CACHE_KEY } from './telegram-feed';
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

export const STEALER_FORUM_INTEL_CACHE_KEY = 'https://stealer-forum-intel-cache.internal/v1';
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
  const tg = await readCachedJson<{
    items?: Array<{ channel_name?: string; permalink?: string; datetime?: string; text?: string }>;
  }>(TELEGRAM_FEED_CACHE_KEY);
  const rd = await readCachedJson<{
    items?: Array<{ sub_label?: string; link?: string; pub_date?: string; title?: string; text?: string }>;
  }>(REDDIT_FEED_CACHE_KEY);

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
