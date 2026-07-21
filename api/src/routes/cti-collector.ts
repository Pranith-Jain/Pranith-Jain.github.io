/**
 * CTI Collector API routes
 *
 * /api/v1/cti/collect   — POST: trigger full IOC + news collection
 * /api/v1/cti/stats     — GET:  IOC statistics and breakdown
 * /api/v1/cti/iocs      — GET:  list collected IOCs (paginated, filtered)
 * /api/v1/cti/news      — GET:  recent news articles
 * /api/v1/cti/predictions — GET/POST: AI-generated attack predictions
 * /api/v1/cti/mutate    — POST: parse seed attack + generate mutation variants
 * /api/v1/cti/mutations — GET:  list mutations (seeds + top variants)
 * /api/v1/cti/decay     — POST: manually trigger decay scoring
 */

import type { Context } from 'hono';
import type { Env } from '../env';
import { runFullCollection, getIocStats, applyDecayScoring, sweepStaleData } from '../lib/cti-collector';
import { generatePredictions, getRecentPredictions } from '../lib/cti-prediction';
import {
  parseSeedAttack,
  generateVariants,
  getSeeds,
  getVariantsForSeed,
  getTopVariants,
  getMutationStats,
} from '../lib/cti-mutation';

// ── Collection ─────────────────────────────────────────────────────────

export async function ctiCollectHandler(c: Context<{ Bindings: Env }>) {
  const db = c.env.BRIEFINGS_DB;
  if (!db) return c.json({ error: 'database unavailable' }, 503);
  const result = await runFullCollection(db, c.env.ABUSECH_AUTH_KEY);
  return c.json(result);
}

// ── Stats ──────────────────────────────────────────────────────────────

export async function ctiStatsHandler(c: Context<{ Bindings: Env }>) {
  const db = c.env.BRIEFINGS_DB;
  if (!db) return c.json({ error: 'database unavailable' }, 503);
  const stats = await getIocStats(db);
  return c.json(stats);
}

// ── IOC listing ────────────────────────────────────────────────────────

export async function ctiIocsHandler(c: Context<{ Bindings: Env }>) {
  const db = c.env.BRIEFINGS_DB;
  if (!db) return c.json({ error: 'database unavailable' }, 503);

  const type = c.req.query('type') || '';
  const source = c.req.query('source') || '';
  const search = c.req.query('q') || '';
  const minDecay = parseFloat(c.req.query('min_decay') || '0');
  const limit = Math.min(parseInt(c.req.query('limit') || '100'), 500);
  const offset = parseInt(c.req.query('offset') || '0');

  let where = 'WHERE 1=1';
  const params: string[] = [];

  if (type) {
    where += ' AND type = ?';
    params.push(type);
  }
  if (source) {
    where += ' AND source = ?';
    params.push(source);
  }
  if (search) {
    where += ' AND value LIKE ?';
    params.push(`%${search}%`);
  }
  if (minDecay > 0) {
    where += ' AND decay_score >= ?';
    params.push(String(minDecay));
  }

  const countResult = await db
    .prepare(`SELECT COUNT(*) as n FROM cti_iocs ${where}`)
    .bind(...params)
    .first();
  const rows = await db
    .prepare(
      `SELECT id, value, type, source, confidence, malware_family, threat_actor, tags, first_seen, last_seen, observation_count, decay_score
     FROM cti_iocs ${where} ORDER BY last_seen DESC LIMIT ? OFFSET ?`
    )
    .bind(...params, String(limit), String(offset))
    .all();

  return c.json({
    total: Number(countResult?.n || 0),
    limit,
    offset,
    iocs: rows.results.map((r) => ({
      ...r,
      tags: (() => {
        try {
          return JSON.parse(String(r.tags || '[]'));
        } catch {
          return [];
        }
      })(),
    })),
  });
}

// ── News listing ───────────────────────────────────────────────────────

export async function ctiNewsHandler(c: Context<{ Bindings: Env }>) {
  const db = c.env.BRIEFINGS_DB;
  if (!db) return c.json({ error: 'database unavailable' }, 503);

  const source = c.req.query('source') || '';
  const limit = Math.min(parseInt(c.req.query('limit') || '50'), 200);

  let where = 'WHERE 1=1';
  const params: string[] = [];
  if (source) {
    where += ' AND source = ?';
    params.push(source);
  }

  const rows = await db
    .prepare(`SELECT * FROM cti_news ${where} ORDER BY fetched_at DESC LIMIT ?`)
    .bind(...params, String(limit))
    .all();

  return c.json({
    total: rows.results.length,
    news: rows.results.map((r) => ({
      ...r,
      tags: (() => {
        try {
          return JSON.parse(String(r.tags || '[]'));
        } catch {
          return [];
        }
      })(),
    })),
  });
}

// ── Predictions ────────────────────────────────────────────────────────

export async function ctiPredictionsGetHandler(c: Context<{ Bindings: Env }>) {
  const db = c.env.BRIEFINGS_DB;
  if (!db) return c.json({ error: 'database unavailable' }, 503);
  const limit = parseInt(c.req.query('limit') || '10');
  const predictions = await getRecentPredictions(db, limit);
  return c.json({ predictions });
}

export async function ctiPredictionsPostHandler(c: Context<{ Bindings: Env }>) {
  const db = c.env.BRIEFINGS_DB;
  const ai = c.env.AI;
  if (!db) return c.json({ error: 'database unavailable' }, 503);
  if (!ai) return c.json({ error: 'AI binding unavailable' }, 503);

  const body = await c.req.json<{ count?: number; focus_sector?: string; focus_region?: string }>().catch(() => ({}));
  const result = await generatePredictions(db, ai, body, {
    groqKey: c.env.GROQ_API_KEY,
    googleKey: c.env.GOOGLE_AI_STUDIO_API_KEY,
  });
  return c.json(result);
}

// ── Mutation ───────────────────────────────────────────────────────────

export async function ctiMutateHandler(c: Context<{ Bindings: Env }>) {
  const db = c.env.BRIEFINGS_DB;
  const ai = c.env.AI;
  if (!db) return c.json({ error: 'database unavailable' }, 503);
  if (!ai) return c.json({ error: 'AI binding unavailable' }, 503);

  let body: Record<string, unknown>;
  try {
    body = await c.req.json<Record<string, unknown>>();
  } catch (e) {
    console.warn('parse body failed:', e instanceof Error ? e.message : String(e));
    return c.json({ error: 'invalid_json_body' }, 400);
  }
  const input = String(body.input || '');
  if (!input) return c.json({ error: 'input is required' }, 400);

  try {
    const keys = { groqKey: c.env.GROQ_API_KEY, googleKey: c.env.GOOGLE_AI_STUDIO_API_KEY };
    const seed = await parseSeedAttack(db, ai, input, String(body.seed_type || 'auto'), keys);
    const variants = await generateVariants(
      db,
      ai,
      seed,
      {
        count: typeof body.count === 'number' ? body.count : undefined,
        strategies: Array.isArray(body.strategies) ? body.strategies : undefined,
        target_sector: typeof body.target_sector === 'string' ? body.target_sector : undefined,
      },
      keys
    );

    return c.json({ seed, variants });
  } catch (e) {
    console.error('ctiMutateHandler failed:', e instanceof Error ? e.message : String(e));
    return c.json({ error: e instanceof Error ? e.message : 'mutation failed' }, 500);
  }
}

export async function ctiMutationsHandler(c: Context<{ Bindings: Env }>) {
  const db = c.env.BRIEFINGS_DB;
  if (!db) return c.json({ error: 'database unavailable' }, 503);

  const seedId = c.req.query('seed_id');
  if (seedId) {
    const variants = await getVariantsForSeed(db, seedId);
    return c.json({ seed_id: seedId, variants });
  }

  const seeds = await getSeeds(db);
  const topVariants = await getTopVariants(db, 10);
  const stats = await getMutationStats(db);
  return c.json({ seeds, top_variants: topVariants, stats });
}

// ── Decay scoring ──────────────────────────────────────────────────────

export async function ctiDecayHandler(c: Context<{ Bindings: Env }>) {
  const db = c.env.BRIEFINGS_DB;
  if (!db) return c.json({ error: 'database unavailable' }, 503);
  const result = await applyDecayScoring(db);
  return c.json(result);
}

// ── Stale data sweep ───────────────────────────────────────────────────

export async function ctiSweepHandler(c: Context<{ Bindings: Env }>) {
  const db = c.env.BRIEFINGS_DB;
  if (!db) return c.json({ error: 'database unavailable' }, 503);
  const days = parseInt(c.req.query('days') || '30') || 30;
  const result = await sweepStaleData(db, days);
  return c.json({ days, ...result });
}
