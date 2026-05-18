import type { Context } from 'hono';
import type { Env } from '../env';
import { buildDeepDarkCti } from './deepdarkcti';

/**
 * Breach / leak-forum tracker — INTELLIGENCE ABOUT forums, never their
 * contents.
 *
 * Composes two free metadata sources:
 *   1. deepdarkCTI directory rows for criminal forums + dark markets
 *      (name, url, status) — community-maintained OSINT list.
 *   2. A small curated directory of well-known breach/leak forums whose
 *      `tracker_url` points at public OSINT *coverage* of that forum
 *      (DarkWebInformer search), NOT at the forum or any stolen data.
 *
 * HARD BOUNDARY: directory + status + public-tracker links only. This route
 * MUST NOT fetch, parse, mirror, or relay forum posts, credentials, or
 * breach contents.
 *
 * Cached 30 min.
 */

export const BREACH_FORUMS_CACHE_KEY = 'https://breach-forums-cache.internal/v1';
const CACHE_TTL_SECONDS = 30 * 60;

const DDC_FORUM_CATEGORIES = new Set(['Criminal Forums', 'Dark Markets']);

/**
 * Curated, well-known breach/leak forums. `tracker_url` is deliberately a
 * public OSINT-coverage search (DarkWebInformer) — we do not link to the
 * forums themselves or to any leaked data.
 */
const CURATED: Array<{ name: string; status: string; note: string }> = [
  {
    name: 'BreachForums',
    status: 'volatile',
    note: 'Successor to RaidForums; repeatedly seized/reborn under new operators.',
  },
  { name: 'Exposed', status: 'active', note: 'Post-BreachForums breach/leak community.' },
  { name: 'Leakbase', status: 'active', note: 'Leak-trading forum / Telegram presence.' },
  { name: 'Cracked', status: 'active', note: 'Account/cracking community adjacent to leak trading.' },
  { name: 'Nulled', status: 'active', note: 'Long-running cracking/leak forum.' },
  { name: 'DemonForums', status: 'intermittent', note: 'ULP / stealer-log and cloud-log trading threads.' },
  { name: 'XSS', status: 'active', note: 'Russian-language elite cybercrime forum (ex-DamageLab).' },
  { name: 'Exploit', status: 'active', note: 'Russian-language exploit/access-broker forum.' },
  { name: 'RaidForums', status: 'seized', note: 'Seized 2022 (Operation TOURNIQUET) — historical reference.' },
];

function trackerUrl(name: string): string {
  // Public OSINT coverage search — not the forum, not any leaked data.
  return `https://darkwebinformer.com/?s=${encodeURIComponent(name)}`;
}

interface ForumRow {
  name: string;
  /** 'directory' (deepdarkCTI) or 'curated'. */
  origin: 'directory' | 'curated';
  category: string;
  url: string;
  onion: boolean;
  status: string;
  note?: string;
}

export interface BreachForumsResponse {
  generated_at: string;
  rows: ForumRow[];
  totals: { directory: number; curated: number };
}

export async function buildBreachForums(env: Env, ctx: ExecutionContext): Promise<BreachForumsResponse> {
  const rows: ForumRow[] = [];

  // 1. deepdarkCTI forum/market directory rows (metadata only).
  let directory = 0;
  try {
    const ddc = await buildDeepDarkCti(env.KV_CACHE, ctx);
    for (const e of ddc.entries) {
      if (!DDC_FORUM_CATEGORIES.has(e.category)) continue;
      rows.push({
        name: e.name,
        origin: 'directory',
        category: e.category,
        url: e.url,
        onion: e.onion,
        status: e.status,
      });
      directory++;
    }
  } catch {
    /* deepdarkCTI cold/unavailable — curated list still renders */
  }

  // 2. Curated well-known forums → link to OSINT coverage, never the forum.
  for (const c of CURATED) {
    rows.push({
      name: c.name,
      origin: 'curated',
      category: 'Notable breach/leak forum',
      url: trackerUrl(c.name),
      onion: false,
      status: c.status,
      note: c.note,
    });
  }

  rows.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  return {
    generated_at: new Date().toISOString(),
    rows,
    totals: { directory, curated: CURATED.length },
  };
}

export async function breachForumsHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const cache = (caches as unknown as { default: Cache }).default;
  const cacheReq = new Request(BREACH_FORUMS_CACHE_KEY);
  const cached = await cache.match(cacheReq);
  if (cached) return cached;

  const body = await buildBreachForums(c.env, c.executionCtx);
  const response = new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${CACHE_TTL_SECONDS}` },
  });
  c.executionCtx.waitUntil(cache.put(cacheReq, response.clone()));
  return response;
}
