import type { Context } from 'hono';
import type { Env } from '../env';
import type { D1Database } from '@cloudflare/workers-types';

/**
 * IOC Lifecycle Tracker — temporal intelligence for indicators.
 *
 * Tracks when IOCs first appear in feeds, their activity patterns,
 * and decay rates. Enables questions like:
 *   - "Is this IP still active?"
 *   - "When did this domain first appear?"
 *   - "What's the half-life of phishing URLs?"
 *   - "Show me the lifecycle of this IOC"
 *
 * GET  /api/v1/ioc-lifecycle?indicator=<ioc>
 *      Returns lifecycle data for a specific IOC.
 *
 * GET  /api/v1/ioc-lifecycle/trending
 *      Returns IOCs with highest activity in the last 24h.
 *
 * GET  /api/v1/ioc-lifecycle/stats
 *      Returns aggregate lifecycle statistics.
 *
 * Storage: D1 table `ioc_lifecycle` (created via migration).
 * Cached at edge for 5 minutes.
 */

const CACHE_TTL = 300; // 5 minutes
const STALE_THRESHOLD_HOURS = 168; // 7 days

interface IocLifecycleRow {
  indicator: string;
  indicator_type: string;
  first_seen: string;
  last_seen: string;
  peak_score: number;
  current_score: number;
  observation_count: number;
  sources_seen: string; // JSON array
  last_sources: string; // JSON array
  decay_rate: number;
  tags: string; // JSON array
  created_at: string;
  updated_at: string;
}

export interface IocLifecycle {
  indicator: string;
  indicator_type: string;
  first_seen: string;
  last_seen: string;
  peak_score: number;
  current_score: number;
  observation_count: number;
  sources_seen: string[];
  last_sources: string[];
  decay_rate: number;
  tags: string[];
  /** Age in hours since first observation. */
  age_hours: number;
  /** Hours since last observation. */
  last_seen_hours_ago: number;
  /** Activity status based on last observation. */
  status: 'active' | 'declining' | 'dormant' | 'archived';
  /** Trend based on recent observations. */
  trend: 'rising' | 'stable' | 'declining';
}

/**
 * Ensure the ioc_lifecycle table exists. In production this would be a
 * migration, but for edge deployment we create on first access.
 */
async function ensureTable(db: D1Database): Promise<void> {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ioc_lifecycle (
      indicator TEXT PRIMARY KEY,
      indicator_type TEXT NOT NULL,
      first_seen TEXT NOT NULL,
      last_seen TEXT NOT NULL,
      peak_score INTEGER DEFAULT 0,
      current_score INTEGER DEFAULT 0,
      observation_count INTEGER DEFAULT 1,
      sources_seen TEXT DEFAULT '[]',
      last_sources TEXT DEFAULT '[]',
      decay_rate REAL DEFAULT 0.0,
      tags TEXT DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `).run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_ioc_lifecycle_last_seen ON ioc_lifecycle(last_seen)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_ioc_lifecycle_type ON ioc_lifecycle(indicator_type)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_ioc_lifecycle_score ON ioc_lifecycle(peak_score)').run();
}

/**
 * Record an IOC observation. Called from the IOC check handler or
 * feed aggregation pipeline to track lifecycle.
 */
export async function recordIocObservation(
  db: D1Database,
  indicator: string,
  indicatorType: string,
  score: number,
  sources: string[],
  tags: string[] = []
): Promise<void> {
  await ensureTable(db);

  const now = new Date().toISOString();
  const existing = await db
    .prepare('SELECT * FROM ioc_lifecycle WHERE indicator = ?')
    .bind(indicator)
    .first<IocLifecycleRow>();

  if (existing) {
    // Update existing record
    const prevSources: string[] = JSON.parse(existing.sources_seen ?? '[]');
    const allSources = [...new Set([...prevSources, ...sources])];
    const peakScore = Math.max(existing.peak_score, score);

    // Decay rate: exponential moving average of score changes
    const scoreDelta = score - existing.current_score;
    const newDecayRate = existing.decay_rate * 0.8 + scoreDelta * 0.2;

    const prevTags: string[] = JSON.parse(existing.tags ?? '[]');
    const allTags = [...new Set([...prevTags, ...tags])];

    await db
      .prepare(
        `UPDATE ioc_lifecycle SET
          last_seen = ?,
          peak_score = ?,
          current_score = ?,
          observation_count = observation_count + 1,
          sources_seen = ?,
          last_sources = ?,
          decay_rate = ?,
          tags = ?,
          updated_at = ?
        WHERE indicator = ?`
      )
      .bind(
        now,
        peakScore,
        score,
        JSON.stringify(allSources.slice(0, 50)),
        JSON.stringify(sources),
        newDecayRate,
        JSON.stringify(allTags.slice(0, 20)),
        now,
        indicator
      )
      .run();
  } else {
    // Insert new record
    await db
      .prepare(
        `INSERT INTO ioc_lifecycle (
          indicator, indicator_type, first_seen, last_seen,
          peak_score, current_score, observation_count,
          sources_seen, last_sources, decay_rate, tags,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        indicator,
        indicatorType,
        now,
        now,
        score,
        score,
        1,
        JSON.stringify(sources),
        JSON.stringify(sources),
        0.0,
        JSON.stringify(tags),
        now,
        now
      )
      .run();
  }
}

/** Convert a DB row to the API response format. */
function rowToLifecycle(row: IocLifecycleRow): IocLifecycle {
  const firstSeen = new Date(row.first_seen);
  const lastSeen = new Date(row.last_seen);
  const now = new Date();

  const ageHours = Math.floor((now.getTime() - firstSeen.getTime()) / (1000 * 60 * 60));
  const lastSeenHoursAgo = Math.floor((now.getTime() - lastSeen.getTime()) / (1000 * 60 * 60));

  // Determine activity status
  let status: IocLifecycle['status'];
  if (lastSeenHoursAgo < 24) status = 'active';
  else if (lastSeenHoursAgo < 72) status = 'declining';
  else if (lastSeenHoursAgo < STALE_THRESHOLD_HOURS) status = 'dormant';
  else status = 'archived';

  // Determine trend based on decay rate
  let trend: IocLifecycle['trend'];
  if (row.decay_rate > 5) trend = 'rising';
  else if (row.decay_rate < -5) trend = 'declining';
  else trend = 'stable';

  // Safe JSON parse helper for database fields that may contain malformed data
  const safeJsonArray = (val: unknown): string[] => {
    if (Array.isArray(val)) return val as string[];
    if (typeof val !== 'string') return [];
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  return {
    indicator: row.indicator,
    indicator_type: row.indicator_type,
    first_seen: row.first_seen,
    last_seen: row.last_seen,
    peak_score: row.peak_score,
    current_score: row.current_score,
    observation_count: row.observation_count,
    sources_seen: safeJsonArray(row.sources_seen),
    last_sources: safeJsonArray(row.last_sources),
    decay_rate: row.decay_rate,
    tags: safeJsonArray(row.tags),
    age_hours: ageHours,
    last_seen_hours_ago: lastSeenHoursAgo,
    status,
    trend,
  };
}

/** GET /api/v1/ioc-lifecycle?indicator=<ioc> */
export async function iocLifecycleHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const indicator = c.req.query('indicator');
  if (!indicator) return c.json({ error: 'missing indicator' }, 400);

  const db = c.env.BRIEFINGS_DB;
  if (!db) return c.json({ error: 'database not configured' }, 503);

  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(`https://ioc-lifecycle-cache.internal/v1?indicator=${encodeURIComponent(indicator)}`);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  await ensureTable(db);

  const row = await db
    .prepare('SELECT * FROM ioc_lifecycle WHERE indicator = ?')
    .bind(indicator)
    .first<IocLifecycleRow>();

  if (!row) {
    return c.json({
      indicator,
      found: false,
      message: 'IOC not tracked in lifecycle database',
    }, 200, { 'Cache-Control': `public, max-age=${CACHE_TTL}` });
  }

  const lifecycle = rowToLifecycle(row);
  const response = c.json({ found: true, lifecycle }, 200, {
    'Cache-Control': `public, max-age=${CACHE_TTL}`,
  });

  // clone() creates a copy for caching while preserving the original for the client.
  // This is safe because clone() produces an independent response with its own body stream.
  c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

/** GET /api/v1/ioc-lifecycle/trending */
export async function iocLifecycleTrendingHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const db = c.env.BRIEFINGS_DB;
  if (!db) return c.json({ error: 'database not configured' }, 503);

  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request('https://ioc-lifecycle-cache.internal/v1/trending');
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  await ensureTable(db);

  const VALID_TYPES = ['ipv4', 'ipv6', 'domain', 'url', 'hash', 'email'];
  const rawLimit = parseInt(c.req.query('limit') ?? '50', 10);
  const limit = Math.max(1, Math.min(isNaN(rawLimit) ? 50 : rawLimit, 200));
  const type = c.req.query('type');
  const validatedType = type && VALID_TYPES.includes(type) ? type : null;

  let query = `
    SELECT * FROM ioc_lifecycle
    WHERE last_seen > datetime('now', '-24 hours')
  `;
  const params: unknown[] = [];

  if (validatedType) {
    query += ' AND indicator_type = ?';
    params.push(validatedType);
  }

  query += ' ORDER BY observation_count DESC, peak_score DESC LIMIT ?';
  params.push(limit);

  const rows = await db.prepare(query).bind(...params).all<IocLifecycleRow>();
  const trending = rows.results?.map(rowToLifecycle) ?? [];

  const response = c.json({ trending, count: trending.length }, 200, {
    'Cache-Control': `public, max-age=${CACHE_TTL}`,
  });

  c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

/** GET /api/v1/ioc-lifecycle/stats */
export async function iocLifecycleStatsHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const db = c.env.BRIEFINGS_DB;
  if (!db) return c.json({ error: 'database not configured' }, 503);

  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request('https://ioc-lifecycle-cache.internal/v1/stats');
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  await ensureTable(db);

  const stats = await db
    .prepare(
      `SELECT
        COUNT(*) as total_iocs,
        COUNT(CASE WHEN last_seen > datetime('now', '-24 hours') THEN 1 END) as active_24h,
        COUNT(CASE WHEN last_seen > datetime('now', '-7 days') THEN 1 END) as active_7d,
        COUNT(CASE WHEN indicator_type = 'ipv4' THEN 1 END) as ipv4_count,
        COUNT(CASE WHEN indicator_type = 'domain' THEN 1 END) as domain_count,
        COUNT(CASE WHEN indicator_type = 'url' THEN 1 END) as url_count,
        COUNT(CASE WHEN indicator_type = 'hash' THEN 1 END) as hash_count,
        AVG(observation_count) as avg_observations,
        AVG(decay_rate) as avg_decay_rate,
        MAX(peak_score) as max_score,
        MIN(first_seen) as earliest_seen
      FROM ioc_lifecycle`
    )
    .first<{
      total_iocs: number;
      active_24h: number;
      active_7d: number;
      ipv4_count: number;
      domain_count: number;
      url_count: number;
      hash_count: number;
      avg_observations: number;
      avg_decay_rate: number;
      max_score: number;
      earliest_seen: string;
    }>();

  const response = c.json(
    {
      stats: stats ?? {
        total_iocs: 0,
        active_24h: 0,
        active_7d: 0,
        ipv4_count: 0,
        domain_count: 0,
        url_count: 0,
        hash_count: 0,
        avg_observations: 0,
        avg_decay_rate: 0,
        max_score: 0,
        earliest_seen: null,
      },
      generated_at: new Date().toISOString(),
    },
    200,
    { 'Cache-Control': `public, max-age=${CACHE_TTL}` }
  );

  c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}
