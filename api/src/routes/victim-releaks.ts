import type { Context } from 'hono';
import type { Env } from '../env';
import { normalizeVictim } from '../lib/victim-normalize';

/**
 * Victim re-leak detection.
 *
 * Fetches the full per-group post history from Ransomlook for the top-N
 * most-recently-active groups, normalizes victim names, and surfaces
 * victims that appear under 2+ distinct groups. Re-leaks are high-signal:
 *   - usually mean failed double-extortion (group A couldn't monetize, so
 *     the victim hits another group's leak site later)
 *   - or affiliate dispute (RaaS affiliate moves between programs and
 *     re-publishes the same haul)
 *
 * Cached 6h — heavy upstream cost (8 per-group fetches), and re-leaks
 * change on the order of days.
 */

export const VICTIM_RELEAKS_CACHE_KEY = 'https://victim-releaks-cache.internal/v1';
const CACHE_KEY = VICTIM_RELEAKS_CACHE_KEY;
const CACHE_TTL_SECONDS = 6 * 60 * 60;
const FETCH_TIMEOUT_MS = 20_000;
const TOP_GROUPS = 8;
const WINDOW_DAYS = 365; // only consider posts within last 12 months — older matches are stale

interface RansomlookGroupPost {
  post_title?: string;
  discovered?: string;
  description?: string;
  link?: string | null;
}

interface VictimClaim {
  group: string;
  raw_victim: string;
  discovered: string; // ISO
  source_url?: string;
}

interface ReleakRow {
  /** Stable comparison key (lowercased alphanumeric). */
  key: string;
  /** Distinct group count for this victim — sort axis. */
  group_count: number;
  /** Original victim strings observed (deduped). */
  raw_names: string[];
  /** Claims ordered newest-first. */
  claims: VictimClaim[];
  /** Most-recent claim ISO timestamp (sort tiebreaker). */
  latest: string;
}

export interface VictimReleaksResponse {
  generated_at: string;
  window_days: number;
  groups_scanned: number;
  victims_scanned: number;
  releaks: ReleakRow[];
  /** Groups in the "active" list whose per-group fetch failed. */
  warnings: Array<{ slug: string; reason: string }>;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { Accept: 'application/json', 'User-Agent': 'pranithjain.qzz.io DFIR toolkit (free, read-only)' },
      cf: { cacheTtl: 1800, cacheEverything: true },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function toIsoDate(s: string | undefined): string | undefined {
  if (!s) return undefined;
  const cleaned = s.replace(' ', 'T').replace(/\.\d+$/, '') + 'Z';
  const d = new Date(cleaned);
  return Number.isFinite(d.getTime()) ? d.toISOString() : undefined;
}

export async function fetchVictimReleaks(): Promise<VictimReleaksResponse> {
  const recent = await fetchJson<Array<{ group_name?: string }>>('https://www.ransomlook.io/api/recent');
  if (!recent) {
    return {
      generated_at: new Date().toISOString(),
      window_days: WINDOW_DAYS,
      groups_scanned: 0,
      victims_scanned: 0,
      releaks: [],
      warnings: [{ slug: '*', reason: 'ransomlook /api/recent unreachable' }],
    };
  }

  const count = new Map<string, number>();
  for (const e of recent) {
    const g = e.group_name?.trim().toLowerCase();
    if (!g) continue;
    count.set(g, (count.get(g) ?? 0) + 1);
  }
  const topGroups = [...count.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_GROUPS)
    .map(([slug]) => slug);

  // ISO cutoff: only consider claims within WINDOW_DAYS
  const cutoffIso = new Date(Date.now() - WINDOW_DAYS * 86400_000).toISOString();

  const fetches = await Promise.all(
    topGroups.map(async (slug) => {
      const data = await fetchJson<[unknown, RansomlookGroupPost[]]>(
        `https://www.ransomlook.io/api/group/${encodeURIComponent(slug)}`
      );
      return { slug, data };
    })
  );

  const warnings: VictimReleaksResponse['warnings'] = [];
  const byKey = new Map<string, { rawNames: Set<string>; claims: VictimClaim[]; groups: Set<string> }>();
  let victimsScanned = 0;
  let groupsScanned = 0;

  for (const { slug, data } of fetches) {
    if (!data || !Array.isArray(data) || data.length < 2) {
      warnings.push({ slug, reason: 'per-group fetch failed or malformed' });
      continue;
    }
    groupsScanned += 1;
    const posts = data[1];
    if (!Array.isArray(posts)) continue;

    for (const p of posts) {
      const raw = p.post_title?.trim();
      if (!raw) continue;
      const iso = toIsoDate(p.discovered);
      if (!iso || iso < cutoffIso) continue;
      const key = normalizeVictim(raw);
      // Reject keys that are too short to be meaningful (e.g. masked names like "***" → "").
      if (key.length < 3) continue;
      victimsScanned += 1;
      const sourceUrl = p.link ? `https://www.ransomlook.io${p.link.startsWith('/') ? '' : '/'}${p.link}` : undefined;
      const claim: VictimClaim = {
        group: slug,
        raw_victim: raw,
        discovered: iso,
        source_url: sourceUrl,
      };
      const existing = byKey.get(key);
      if (existing) {
        existing.rawNames.add(raw);
        existing.claims.push(claim);
        existing.groups.add(slug);
      } else {
        byKey.set(key, {
          rawNames: new Set([raw]),
          claims: [claim],
          groups: new Set([slug]),
        });
      }
    }
  }

  const releaks: ReleakRow[] = [];
  for (const [key, agg] of byKey) {
    if (agg.groups.size < 2) continue;
    const claims = [...agg.claims].sort((a, b) => b.discovered.localeCompare(a.discovered));
    releaks.push({
      key,
      group_count: agg.groups.size,
      raw_names: [...agg.rawNames],
      claims,
      latest: claims[0]?.discovered ?? '',
    });
  }
  releaks.sort((a, b) => {
    if (b.group_count !== a.group_count) return b.group_count - a.group_count;
    return b.latest.localeCompare(a.latest);
  });

  return {
    generated_at: new Date().toISOString(),
    window_days: WINDOW_DAYS,
    groups_scanned: groupsScanned,
    victims_scanned: victimsScanned,
    releaks,
    warnings,
  };
}

export async function victimReleaksHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const cache = (caches as unknown as { default: Cache }).default;
  const cacheReq = new Request(CACHE_KEY);
  const cached = await cache.match(cacheReq);
  if (cached) return cached;

  const body = await fetchVictimReleaks();
  const cacheable = body.releaks.length > 0 || body.warnings.length > 0;
  const response = new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': cacheable ? `public, max-age=${CACHE_TTL_SECONDS}` : 'no-store',
    },
  });
  if (cacheable) {
    c.executionCtx.waitUntil(cache.put(cacheReq, response.clone()));
  }
  return response;
}
