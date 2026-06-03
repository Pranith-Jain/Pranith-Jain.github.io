import type { Context } from 'hono';
import type { Env } from '../env';
import { fetchResilient } from '../lib/fetch-resilient';

/**
 * Threat-actor username lookup.
 *
 * Source: spmedia's "Threat-Actor-Usernames-Scrape"
 * (https://github.com/spmedia/Threat-Actor-Usernames-Scrape, MIT) — usernames
 * scraped from cybercrime/hacking forums (~291k unique handles across ~25
 * forums). The repo ships:
 *   - forumusers_ALL_*.json  → flat, deduplicated handle list (presence + total)
 *   - forum_users_<name>.txt       → active-forum membership
 *   - dead_forum_users_<name>.txt  → defunct-forum membership
 *
 * Strategy (on-demand fetch + cache): per-forum files are fetched lazily,
 * edge-cached (cf.cacheTtl), and scanned for the query handle so a search can
 * say WHICH forums a handle appears on (active vs dead). Per-query results are
 * cached in caches.default so repeat searches don't re-scan. The consolidated
 * JSON backs the /stats corpus total only.
 */

const RAW_BASE = 'https://raw.githubusercontent.com/spmedia/Threat-Actor-Usernames-Scrape/main';
const CONSOLIDATED_URL = `${RAW_BASE}/forumusers_ALL_Dec_2025_count_291136.json`;

const FETCH_TIMEOUT_MS = 20_000;
/** Edge-cache forum files for 6h — the corpus moves on the order of days. */
const SOURCE_CACHE_TTL = 6 * 60 * 60;
/** Per-query result cache TTL. */
const QUERY_CACHE_TTL = 3600;
const MIN_QUERY_LEN = 2;
const MAX_RESULTS = 100;
/** Hard cap on matched lines scanned per file before we stop collecting (keeps memory bounded). */
const PER_FILE_MATCH_CAP = 500;

interface ForumDef {
  /** Raw filename in the repo. */
  file: string;
  /** Display label. */
  forum: string;
  /** Defunct forum (dead_forum_users_*). */
  dead: boolean;
}

/**
 * Forum-file registry. Mirrors the repo's file listing as of 2026-06.
 * Adding/removing a forum is a one-line edit here.
 */
const FORUMS: ForumDef[] = [
  { file: 'forum_users_altenen.txt', forum: 'Altenen', dead: false },
  { file: 'forum_users_ascarding.txt', forum: 'Ascarding', dead: false },
  { file: 'forum_users_blackhatworld.txt', forum: 'BlackHatWorld', dead: false },
  { file: 'forum_users_breached2026.txt', forum: 'Breached (2026)', dead: false },
  { file: 'forum_users_cracked.txt', forum: 'Cracked', dead: false },
  { file: 'forum_users_craxpro.txt', forum: 'CraxPro', dead: false },
  { file: 'forum_users_darkforums.txt', forum: 'DarkForums', dead: false },
  { file: 'forum_users_darknetarmy.txt', forum: 'DarknetArmy', dead: false },
  { file: 'forum_users_dread.txt', forum: 'Dread', dead: false },
  { file: 'forum_users_hackforums.txt', forum: 'HackForums', dead: false },
  { file: 'forum_users_oguser.txt', forum: 'OGUsers', dead: false },
  { file: 'forum_users_patched.txt', forum: 'Patched', dead: false },
  { file: 'forum_users_pwnforums.txt', forum: 'PwnForums', dead: false },
  { file: 'forum_users_rehubcom.txt', forum: 'ReHub', dead: false },
  { file: 'forum_users_xreactor.txt', forum: 'XReactor', dead: false },
  { file: 'forum_users_xss.txt', forum: 'XSS', dead: false },
  { file: 'dead_forum_users_breached_hn.txt', forum: 'Breached.HN', dead: true },
  { file: 'dead_forum_users_breachforumsBF.txt', forum: 'BreachForums (BF)', dead: true },
  { file: 'dead_forum_users_breachforums_st.txt', forum: 'BreachForums (.st)', dead: true },
  { file: 'dead_forum_users_breachstars.txt', forum: 'BreachStars', dead: true },
  { file: 'dead_forum_users_leakbase.txt', forum: 'LeakBase', dead: true },
  { file: 'dead_forum_users_nohide_io.txt', forum: 'NoHide.io', dead: true },
  { file: 'dead_forum_users_umbra.txt', forum: 'Umbra', dead: true },
];

export interface UsernameMatch {
  username: string;
  forum_count: number;
  forums: { forum: string; dead: boolean }[];
}

export interface UsernameSearchResponse {
  query: string;
  generated_at: string;
  total_matches: number;
  truncated: boolean;
  results: UsernameMatch[];
  /** Forum files that failed to fetch this run (attribution may be incomplete). */
  warnings: string[];
}

export interface UsernameStatsResponse {
  generated_at: string;
  total_usernames: number | null;
  sources: string[];
  forums: { forum: string; dead: boolean }[];
}

async function fetchForumText(url: string): Promise<string | null> {
  try {
    const res = await fetchResilient(
      url,
      {
        headers: { 'user-agent': 'pranithjain-dfir/1.0', accept: 'text/plain,*/*' },
        cf: { cacheTtl: SOURCE_CACHE_TTL, cacheEverything: true },
        redirect: 'follow',
      },
      { attempts: 2, timeoutMs: FETCH_TIMEOUT_MS }
    );
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

type MatchMode = 'exact' | 'prefix' | 'substring';

function lineMatches(line: string, q: string, mode: MatchMode): boolean {
  if (mode === 'exact') return line === q;
  if (mode === 'prefix') return line.startsWith(q);
  return line.includes(q);
}

async function runSearch(q: string, mode: MatchMode): Promise<UsernameSearchResponse> {
  // username (lowercased) -> set of forum indices it appears in
  const hits = new Map<string, Set<number>>();
  // Preserve the original-cased handle for display (first seen wins).
  const display = new Map<string, string>();
  const warnings: string[] = [];

  const texts = await Promise.all(FORUMS.map((f) => fetchForumText(`${RAW_BASE}/${f.file}`)));

  for (let fi = 0; fi < FORUMS.length; fi++) {
    const text = texts[fi];
    if (!text) {
      warnings.push(FORUMS[fi]!.forum);
      continue;
    }
    let perFile = 0;
    for (const rawLine of text.split('\n')) {
      const handle = rawLine.trim();
      if (!handle) continue;
      const lower = handle.toLowerCase();
      if (!lineMatches(lower, q, mode)) continue;
      let set = hits.get(lower);
      if (!set) {
        set = new Set<number>();
        hits.set(lower, set);
        display.set(lower, handle);
      }
      set.add(fi);
      if (++perFile >= PER_FILE_MATCH_CAP) break;
    }
  }

  // Rank: exact match first, then fewer-character handles (closer to query),
  // then by forum breadth (handles seen on more forums are more interesting).
  const ranked = [...hits.entries()].sort((a, b) => {
    const ax = a[0] === q ? 0 : 1;
    const bx = b[0] === q ? 0 : 1;
    if (ax !== bx) return ax - bx;
    if (b[1].size !== a[1].size) return b[1].size - a[1].size;
    return a[0].length - b[0].length;
  });

  const results: UsernameMatch[] = ranked.slice(0, MAX_RESULTS).map(([lower, set]) => {
    const forums = [...set].map((fi) => ({ forum: FORUMS[fi]!.forum, dead: FORUMS[fi]!.dead }));
    return { username: display.get(lower) ?? lower, forum_count: forums.length, forums };
  });

  return {
    query: q,
    generated_at: new Date().toISOString(),
    total_matches: ranked.length,
    truncated: ranked.length > MAX_RESULTS,
    results,
    warnings,
  };
}

export async function actorUsernamesHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const rawQ = (c.req.query('q') ?? '').trim().toLowerCase();
  const modeParam = c.req.query('mode');
  const mode: MatchMode = modeParam === 'exact' || modeParam === 'prefix' ? modeParam : 'substring';

  if (rawQ.length < MIN_QUERY_LEN) {
    return c.json({ error: `query must be at least ${MIN_QUERY_LEN} characters` }, 400);
  }

  const cache = (caches as unknown as { default: Cache }).default;
  const cacheReq = new Request(`https://actor-usernames-cache.internal/v1/${mode}/${encodeURIComponent(rawQ)}`);
  const cached = await cache.match(cacheReq);
  if (cached) return new Response(cached.body, cached);

  const body = await runSearch(rawQ, mode);
  const response = new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${QUERY_CACHE_TTL}` },
  });
  c.executionCtx.waitUntil(cache.put(cacheReq, response.clone()));
  return response;
}

export async function actorUsernamesStatsHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const cache = (caches as unknown as { default: Cache }).default;
  const cacheReq = new Request('https://actor-usernames-stats.internal/v1');
  const cached = await cache.match(cacheReq);
  if (cached) return new Response(cached.body, cached);

  let total: number | null = null;
  let sources: string[] = [];
  const text = await fetchForumText(CONSOLIDATED_URL);
  if (text) {
    try {
      const json = JSON.parse(text) as {
        metadata?: { total_usernames?: number; sources?: string[] };
      };
      total = typeof json.metadata?.total_usernames === 'number' ? json.metadata.total_usernames : null;
      sources = Array.isArray(json.metadata?.sources) ? json.metadata!.sources! : [];
    } catch {
      /* leave defaults */
    }
  }

  const body: UsernameStatsResponse = {
    generated_at: new Date().toISOString(),
    total_usernames: total,
    sources,
    forums: FORUMS.map((f) => ({ forum: f.forum, dead: f.dead })),
  };
  const response = new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${SOURCE_CACHE_TTL}` },
  });
  c.executionCtx.waitUntil(cache.put(cacheReq, response.clone()));
  return response;
}
