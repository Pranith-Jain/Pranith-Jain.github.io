import type { Context } from 'hono';
import type { Env } from '../env';
import { mitreGroupRef, type MitreGroupRef } from '../lib/ransomware-mitre-groups';
import { techniquesForGroup, type Technique } from '../lib/ransomware-group-techniques';

/**
 * Actor activity timeline.
 *
 * For each of the top-N most-active ransomware groups (by recent post count),
 * fetches Ransomlook's per-group endpoint to get the full leak history. We
 * date-filter to the last `WINDOW_DAYS` days and bucket by day, producing a
 * Gantt-style data structure: rows = groups, columns = days, values = post
 * counts.
 *
 * Joined with the curated MITRE Group lookup (lib/ransomware-mitre-groups.ts)
 * so analysts can pivot from "who's active" to "what TTPs to hunt for."
 *
 * Cache 4h — the per-group fetches are heavy, and this view is decision-
 * support, not real-time alerting.
 */

export const ACTOR_TIMELINE_CACHE_KEY = 'https://actor-timeline-cache.internal/v2-ttps';
const CACHE_KEY = ACTOR_TIMELINE_CACHE_KEY;
const CACHE_TTL_SECONDS = 4 * 60 * 60;
const FETCH_TIMEOUT_MS = 20_000;
const TOP_GROUPS = 8;
const WINDOW_DAYS = 30;

interface RansomlookGroupMeta {
  meta?: string;
  raas?: boolean;
  profile?: string[];
  locations?: Array<{ slug?: string; available?: boolean }>;
}

interface RansomlookGroupPost {
  post_title?: string;
  discovered?: string;
  description?: string;
}

interface ActorBucket {
  /** ISO date YYYY-MM-DD */
  day: string;
  count: number;
}

interface ActorRow {
  slug: string;
  /** Display name (Title Case of slug) for the timeline row. */
  display_name: string;
  /** Total posts in the WINDOW_DAYS window. */
  posts_in_window: number;
  /** Total post count across all history Ransomlook has. */
  all_time_count: number;
  /** Daily activity bucket — array length === WINDOW_DAYS, indexed by days-ago descending (so [0] = oldest, [last] = today). */
  buckets: ActorBucket[];
  /** Short description (first 400 chars of Ransomlook's `meta`). */
  description?: string;
  /** True if this group operates as Ransomware-as-a-Service. */
  raas?: boolean;
  /** Analyst writeups Ransomlook has indexed for this group. */
  references: string[];
  /** Number of leak-site mirrors currently reachable (from Ransomlook). */
  mirrors_reachable: number;
  mirrors_total: number;
  /** MITRE ATT&CK Group reference (null when this group isn't in MITRE). */
  mitre?: MitreGroupRef;
  /**
   * True when the per-group ransomlook endpoint was unreachable and this row
   * was reconstructed from the already-fetched /api/recent feed. The heatmap
   * is still accurate for the window, but all-time count, mirrors, RaaS tag,
   * description and references are unavailable for this group.
   */
  partial?: boolean;
}

interface AggregateTechnique extends Technique {
  /** Number of active groups that use this technique. */
  used_by_count: number;
  /** Slugs of the active groups using this technique. */
  used_by_groups: string[];
  /** Sum of recent-window posts across those groups — a rough "exposure weight". */
  weighted_activity: number;
}

export interface ActorTimelineResponse {
  generated_at: string;
  window_days: number;
  /** Days the timeline x-axis spans, oldest → newest. */
  days: string[];
  groups: ActorRow[];
  /**
   * Cross-actor TTP aggregation: each entry is a MITRE technique used by 1+
   * active groups, sorted by group-count desc. Provides the "what should I
   * tune detections for, given who's posting right now?" pivot.
   */
  aggregate_techniques: AggregateTechnique[];
  /** Number of active groups for which we have curated MITRE technique data. */
  groups_with_ttp_data: number;
  /** Groups in the "recent claims" list but skipped because their per-group fetch failed. */
  warnings: Array<{ slug: string; reason: string }>;
}

function toIsoDate(s: string | undefined): string | undefined {
  if (!s) return undefined;
  const cleaned = s.replace(' ', 'T').replace(/\.\d+$/, '') + 'Z';
  const d = new Date(cleaned);
  return Number.isFinite(d.getTime()) ? d.toISOString() : undefined;
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function titleCase(slug: string): string {
  return slug
    .split(/[\s-_]+/)
    .map((w) => (w.length > 0 ? (w[0] ?? '').toUpperCase() + w.slice(1) : w))
    .join(' ');
}

async function fetchJson<T>(url: string): Promise<T | null> {
  // ransomlook.io is flaky from the shared Worker egress IP — a single
  // attempt produced a "per-group endpoint unreachable" warning for most
  // groups on every build. Retry twice with a short backoff: most groups
  // now resolve on attempt 2, eliminating the warning noise.
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 500 * attempt));
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(attempt === 0 ? 9_000 : FETCH_TIMEOUT_MS),
        headers: { Accept: 'application/json', 'User-Agent': 'pranithjain.qzz.io DFIR toolkit (free, read-only)' },
        cf: { cacheTtl: 1800, cacheEverything: true },
      });
      if (res.ok) return (await res.json()) as T;
      if (res.status !== 429 && res.status < 500) return null; // 4xx (not 429) won't change
    } catch {
      /* timeout / network — retry */
    }
  }
  return null;
}

/** Build the timeline x-axis: oldest day at index 0, today at index WINDOW_DAYS-1. */
function buildDayAxis(): string[] {
  const out: string[] = [];
  const today = new Date();
  for (let i = WINDOW_DAYS - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export async function fetchActorTimeline(): Promise<ActorTimelineResponse> {
  // Step 1: get the "recent claims" payload (already cached) so we know
  // which groups are currently active — only fetch per-group data for those.
  const recent = await fetchJson<Array<{ post_title?: string; group_name?: string; discovered?: string }>>(
    'https://www.ransomlook.io/api/recent'
  );

  const days = buildDayAxis();
  const dayIndex = new Map(days.map((d, i) => [d, i] as const));
  const windowStart = days[0] ?? '';

  if (!recent) {
    return {
      generated_at: new Date().toISOString(),
      window_days: WINDOW_DAYS,
      days,
      groups: [],
      aggregate_techniques: [],
      groups_with_ttp_data: 0,
      warnings: [{ slug: '*', reason: 'ransomlook /api/recent unreachable' }],
    };
  }

  // Rank groups by recent claim count, and — in the same pass — bucket each
  // group's in-window post days straight from /api/recent. This second map is
  // the fallback source: when ransomlook's flaky per-group endpoint fails for
  // a group, we rebuild its heatmap row from data we already hold instead of
  // emitting a "per-group fetch warning". Every group in topGroups is, by
  // construction, present here with ≥1 post, so the fallback is always viable.
  const groupRecentCount = new Map<string, number>();
  const recentDaysByGroup = new Map<string, string[]>();
  for (const e of recent) {
    const g = e.group_name?.trim().toLowerCase();
    if (!g) continue;
    groupRecentCount.set(g, (groupRecentCount.get(g) ?? 0) + 1);
    const iso = toIsoDate(e.discovered);
    if (!iso) continue;
    const k = dayKey(iso);
    if (k < windowStart || !dayIndex.has(k)) continue;
    const arr = recentDaysByGroup.get(g);
    if (arr) arr.push(k);
    else recentDaysByGroup.set(g, [k]);
  }
  const topGroups = [...groupRecentCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_GROUPS)
    .map(([slug]) => slug);

  // Step 2: fetch each top group's per-group payload in parallel
  const perGroupResults = await Promise.all(
    topGroups.map(async (slug) => {
      const data = await fetchJson<[RansomlookGroupMeta, RansomlookGroupPost[]]>(
        `https://www.ransomlook.io/api/group/${encodeURIComponent(slug)}`
      );
      return { slug, data };
    })
  );

  const warnings: ActorTimelineResponse['warnings'] = [];
  const rows: ActorRow[] = [];

  for (const { slug, data } of perGroupResults) {
    if (!data || !Array.isArray(data) || data.length < 2) {
      // Per-group endpoint unreachable — reconstruct a partial row from the
      // /api/recent feed we already have. No warning: the heatmap (the point
      // of this view) is still accurate for the window; only the secondary
      // metadata (all-time count, mirrors, RaaS, refs) is unavailable.
      const recentDays = recentDaysByGroup.get(slug) ?? [];
      if (recentDays.length === 0) continue; // nothing to show; skip silently
      const fbBuckets: ActorBucket[] = days.map((day) => ({ day, count: 0 }));
      for (const k of recentDays) {
        const idx = dayIndex.get(k);
        if (idx !== undefined) fbBuckets[idx]!.count += 1;
      }
      const fbMitre = mitreGroupRef(slug);
      rows.push({
        slug,
        display_name: titleCase(slug),
        posts_in_window: recentDays.length,
        all_time_count: recentDays.length, // window floor; full history unavailable
        buckets: fbBuckets,
        raas: false,
        references: [],
        mirrors_reachable: 0,
        mirrors_total: 0,
        mitre: fbMitre ?? undefined,
        partial: true,
      });
      continue;
    }
    const [meta, posts] = data;
    const buckets: ActorBucket[] = days.map((day) => ({ day, count: 0 }));
    let postsInWindow = 0;

    for (const p of posts) {
      const iso = toIsoDate(p.discovered);
      if (!iso) continue;
      const k = dayKey(iso);
      if (k < windowStart) continue;
      const idx = dayIndex.get(k);
      if (idx === undefined) continue;
      buckets[idx]!.count += 1;
      postsInWindow += 1;
    }

    const locations = Array.isArray(meta.locations) ? meta.locations : [];
    const mirrors_total = locations.length;
    const mirrors_reachable = locations.filter((l) => l && l.available === true).length;

    const display_name = titleCase(slug);
    const mitre = mitreGroupRef(slug);

    rows.push({
      slug,
      display_name,
      posts_in_window: postsInWindow,
      all_time_count: posts.length,
      buckets,
      description: meta.meta ? meta.meta.trim().slice(0, 400) : undefined,
      raas: meta.raas === true,
      references: Array.isArray(meta.profile) ? meta.profile.filter((s): s is string => typeof s === 'string') : [],
      mirrors_reachable,
      mirrors_total,
      mitre: mitre ?? undefined,
    });
  }

  // No per-group warnings: failed lookups are transparently backfilled from
  // /api/recent above. The only remaining warning case is the whole
  // /api/recent feed being unreachable, handled in the early-return above.

  // Sort by activity in window desc, then all-time count
  rows.sort((a, b) => {
    if (b.posts_in_window !== a.posts_in_window) return b.posts_in_window - a.posts_in_window;
    return b.all_time_count - a.all_time_count;
  });

  // Aggregate MITRE techniques across active groups. Only groups with a
  // curated MITRE entry contribute; the rest go in the "unmapped" count so
  // the UI can be honest about coverage.
  const techMap = new Map<string, { tech: Technique; groups: Set<string>; weighted: number }>();
  let groupsWithTtpData = 0;
  for (const row of rows) {
    if (!row.mitre) continue;
    const techs = techniquesForGroup(row.mitre.id);
    if (techs.length === 0) continue;
    groupsWithTtpData++;
    for (const t of techs) {
      const existing = techMap.get(t.id);
      if (existing) {
        existing.groups.add(row.slug);
        existing.weighted += row.posts_in_window;
      } else {
        techMap.set(t.id, {
          tech: t,
          groups: new Set([row.slug]),
          weighted: row.posts_in_window,
        });
      }
    }
  }
  const aggregate_techniques: AggregateTechnique[] = [...techMap.values()]
    .map(({ tech, groups, weighted }) => ({
      ...tech,
      used_by_count: groups.size,
      used_by_groups: [...groups],
      weighted_activity: weighted,
    }))
    .sort((a, b) => {
      if (b.used_by_count !== a.used_by_count) return b.used_by_count - a.used_by_count;
      return b.weighted_activity - a.weighted_activity;
    });

  return {
    generated_at: new Date().toISOString(),
    window_days: WINDOW_DAYS,
    days,
    groups: rows,
    aggregate_techniques,
    groups_with_ttp_data: groupsWithTtpData,
    warnings,
  };
}

export async function actorTimelineHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const cache = (caches as unknown as { default: Cache }).default;
  const cacheReq = new Request(CACHE_KEY);
  const cached = await cache.match(cacheReq);
  if (cached) return cached;

  const body = await fetchActorTimeline();

  // If we got no rows AND no warnings, treat as transient — don't poison cache.
  const cacheable = body.groups.length > 0 || body.warnings.length > 0;
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
