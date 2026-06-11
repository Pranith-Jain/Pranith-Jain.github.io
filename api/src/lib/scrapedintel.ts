/**
 * ScrapedIntel forum-handle lookup (threatactorusernames.com).
 *
 * Source: https://threatactorusernames.com — a live search API by ScrapedIntel
 * (@CTI__Updates) indexing 2M+ usernames seen across cybercrime forums and open
 * sources. One endpoint: `GET /api/search?q=<handle>` (2–80 chars, no auth),
 * **rate-limited to 4 requests / minute**.
 *
 * Presence of a handle is an attribution SIGNAL, not proof of identity or
 * intent — the corpus also contains researchers, journalists, LE, and scraper
 * accounts (see the upstream FAQ).
 *
 * This module is split so the pure parsing logic is unit-testable with no I/O,
 * and the live `lookupHandle` (cache + global egress budget + last-good) is
 * shared by both the dedicated route and the unified-search omnibox searcher.
 */

import { fetchResilient } from './fetch-resilient';

export const SCRAPEDINTEL_SOURCE = 'threatactorusernames.com';
export const SCRAPEDINTEL_SOURCE_URL = 'https://threatactorusernames.com';

/** Max distinct handles returned from one search (keeps payload/memory bounded). */
export const MAX_RESULTS = 100;
/** Max forums attributed to a single handle (defensive cap on untrusted upstream). */
export const MAX_FORUMS_PER_HANDLE = 60;
/** Length cap applied to every untrusted string field. */
const MAX_FIELD_LEN = 200;

export interface ScrapedIntelForum {
  forum: string;
  /** Absolute forum-logo URL on the upstream origin, when present. */
  logo_url?: string;
}

export interface ScrapedIntelMatch {
  username: string;
  forum_count: number;
  forums: ScrapedIntelForum[];
}

function cap(s: string): string {
  return s.length > MAX_FIELD_LEN ? s.slice(0, MAX_FIELD_LEN) : s;
}

/**
 * Build an absolute logo URL, but ONLY on the upstream origin. A relative path
 * is resolved against the source; an absolute URL is accepted only if it points
 * at the upstream host, so a poisoned upstream cannot smuggle an off-host URL
 * into our response. (Logos aren't rendered today, but the response is reused.)
 */
function toLogoUrl(logo: unknown): string | undefined {
  if (typeof logo !== 'string' || !logo.trim()) return undefined;
  const v = logo.trim();
  if (/^https?:\/\//i.test(v)) {
    return v.startsWith(`${SCRAPEDINTEL_SOURCE_URL}/`) ? cap(v) : undefined;
  }
  const path = v.startsWith('/') ? v : `/${v}`;
  return `${SCRAPEDINTEL_SOURCE_URL}${cap(path)}`;
}

export interface NormalizedHandles {
  matches: ScrapedIntelMatch[];
  /** True only when the upstream actually had MORE distinct handles than MAX_RESULTS
   *  (some were dropped) — so an exact-MAX_RESULTS payload does not over-report. */
  truncated: boolean;
}

/**
 * Normalize the upstream `/api/search` payload into grouped handle matches.
 * Pure + defensive: tolerates any shape, groups rows (one per username+forum)
 * by case-insensitive handle, dedupes forums, and caps everything.
 */
export function normalizeScrapedIntel(raw: unknown): NormalizedHandles {
  const empty: NormalizedHandles = { matches: [], truncated: false };
  if (!raw || typeof raw !== 'object') return empty;
  const results = (raw as { results?: unknown }).results;
  if (!Array.isArray(results)) return empty;

  // lowercased handle -> { display casing, forum-name -> forum }
  const byHandle = new Map<string, { display: string; forums: Map<string, ScrapedIntelForum> }>();
  let truncated = false;

  for (const row of results) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const username = r.username;
    const forum = r.forum;
    if (typeof username !== 'string' || !username.trim()) continue;
    if (typeof forum !== 'string' || !forum.trim()) continue;

    const lower = username.toLowerCase();
    let entry = byHandle.get(lower);
    if (!entry) {
      if (byHandle.size >= MAX_RESULTS) {
        truncated = true; // a distinct handle was dropped by the cap
        continue;
      }
      entry = { display: cap(username), forums: new Map() };
      byHandle.set(lower, entry);
    }
    const forumName = cap(forum);
    if (!entry.forums.has(forumName) && entry.forums.size < MAX_FORUMS_PER_HANDLE) {
      entry.forums.set(forumName, { forum: forumName, logo_url: toLogoUrl(r.logo) });
    }
  }

  const matches = [...byHandle.values()].map((e) => ({
    username: e.display,
    forum_count: e.forums.size,
    forums: [...e.forums.values()],
  }));
  return { matches, truncated };
}

/**
 * Does the query look like a single handle (vs. a freetext keyword)? Used by the
 * omnibox to decide whether to trigger a live ScrapedIntel lookup. Charset/length
 * only — the dedicated route accepts any 2–80 char query the upstream allows.
 */
export function isHandleShaped(q: string): boolean {
  if (typeof q !== 'string') return false;
  return /^[A-Za-z0-9][A-Za-z0-9_.-]{1,79}$/.test(q);
}

/** KV key for the global per-minute egress counter bounding upstream calls. */
export function budgetWindowKey(nowMs: number): string {
  return `si:budget:${Math.floor(nowMs / 60_000)}`;
}

/** KV key holding the last successful response for a query (graceful fallback). */
export function lastGoodKey(q: string): string {
  return `si:last:${q.trim().toLowerCase()}`;
}

/** Upstream egress ceiling per minute — kept under the source's hard 4/min limit. */
export const EGRESS_BUDGET_PER_MIN = 3;

export interface ScrapedIntelSearchResponse {
  query: string;
  generated_at: string;
  found: boolean;
  total_matches: number;
  truncated: boolean;
  results: ScrapedIntelMatch[];
  source: string;
  source_url: string;
  /** Served from KV last-good because upstream was unavailable / over-budget. */
  stale?: boolean;
  /** Over our egress budget and no last-good available. */
  rate_limited?: boolean;
  /** Human-readable note for error/degraded responses. */
  warning?: string;
}

export interface LookupResult {
  data: ScrapedIntelSearchResponse;
  status: 200 | 429 | 502;
  cacheControl: string;
}

export interface LookupOptions {
  /** Whether a cache miss may trigger a live upstream fetch. A live fetch always
   *  additionally requires KV (to budget egress); without KV we degrade to cache-only. */
  allowLive?: boolean;
  /** Per-call upstream timeout (ms). The omnibox passes a tighter value so a hung
   *  source can't hold the whole fan-out past its deadline. Defaults to UPSTREAM_TIMEOUT_MS. */
  timeoutMs?: number;
  /** Injectable clock for deterministic budget windows in tests. */
  now?: number;
}

const CACHE_TTL_SECONDS = 3600;
const STALE_CACHE_TTL_SECONDS = 300;
const LAST_GOOD_TTL_SECONDS = 7 * 24 * 3600;
const BUDGET_WINDOW_TTL_SECONDS = 120;
const UPSTREAM_TIMEOUT_MS = 8000;

function cacheKeyFor(lower: string): Request {
  return new Request(`https://scrapedintel-cache.internal/v1/${encodeURIComponent(lower)}`);
}

function ok(data: ScrapedIntelSearchResponse, maxAge = CACHE_TTL_SECONDS): LookupResult {
  return { data, status: 200, cacheControl: `public, max-age=${maxAge}` };
}

async function readLastGood(kv: KVNamespace, q: string): Promise<ScrapedIntelSearchResponse | null> {
  try {
    const raw = await kv.get(lastGoodKey(q));
    return raw ? (JSON.parse(raw) as ScrapedIntelSearchResponse) : null;
  } catch {
    return null;
  }
}

/**
 * Resolve a handle to forum appearances, honoring a per-query edge cache, a
 * global per-minute egress budget (so we never exceed the source's 4/min limit),
 * and a KV last-good fallback. Shared by the dedicated route and the omnibox.
 */
export async function lookupHandle(
  q: string,
  env: { KV_CACHE?: KVNamespace },
  opts: LookupOptions = {}
): Promise<LookupResult> {
  const allowLive = opts.allowLive ?? true;
  const now = opts.now ?? Date.now();
  const timeoutMs = opts.timeoutMs ?? UPSTREAM_TIMEOUT_MS;
  const norm = q.trim();
  const lower = norm.toLowerCase();
  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = cacheKeyFor(lower);

  // 1. Per-query Cache-API hit — costs no egress budget.
  try {
    const hit = await cache.match(cacheKey);
    if (hit) return ok((await hit.json()) as ScrapedIntelSearchResponse);
  } catch {
    /* cold cache */
  }

  // A live upstream call REQUIRES KV to coordinate the global egress budget. When the
  // caller forbids live (omnibox intent) OR KV is unbound, degrade to cache-only — never
  // an un-throttled proxy to a 4/min source. (This guard also narrows `kv` below.)
  const kv = env.KV_CACHE;
  if (!allowLive || !kv) return ok(emptyResponse(norm), 60);

  // 2. Global per-minute egress budget. Best-effort: the KV get→put is non-atomic and
  // eventually consistent, so a concurrent burst of distinct (uncached) handles can
  // overshoot by ~the in-flight concurrency (worst-case egress ≈ cap + burst). Cap 3
  // leaves headroom under the source's hard 4/min for the common low-concurrency case;
  // an upstream 429 falls through to last-good (we don't retry it), so overshoot self-heals.
  const bkey = budgetWindowKey(now);
  const used = parseInt((await kv.get(bkey)) ?? '0', 10) || 0;
  if (used >= EGRESS_BUDGET_PER_MIN) {
    const lg = await readLastGood(kv, norm);
    if (lg) return ok({ ...lg, stale: true }, STALE_CACHE_TTL_SECONDS);
    return {
      data: emptyResponse(norm, { rate_limited: true, warning: 'rate limited — try again shortly' }),
      status: 429,
      cacheControl: 'no-store',
    };
  }
  // Reserve a slot before the upstream call.
  await kv.put(bkey, String(used + 1), { expirationTtl: BUDGET_WINDOW_TTL_SECONDS });

  // 3. ONE fetch to the FIXED upstream host (no SSRF surface). Single attempt: a retry
  // would stack timeouts (worst case 2×timeoutMs) and could blow the omnibox's 12s
  // deadline — on failure we fall back to last-good instead. The omnibox passes a tighter
  // timeoutMs so a hung upstream can't hold the whole fan-out open.
  let res: Response | null = null;
  try {
    res = await fetchResilient(
      `${SCRAPEDINTEL_SOURCE_URL}/api/search?q=${encodeURIComponent(norm)}`,
      { headers: { accept: 'application/json', 'user-agent': 'pranithjain-dfir/1.0' } },
      { attempts: 1, timeoutMs }
    );
  } catch {
    res = null;
  }

  if (!res || !res.ok) {
    const lg = await readLastGood(kv, norm);
    if (lg) return ok({ ...lg, stale: true }, STALE_CACHE_TTL_SECONDS);
    return {
      data: emptyResponse(norm, { warning: 'source unavailable' }),
      status: 502,
      cacheControl: 'no-store',
    };
  }

  let raw: unknown = null;
  try {
    raw = await res.json();
  } catch {
    raw = null;
  }
  const { matches: results, truncated } = normalizeScrapedIntel(raw);
  const data: ScrapedIntelSearchResponse = {
    query: norm,
    generated_at: new Date(now).toISOString(),
    found: results.length > 0,
    total_matches: results.length,
    truncated,
    results,
    source: SCRAPEDINTEL_SOURCE,
    source_url: SCRAPEDINTEL_SOURCE_URL,
  };

  // 4. Persist for cheap repeats + graceful degradation (awaited for correctness).
  const body = JSON.stringify(data);
  try {
    await cache.put(
      cacheKey,
      new Response(body, {
        headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${CACHE_TTL_SECONDS}` },
      })
    );
  } catch {
    /* cache write best-effort */
  }
  try {
    await kv.put(lastGoodKey(norm), body, { expirationTtl: LAST_GOOD_TTL_SECONDS });
  } catch {
    /* best-effort */
  }

  return ok(data);
}

function emptyResponse(q: string, extra: Partial<ScrapedIntelSearchResponse> = {}): ScrapedIntelSearchResponse {
  return {
    query: q.trim(),
    generated_at: new Date().toISOString(),
    found: false,
    total_matches: 0,
    truncated: false,
    results: [],
    source: SCRAPEDINTEL_SOURCE,
    source_url: SCRAPEDINTEL_SOURCE_URL,
    ...extra,
  };
}
