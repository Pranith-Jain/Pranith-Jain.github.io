import type { Context } from 'hono';
import type { Env } from '../env';

/**
 * .onion leak-site mirror tracker.
 *
 * Pulls per-group profile data from Ransomlook.io and surfaces the
 * canonical Tor mirror URLs for the most-active leak sites. Each
 * Ransomlook profile contains a `locations[]` array with:
 *   - slug         full Tor URL (http://abc...xyz.onion/path)
 *   - fqdn         the bare .onion hostname
 *   - title        last-observed page title (fingerprints "site is down")
 *   - available    Ransomlook's reachability flag at last scrape
 *   - updated      ISO timestamp of the last scrape
 *   - version      Tor address version (3 = current standard)
 *   - chat / fs    leak-site has chat / file-share mirrors
 *
 * We DON'T fetch the .onion sites ourselves (Cloudflare Workers can't
 * route through Tor). We surface the Ransomlook-tracked status so
 * analysts can see which leak sites are currently reachable + their
 * mirror addresses without having to build a Tor client locally.
 *
 * The driver list is the most-recently-active groups from the
 * /api/recent feed — we already proxy that. To keep the request
 * bounded, we cap to the top N groups and fan out per-group fetches
 * with concurrency 4.
 */

const FETCH_TIMEOUT_MS = 12_000;
const CACHE_TTL = 6 * 3600; // 6h — Ransomlook scrapes hourly
// Per-group profile responses can be 1-5 MB each (they include base64
// screenshot bytes). Top-15 keeps the worker subrequest bandwidth
// bounded while covering the most-active groups.
const TOP_N_GROUPS = 15;
const CONCURRENCY = 5;

interface RansomlookLocation {
  slug?: string;
  fqdn?: string;
  title?: string;
  available?: boolean;
  updated?: string;
  version?: number;
  chat?: boolean;
  fs?: boolean;
  private?: boolean;
}

/**
 * The Ransomlook per-group API returns `[{captcha, meta, locations: [...]}]`
 * — an array with a single profile entry that nests the location list.
 * Older docs occasionally describe it as a flat array, hence the
 * defensive parsing below.
 */
interface RansomlookGroupProfile {
  captcha?: boolean;
  meta?: string;
  locations?: RansomlookLocation[];
}

interface RecentEntry {
  group_name?: string;
  discovered?: string;
}

export interface OnionMirror {
  slug: string;
  fqdn: string;
  title?: string;
  available: boolean;
  updated?: string;
  version?: number;
  /** True if Ransomlook flagged this as a chat/negotiation endpoint. */
  is_chat?: boolean;
  /** True if Ransomlook flagged this as a file-share endpoint. */
  is_fs?: boolean;
}

export interface OnionGroup {
  group: string;
  /** Most-recent victim claim across all locations, ISO. */
  last_active?: string;
  /** True if at least one location was reachable at last scrape. */
  any_reachable: boolean;
  mirrors: OnionMirror[];
}

export interface OnionWatchResponse {
  generated_at: string;
  source: string;
  source_url: string;
  groups: OnionGroup[];
  /** Total reachable .onion mirrors across all groups, for the headline stat. */
  reachable_count: number;
  /** Total mirrors observed (reachable + offline). */
  total_count: number;
  warnings: string[];
}

async function fetchJson<T>(url: string): Promise<T | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { accept: 'application/json', 'user-agent': 'pranithjain-dfir/1.0' },
    });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchGroupMirrors(group: string): Promise<RansomlookLocation[]> {
  const data = await fetchJson<RansomlookGroupProfile[] | RansomlookLocation[]>(
    `https://www.ransomlook.io/api/group/${encodeURIComponent(group)}`
  );
  if (!Array.isArray(data) || data.length === 0) return [];
  // Two upstream shapes observed:
  //   [{captcha, meta, locations: [...]}]   ← current
  //   [<location>, <location>, ...]         ← older / fallback
  // Detect by checking whether the first element has a `locations` array.
  const first = data[0] as RansomlookGroupProfile & RansomlookLocation;
  if (Array.isArray(first?.locations)) {
    // Profile shape — flatten locations across all profile entries.
    const out: RansomlookLocation[] = [];
    for (const profile of data as RansomlookGroupProfile[]) {
      if (Array.isArray(profile.locations)) out.push(...profile.locations);
    }
    return out;
  }
  // Flat shape.
  return data as RansomlookLocation[];
}

/**
 * Pure-data fetcher exposed for /api/v1/snapshot. Returns the body or null
 * if the upstream is unreachable (vs the handler which returns a 502 in
 * that case). Snapshot wraps null into its envelope.
 */
export async function fetchOnionWatch(): Promise<OnionWatchResponse | null> {
  const warnings: string[] = [];

  const recent = await fetchJson<RecentEntry[]>('https://www.ransomlook.io/api/recent');
  if (!Array.isArray(recent)) return null;

  const byGroup = new Map<string, string>();
  for (const r of recent) {
    if (!r.group_name) continue;
    const existing = byGroup.get(r.group_name);
    const ts = r.discovered ?? '';
    if (!existing || ts > existing) byGroup.set(r.group_name, ts);
  }
  const groupOrder = [...byGroup.entries()]
    .sort((a, b) => (b[1] || '').localeCompare(a[1] || ''))
    .slice(0, TOP_N_GROUPS)
    .map(([g]) => g);

  const results = new Map<string, RansomlookLocation[]>();
  const queue = [...groupOrder];
  async function worker() {
    while (queue.length > 0) {
      const g = queue.shift();
      if (!g) return;
      const locs = await fetchGroupMirrors(g);
      results.set(g, locs);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const groups: OnionGroup[] = [];
  let reachable = 0;
  let total = 0;
  for (const g of groupOrder) {
    const locs = results.get(g) ?? [];
    if (locs.length === 0) {
      warnings.push(`no profile data for ${g}`);
      continue;
    }
    const mirrors: OnionMirror[] = locs
      .filter((l) => l.fqdn && /\.onion$/i.test(l.fqdn) && !l.private)
      .map((l) => ({
        slug: l.slug ?? `http://${l.fqdn}`,
        fqdn: l.fqdn!,
        title: l.title,
        available: Boolean(l.available),
        updated: l.updated,
        version: l.version,
        is_chat: l.chat,
        is_fs: l.fs,
      }));
    if (mirrors.length === 0) continue;
    const anyReachable = mirrors.some((m) => m.available);
    if (anyReachable) reachable += 1;
    total += mirrors.length;
    groups.push({
      group: g,
      last_active: byGroup.get(g),
      any_reachable: anyReachable,
      mirrors,
    });
  }

  return {
    generated_at: new Date().toISOString(),
    source: 'Ransomlook.io',
    source_url: 'https://www.ransomlook.io',
    groups,
    reachable_count: reachable,
    total_count: total,
    warnings,
  };
}

export async function onionWatchHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const cache = (caches as unknown as { default: Cache }).default;
  // v2: parser bug fix — old v1 cache entries hold the broken empty-groups
  // response. Bump on any breaking response-shape change.
  const cacheKey = new Request('https://onion-watch-cache.internal/v2');
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const body = await fetchOnionWatch();
  if (!body) {
    return c.json({ error: 'ransomlook unreachable', detail: 'failed to fetch /api/recent' }, 502, {
      'cache-control': 'no-store',
    });
  }

  const response = c.json(body, 200, { 'Cache-Control': `public, max-age=${CACHE_TTL}` });
  c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}
