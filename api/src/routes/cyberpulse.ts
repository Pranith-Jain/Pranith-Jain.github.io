/**
 * CyberPulse — API routes for breach/leak incident data.
 *
 * GET /api/v1/cyberpulse/incidents    — list incidents with filters
 * GET /api/v1/cyberpulse/stats        — aggregate statistics
 * GET /api/v1/cyberpulse/trending     — trending actors/victims
 * GET /api/v1/cyberpulse/scan-log     — ingestion health
 * GET /api/v1/cyberpulse/ingest       — trigger manual ingestion (admin only)
 */
import type { Context } from 'hono';
import type { Env } from '../env';
import { requireAdmin } from '../lib/admin-auth';
import { runCyberPulseIngestion } from './cyberpulse-ingest';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

// ─── GET /api/v1/cyberpulse/incidents ──────────────────────────────────────

export async function cyberpulseIncidentsHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const env = c.env as unknown as Record<string, unknown>;
  const db = env.BRIEFINGS_DB as import('@cloudflare/workers-types').D1Database | undefined;
  if (!db) return c.json({ error: 'database not configured' }, 503);

  const url = new URL(c.req.url);
  const type = url.searchParams.get('type');
  const severity = url.searchParams.get('severity');
  const platform = url.searchParams.get('platform');
  const sector = url.searchParams.get('sector');
  const actor = url.searchParams.get('actor');
  const victim = url.searchParams.get('victim');
  const country = url.searchParams.get('country');
  const search = url.searchParams.get('q');
  const daysBack = Math.min(90, Math.max(1, Number(url.searchParams.get('days') ?? '7')));
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(url.searchParams.get('limit') ?? String(DEFAULT_LIMIT))));
  const offset = Math.max(0, Number(url.searchParams.get('offset') ?? '0'));

  const conditions: string[] = [];
  const binds: unknown[] = [];

  const cutoff = new Date(Date.now() - daysBack * 86_400_000).toISOString();
  conditions.push('discovered_at > ?');
  binds.push(cutoff);

  if (type) {
    conditions.push('incident_type = ?');
    binds.push(type);
  }
  if (severity) {
    conditions.push('severity = ?');
    binds.push(severity);
  }
  if (platform) {
    conditions.push('source_platform = ?');
    binds.push(platform);
  }
  if (sector) {
    conditions.push('victim_sector = ?');
    binds.push(sector);
  }
  if (actor) {
    conditions.push('LOWER(threat_actor) LIKE ?');
    binds.push(`%${actor.toLowerCase()}%`);
  }
  if (victim) {
    conditions.push('LOWER(victim_name) LIKE ?');
    binds.push(`%${victim.toLowerCase()}%`);
  }
  if (country) {
    conditions.push('victim_country = ?');
    binds.push(country.toUpperCase());
  }
  if (search) {
    conditions.push('(LOWER(title) LIKE ? OR LOWER(description) LIKE ? OR LOWER(victim_name) LIKE ?)');
    const needle = `%${search.toLowerCase()}%`;
    binds.push(needle, needle, needle);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await db
    .prepare(`SELECT COUNT(*) as total FROM cyberpulse_incidents ${where}`)
    .bind(...binds)
    .first<{ total: number }>();
  const total = countResult?.total ?? 0;

  const { results } = await db
    .prepare(`SELECT * FROM cyberpulse_incidents ${where} ORDER BY discovered_at DESC LIMIT ? OFFSET ?`)
    .bind(...binds, limit, offset)
    .all();

  return c.json({
    total,
    limit,
    offset,
    has_more: offset + limit < total,
    incidents: results,
  });
}

// ─── GET /api/v1/cyberpulse/stats ──────────────────────────────────────────

export async function cyberpulseStatsHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const env = c.env as unknown as Record<string, unknown>;
  const db = env.BRIEFINGS_DB as import('@cloudflare/workers-types').D1Database | undefined;
  if (!db) return c.json({ error: 'database not configured' }, 503);

  const url = new URL(c.req.url);
  const daysBack = Math.min(90, Math.max(1, Number(url.searchParams.get('days') ?? '30')));
  const cutoff = new Date(Date.now() - daysBack * 86_400_000).toISOString();

  const [total, byType, bySeverity, byPlatform, bySector, byCountry, dailyTrend, topActors, topVictims] =
    await Promise.all([
      db
        .prepare('SELECT COUNT(*) as total FROM cyberpulse_incidents WHERE discovered_at > ?')
        .bind(cutoff)
        .first<{ total: number }>(),
      db
        .prepare(
          'SELECT incident_type, COUNT(*) as count FROM cyberpulse_incidents WHERE discovered_at > ? GROUP BY incident_type ORDER BY count DESC'
        )
        .bind(cutoff)
        .all(),
      db
        .prepare(
          'SELECT severity, COUNT(*) as count FROM cyberpulse_incidents WHERE discovered_at > ? GROUP BY severity ORDER BY count DESC'
        )
        .bind(cutoff)
        .all(),
      db
        .prepare(
          'SELECT source_platform, COUNT(*) as count FROM cyberpulse_incidents WHERE discovered_at > ? GROUP BY source_platform ORDER BY count DESC'
        )
        .bind(cutoff)
        .all(),
      db
        .prepare(
          'SELECT victim_sector, COUNT(*) as count FROM cyberpulse_incidents WHERE discovered_at > ? AND victim_sector IS NOT NULL GROUP BY victim_sector ORDER BY count DESC'
        )
        .bind(cutoff)
        .all(),
      db
        .prepare(
          'SELECT victim_country, COUNT(*) as count FROM cyberpulse_incidents WHERE discovered_at > ? AND victim_country IS NOT NULL GROUP BY victim_country ORDER BY count DESC'
        )
        .bind(cutoff)
        .all(),
      db
        .prepare(
          `SELECT DATE(discovered_at) as day, COUNT(*) as count
      FROM cyberpulse_incidents WHERE discovered_at > ?
      GROUP BY DATE(discovered_at) ORDER BY day`
        )
        .bind(cutoff)
        .all(),
      db
        .prepare(
          `SELECT threat_actor, COUNT(*) as count
      FROM cyberpulse_incidents WHERE discovered_at > ? AND threat_actor IS NOT NULL
      GROUP BY threat_actor ORDER BY count DESC LIMIT 10`
        )
        .bind(cutoff)
        .all(),
      db
        .prepare(
          `SELECT victim_name, COUNT(*) as count
      FROM cyberpulse_incidents WHERE discovered_at > ? AND victim_name IS NOT NULL
      GROUP BY victim_name ORDER BY count DESC LIMIT 10`
        )
        .bind(cutoff)
        .all(),
    ]);

  return c.json({
    period_days: daysBack,
    total: total?.total ?? 0,
    by_type: byType.results,
    by_severity: bySeverity.results,
    by_platform: byPlatform.results,
    by_sector: bySector.results,
    by_country: byCountry.results,
    daily_trend: dailyTrend.results,
    top_actors: topActors.results,
    top_victims: topVictims.results,
  });
}

// ─── GET /api/v1/cyberpulse/trending ───────────────────────────────────────

export async function cyberpulseTrendingHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const env = c.env as unknown as Record<string, unknown>;
  const db = env.BRIEFINGS_DB as import('@cloudflare/workers-types').D1Database | undefined;
  if (!db) return c.json({ error: 'database not configured' }, 503);

  // Trending = actors/victims with the most incidents in the last 7 days
  // that weren't present (or had fewer) in the prior 7 days
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const twoWeeksAgo = new Date(Date.now() - 14 * 86_400_000).toISOString();

  const [thisWeekActors, lastWeekActors, thisWeekVictims, lastWeekVictims] = await Promise.all([
    db
      .prepare(
        'SELECT threat_actor, COUNT(*) as count FROM cyberpulse_incidents WHERE discovered_at > ? AND threat_actor IS NOT NULL GROUP BY threat_actor'
      )
      .bind(weekAgo)
      .all(),
    db
      .prepare(
        'SELECT threat_actor, COUNT(*) as count FROM cyberpulse_incidents WHERE discovered_at > ? AND discovered_at <= ? AND threat_actor IS NOT NULL GROUP BY threat_actor'
      )
      .bind(twoWeeksAgo, weekAgo)
      .all(),
    db
      .prepare(
        'SELECT victim_name, COUNT(*) as count FROM cyberpulse_incidents WHERE discovered_at > ? AND victim_name IS NOT NULL GROUP BY victim_name'
      )
      .bind(weekAgo)
      .all(),
    db
      .prepare(
        'SELECT victim_name, COUNT(*) as count FROM cyberpulse_incidents WHERE discovered_at > ? AND discovered_at <= ? AND victim_name IS NOT NULL GROUP BY victim_name'
      )
      .bind(twoWeeksAgo, weekAgo)
      .all(),
  ]);

  const lastActorMap = new Map(
    (lastWeekActors.results as { threat_actor: string; count: number }[]).map((r) => [r.threat_actor, r.count])
  );
  const lastVictimMap = new Map(
    (lastWeekVictims.results as { victim_name: string; count: number }[]).map((r) => [r.victim_name, r.count])
  );

  const trendingActors = (thisWeekActors.results as { threat_actor: string; count: number }[])
    .map((r) => ({
      name: r.threat_actor,
      this_week: r.count,
      last_week: lastActorMap.get(r.threat_actor) ?? 0,
      delta: r.count - (lastActorMap.get(r.threat_actor) ?? 0),
    }))
    .filter((r) => r.delta > 0 || r.this_week >= 3)
    .sort((a, b) => b.delta - a.delta || b.this_week - a.this_week)
    .slice(0, 10);

  const trendingVictims = (thisWeekVictims.results as { victim_name: string; count: number }[])
    .map((r) => ({
      name: r.victim_name,
      this_week: r.count,
      last_week: lastVictimMap.get(r.victim_name) ?? 0,
      delta: r.count - (lastVictimMap.get(r.victim_name) ?? 0),
    }))
    .filter((r) => r.delta > 0)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 10);

  return c.json({ trending_actors: trendingActors, trending_victims: trendingVictims });
}

// ─── GET /api/v1/cyberpulse/scan-log ───────────────────────────────────────

export async function cyberpulseScanLogHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const env = c.env as unknown as Record<string, unknown>;
  const db = env.BRIEFINGS_DB as import('@cloudflare/workers-types').D1Database | undefined;
  if (!db) return c.json({ error: 'database not configured' }, 503);

  const limit = Math.min(100, Math.max(1, Number(new URL(c.req.url).searchParams.get('limit') ?? '20')));

  const { results } = await db
    .prepare('SELECT * FROM cyberpulse_scan_log ORDER BY scanned_at DESC LIMIT ?')
    .bind(limit)
    .all();

  return c.json({ scans: results });
}

// ─── GET /api/v1/cyberpulse/ingest ─────────────────────────────────────────

export async function cyberpulseIngestHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const adminCheck = requireAdmin(c);
  if ('error' in adminCheck) return adminCheck.error;

  const db = (c.env as unknown as Record<string, unknown>).BRIEFINGS_DB as
    | import('@cloudflare/workers-types').D1Database
    | undefined;
  if (!db) return c.json({ error: 'database not configured' }, 503);

  const start = Date.now();
  try {
    const results = await runCyberPulseIngestion(c.env, db);
    return c.json({
      ok: true,
      duration_ms: Date.now() - start,
      results,
    });
  } catch (e) {
    return c.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
}
