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
const CURATED: Array<{ name: string; status: string; note: string; kind: 'forum' | 'market' }> = [
  // ── Breach / leak forums ───────────────────────────────────────────────
  {
    name: 'BreachForums',
    status: 'volatile',
    note: 'Successor to RaidForums; repeatedly seized/reborn under new operators.',
    kind: 'forum',
  },
  { name: 'Exposed', status: 'active', note: 'Post-BreachForums breach/leak community.', kind: 'forum' },
  { name: 'Leakbase', status: 'active', note: 'Leak-trading forum / Telegram presence.', kind: 'forum' },
  { name: 'Cracked', status: 'active', note: 'Account/cracking community adjacent to leak trading.', kind: 'forum' },
  { name: 'Nulled', status: 'active', note: 'Long-running cracking/leak forum.', kind: 'forum' },
  {
    name: 'DemonForums',
    status: 'intermittent',
    note: 'ULP / stealer-log and cloud-log trading threads.',
    kind: 'forum',
  },
  { name: 'XSS', status: 'active', note: 'Russian-language elite cybercrime forum (ex-DamageLab).', kind: 'forum' },
  { name: 'Exploit', status: 'active', note: 'Russian-language exploit/access-broker forum.', kind: 'forum' },
  {
    name: 'Sinisterly',
    status: 'active',
    note: 'Low-tier hacking/leak forum, frequent OSINT coverage.',
    kind: 'forum',
  },
  {
    name: 'LeakZone',
    status: 'active',
    note: 'Leak/crack community adjacent to BreachForums diaspora.',
    kind: 'forum',
  },
  {
    name: 'OGUsers',
    status: 'volatile',
    note: 'Account-takeover / SIM-swap community; itself repeatedly breached.',
    kind: 'forum',
  },
  { name: 'Dread', status: 'active', note: 'Reddit-style darknet discussion forum (markets, opsec).', kind: 'forum' },
  {
    name: 'RaidForums',
    status: 'seized',
    note: 'Seized 2022 (Operation TOURNIQUET) — historical reference.',
    kind: 'forum',
  },
  // ── Underground marketplaces (credential / log / access trade) ─────────
  { name: 'Russian Market', status: 'active', note: 'Stealer-log & credential marketplace.', kind: 'market' },
  { name: '2easy Shop', status: 'active', note: 'Stealer-log marketplace ("logs" by bot).', kind: 'market' },
  {
    name: 'Genesis Market',
    status: 'seized',
    note: 'Browser-fingerprint / session marketplace — seized 2023 (Operation Cookie Monster).',
    kind: 'market',
  },
  { name: 'Slilpp', status: 'seized', note: 'Largest credential marketplace — seized 2021.', kind: 'market' },
  {
    name: "Brian's Club",
    status: 'active',
    note: 'Long-running carding shop; widely tracked in CTI reporting.',
    kind: 'market',
  },
  {
    name: 'Abacus Market',
    status: 'volatile',
    note: 'Large darknet market (post-Hydra/Incognito landscape).',
    kind: 'market',
  },
  {
    name: 'Joker' + "'s Stash",
    status: 'defunct',
    note: 'Dominant carding market until voluntary 2021 shutdown — historical reference.',
    kind: 'market',
  },
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

  // 2. Curated well-known forums/markets → OSINT-coverage link, never the venue.
  for (const c of CURATED) {
    rows.push({
      name: c.name,
      origin: 'curated',
      category: c.kind === 'market' ? 'Notable underground marketplace' : 'Notable breach/leak forum',
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
  if (cached) return new Response(cached.body, cached);

  const body = await buildBreachForums(c.env, c.executionCtx);
  const response = new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${CACHE_TTL_SECONDS}` },
  });
  c.executionCtx.waitUntil(cache.put(cacheReq, response.clone()));
  return response;
}
