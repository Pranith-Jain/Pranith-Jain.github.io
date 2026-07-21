/**
 * Watchlist + Digests.
 *
 * Actor watchlist with CRUD + sector-filtered weekly digest generation.
 * Piggybacks on the existing Monday cron slot (45 0 * * 1) for digest
 * generation since we're at the 5-cron free-plan cap.
 *
 * Endpoints:
 *   GET  /api/v1/watchlist/actors            — list watched actors
 *   POST /api/v1/watchlist/actors            — add actor to watchlist
 *   DELETE /api/v1/watchlist/actors/:id      — remove actor from watchlist
 *   GET  /api/v1/watchlist/actors/:actor/activity — recent activity for a watched actor
 *   GET  /api/v1/watchlist/digests           — list generated digests
 *   POST /api/v1/watchlist/digest            — generate a digest now
 *   GET  /api/v1/watchlist/digest/:id        — get a specific digest
 */

import type { Context } from 'hono';
import type { Env } from '../env';
import { badRequest, internalError, notFound, serviceUnavailable } from '../lib/api-error';

// ── Helpers ────────────────────────────────────────────────────────────

function generateId(): string {
  return `wl_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
}

const ACTOR_EXAMPLES = ['LockBit', 'BlackCat', 'Lazarus', 'Scattered Spider', 'CL0P', 'APT29', 'Kimsuky', 'PLAY'];

// ── Actor Watchlist CRUD ───────────────────────────────────────────────

/**
 * GET /api/v1/watchlist/actors
 * Returns all active watched actors.
 */
export async function watchlistActorsListHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const db = c.env.BRIEFINGS_DB;
  if (!db) return serviceUnavailable(c, 'database not configured');
  try {
    const rows = await db
      .prepare(
        `SELECT id, actor_name, description, target_sectors, target_regions, active, last_activity, created_at, updated_at
         FROM actor_watchlist
         WHERE active = 1
         ORDER BY last_activity DESC, created_at DESC`
      )
      .all<{
        id: string;
        actor_name: string;
        description: string;
        target_sectors: string;
        target_regions: string;
        active: number;
        last_activity: string;
        created_at: string;
        updated_at: string;
      }>();

    const actors = (rows.results ?? []).map((r) => ({
      ...r,
      target_sectors: JSON.parse(r.target_sectors),
      target_regions: JSON.parse(r.target_regions),
    }));

    return c.json({ actors, suggestions: ACTOR_EXAMPLES });
  } catch (e) {
    console.error('watchlistActorsListHandler failed:', e instanceof Error ? e.message : String(e));
    return internalError(c, e);
  }
}

/**
 * POST /api/v1/watchlist/actors
 * Body: { actor_name: string, description?: string, target_sectors?: string[], target_regions?: string[] }
 */
export async function watchlistActorsAddHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const db = c.env.BRIEFINGS_DB;
  if (!db) return serviceUnavailable(c, 'database not configured');
  try {
    const body = (await c.req.json()) as {
      actor_name?: string;
      description?: string;
      target_sectors?: string[];
      target_regions?: string[];
    };

    const name = body.actor_name?.trim();
    if (!name) return badRequest(c, 'actor_name is required');

    const id = generateId();
    await db
      .prepare(
        `INSERT INTO actor_watchlist (id, actor_name, description, target_sectors, target_regions, updated_at)
         VALUES (?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`
      )
      .bind(
        id,
        name,
        body.description ?? '',
        JSON.stringify(body.target_sectors ?? []),
        JSON.stringify(body.target_regions ?? [])
      )
      .run();

    return c.json({ id, actor_name: name, ok: true }, 201);
  } catch (e) {
    console.error('watchlistActorsAddHandler failed:', e instanceof Error ? e.message : String(e));
    return internalError(c, e);
  }
}

/**
 * DELETE /api/v1/watchlist/actors/:id
 */
export async function watchlistActorsDeleteHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const db = c.env.BRIEFINGS_DB;
  if (!db) return serviceUnavailable(c, 'database not configured');
  try {
    const id = c.req.param('id');
    if (!id) return badRequest(c, 'id required');
    await db.prepare('UPDATE actor_watchlist SET active = 0 WHERE id = ?').bind(id).run();
    return c.json({ ok: true });
  } catch (e) {
    console.error('watchlistActorsDeleteHandler failed:', e instanceof Error ? e.message : String(e));
    return internalError(c, e);
  }
}

// ── Actor Activity ────────────────────────────────────────────────────

/**
 * GET /api/v1/watchlist/actors/:actor/activity
 * Returns recent news/victims for a specific actor.
 * Queries external feeds aggregated in KV.
 */
export async function watchlistActorActivityHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const actor = c.req.param('actor');
  if (!actor) return badRequest(c, 'actor required');

  const kv = c.env.KV_CACHE;
  if (!kv) return serviceUnavailable(c, 'KV cache not available');

  try {
    const [news, victims] = await Promise.all([
      kv.get(`actor:news:${actor}`, 'json').catch(() => null) as Promise<unknown>,
      kv.get(`ransomware:actor:${actor}`, 'json').catch(() => null) as Promise<unknown>,
    ]);

    return c.json({
      actor,
      news: news ?? [],
      victims: victims ?? [],
    });
  } catch (e) {
    console.error('watchlistActorActivityHandler failed:', e instanceof Error ? e.message : String(e));
    return internalError(c, e);
  }
}

// ── Digest generation ──────────────────────────────────────────────────

interface DigestEntry {
  actor: string;
  sector: string;
  activity: string;
  victims: number;
  sources: string[];
}

interface DigestResult {
  id: string;
  period: 'weekly';
  iso_week: string;
  estate_sector: string;
  entries: DigestEntry[];
  generated_at: string;
  error?: string;
}

/**
 * POST /api/v1/watchlist/digest
 * Generate a digest now — sector-filtered, covers all watched actors.
 *
 * This is also called from the Monday cron slot for automated weekly generation.
 */
export async function watchlistDigestGenerateHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const db = c.env.BRIEFINGS_DB;
  if (!db) return serviceUnavailable(c, 'database not configured');

  const kv = c.env.KV_CACHE;
  if (!kv) return serviceUnavailable(c, 'KV cache not available');

  try {
    // Load estate sector
    const estateRow = await db
      .prepare('SELECT sector FROM estate_config WHERE id = ?')
      .bind('default')
      .first<{ sector: string }>();
    const estateSector = estateRow?.sector ?? '';

    // Load watched actors
    const rows = await db
      .prepare(`SELECT id, actor_name, target_sectors FROM actor_watchlist WHERE active = 1 ORDER BY created_at DESC`)
      .all<{ id: string; actor_name: string; target_sectors: string }>();

    const actors = rows.results ?? [];
    const entries: DigestEntry[] = [];

    for (const row of actors) {
      const sectors = JSON.parse(row.target_sectors) as string[];
      const sectorMatch =
        estateSector && sectors.length > 0
          ? sectors.some((s) => s.toLowerCase() === estateSector.toLowerCase())
          : sectors.length === 0; // wildcard match if no sectors specified

      if (!sectorMatch) continue;

      const activity = (await kv.get(`actor:news:${row.actor_name}`, 'json').catch(() => null)) as Array<{
        title: string;
        url: string;
        date: string;
      }> | null;

      const victims = (await kv.get(`ransomware:actor:${row.actor_name}`, 'json').catch(() => null)) as Array<{
        victim: string;
        date: string;
        country: string;
      }> | null;

      entries.push({
        actor: row.actor_name,
        sector: estateSector || 'unknown',
        activity: (activity ?? [])
          .slice(0, 10)
          .map((a) => a.title)
          .join('; '),
        victims: (victims ?? []).length,
        sources: ['actor:news', 'ransomware:actor'],
      });
    }

    // Compute ISO week
    const now = new Date();
    const isoWeek = getIsoWeek(now);

    const digest: DigestResult = {
      id: generateId(),
      period: 'weekly',
      iso_week: isoWeek,
      estate_sector: estateSector,
      entries,
      generated_at: now.toISOString(),
    };

    // Store in KV
    await kv.put(`digest:weekly:${isoWeek}`, JSON.stringify(digest), { expirationTtl: 86400 * 14 }).catch(() => {});

    return c.json({ digest, actor_count: entries.length });
  } catch (e) {
    console.error('handler failed:', e instanceof Error ? e.message : String(e));
    return internalError(c, e);
  }
}

/**
 * GET /api/v1/watchlist/digests — list recent digests.
 */
export async function watchlistDigestsListHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const kv = c.env.KV_CACHE;
  if (!kv) return serviceUnavailable(c, 'KV cache not available');

  try {
    // L1: Cache API (per-colo, free)
    const l1Cached = await caches.default.match(new Request(c.req.url));
    if (l1Cached) return c.json(await l1Cached.json());

    // L2: KV list + per-key get (N+1, but limited to 20 keys)
    const listed = await kv.list<unknown>({ prefix: 'digest:weekly:', limit: 20 });
    const digests = await Promise.all(
      listed.keys.map(async (key) => {
        const val = (await kv.get(key.name, 'json').catch(() => null)) as DigestResult | null;
        return val;
      })
    );

    const result = {
      digests: digests.filter(Boolean).sort((a, b) => b!.generated_at.localeCompare(a!.generated_at)),
    };

    // Shadow-write Cache API
    c.executionCtx.waitUntil(
      caches.default.put(
        new Request(c.req.url),
        new Response(JSON.stringify(result), {
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, s-maxage=600' },
        })
      )
    );

    return c.json(result);
  } catch (e) {
    console.error('watchlistDigestsListHandler failed:', e instanceof Error ? e.message : String(e));
    return internalError(c, e);
  }
}

/**
 * GET /api/v1/watchlist/digest/:id — fetch a specific digest.
 */
export async function watchlistDigestGetHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const id = c.req.param('id');
  if (!id) return badRequest(c, 'id required');

  const kv = c.env.KV_CACHE;
  if (!kv) return serviceUnavailable(c, 'KV cache not available');

  const val = await kv.get(`digest:weekly:${id}`, 'json').catch(() => null);
  if (!val) return notFound(c, 'digest not found');
  return c.json(val);
}

// ── Week helper ──────────────────────────────────────────────────────

function getIsoWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

// ── Cron hook ─────────────────────────────────────────────────────────

/**
 * Called from the Monday weekly briefing cron (scheduled.ts).
 * Generates the weekly watchlist digest if there are watched actors.
 */
export async function runWeeklyWatchlistDigest(db: D1Database, kv: KVNamespace): Promise<void> {
  try {
    const count = await db.prepare('SELECT COUNT(*) as c FROM actor_watchlist WHERE active = 1').first<{ c: number }>();
    if (!count || count.c === 0) {
      console.log('watchlist-digest: no active actors — skip');
      return;
    }

    // Generate the digest by calling the generation logic inline
    const now = new Date();
    const isoWeek = getIsoWeek(now);
    const estateRow = await db
      .prepare('SELECT sector FROM estate_config WHERE id = ?')
      .bind('default')
      .first<{ sector: string }>();
    const estateSector = estateRow?.sector ?? '';

    const rows = await db
      .prepare('SELECT id, actor_name, target_sectors FROM actor_watchlist WHERE active = 1')
      .all<{ id: string; actor_name: string; target_sectors: string }>();

    const entries: DigestEntry[] = [];
    for (const row of rows.results ?? []) {
      const sectors = JSON.parse(row.target_sectors) as string[];
      const sectorMatch =
        estateSector && sectors.length > 0
          ? sectors.some((s) => s.toLowerCase() === estateSector.toLowerCase())
          : sectors.length === 0;

      if (!sectorMatch && estateSector) continue;

      const activity = (await kv.get(`actor:news:${row.actor_name}`, 'json').catch(() => null)) as Array<{
        title: string;
      }> | null;
      const victims = (await kv
        .get(`ransomware:actor:${row.actor_name}`, 'json')
        .catch(() => null)) as Array<unknown> | null;

      entries.push({
        actor: row.actor_name,
        sector: estateSector || 'unknown',
        activity: (activity ?? [])
          .slice(0, 10)
          .map((a) => a.title)
          .join('; '),
        victims: (victims ?? []).length,
        sources: ['actor:news', 'ransomware:actor'],
      });
    }

    const digest: DigestResult = {
      id: generateId(),
      period: 'weekly',
      iso_week: isoWeek,
      estate_sector: estateSector,
      entries,
      generated_at: now.toISOString(),
    };

    await kv.put(`digest:weekly:${isoWeek}`, JSON.stringify(digest), { expirationTtl: 86400 * 14 });
    console.log(`watchlist-digest: generated for week ${isoWeek} (${entries.length} actor entries)`);
  } catch (e) {
    console.error('watchlist-digest: failed', e instanceof Error ? e.message : String(e));
  }
}
