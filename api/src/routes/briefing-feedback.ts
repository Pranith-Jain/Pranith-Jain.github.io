/**
 * Briefing Feedback API
 *
 * Allows analysts to provide feedback on threat intelligence briefings:
 *   - Flag findings as false positives
 *   - Mark findings as high priority for investigation
 *   - Add analyst notes and annotations
 *   - Track investigation status
 *
 * Routes:
 *   POST /api/v1/briefings/:slug/feedback     — Submit feedback on a finding
 *   GET  /api/v1/briefings/:slug/feedback      — Get feedback for a briefing
 *   POST /api/v1/briefings/:slug/annotations   — Add annotation
 *   GET  /api/v1/briefings/:slug/annotations   — Get annotations
 *   GET  /api/v1/briefings/feedback/summary     — Get feedback summary across all briefings
 */

import type { Context } from 'hono';
import type { Env } from '../env';
import type { D1Database } from '@cloudflare/workers-types';
import { badRequest, internalError } from '../lib/api-error';
import { z } from 'zod';

// ── Validation Schemas ──────────────────────────────────────────

const feedbackSchema = z.object({
  finding_hash: z.string().min(1).max(64),
  finding_text: z.string().min(1).max(500),
  action: z.enum(['false_positive', 'high_priority', 'verified', 'investigating', 'resolved']),
  analyst_note: z.string().max(2000).optional(),
  confidence: z.enum(['confirmed', 'probable', 'possible', 'doubtful']).optional(),
});

const annotationSchema = z.object({
  annotation_type: z.enum(['note', 'context', 'action_item', 'link']),
  content: z.string().min(1).max(5000),
  priority: z.enum(['critical', 'high', 'normal', 'low']).optional().default('normal'),
});

// ── Helper: Extract analyst ID from request ─────────────────────

function getAnalystId(c: Context<{ Bindings: Env }>): string {
  // Use API key prefix if available, otherwise 'anonymous'
  const authz = c.req.header('authorization') ?? '';
  const apiKey = c.req.header('x-api-key') ?? '';
  const key = /^Bearer\s+(.+)$/i.exec(authz)?.[1] ?? apiKey;
  if (key && key.length >= 8) return key.slice(0, 8);
  return 'anonymous';
}

// ── Handlers ────────────────────────────────────────────────────

/**
 * POST /api/v1/briefings/:slug/feedback
 * Submit analyst feedback on a briefing finding.
 */
export async function submitFeedbackHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const slug = c.req.param('slug');
  if (!slug) return badRequest(c, 'briefing slug required');

  const db = c.env.BRIEFINGS_DB;
  if (!db) return c.json({ error: 'database unavailable' }, 503);

  const body = await c.req.json().catch(() => null);
  const parsed = feedbackSchema.safeParse(body);
  if (!parsed.success) return badRequest(c, parsed.error.issues.map((i) => i.message).join('; '));

  const { finding_hash, finding_text, action, analyst_note, confidence } = parsed.data;
  const analystId = getAnalystId(c);

  try {
    await db
      .prepare(
        `INSERT INTO briefing_feedback (briefing_slug, finding_hash, finding_text, action, analyst_note, confidence, analyst_id, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(briefing_slug, finding_hash, analyst_id) DO UPDATE SET
           action = excluded.action,
           analyst_note = COALESCE(excluded.analyst_note, briefing_feedback.analyst_note),
           confidence = COALESCE(excluded.confidence, briefing_feedback.confidence),
           updated_at = datetime('now')`
      )
      .bind(slug, finding_hash, finding_text.slice(0, 500), action, analyst_note ?? null, confidence ?? null, analystId)
      .run();

    return c.json({ ok: true, action, finding_hash }, 200, { 'Cache-Control': 'no-store' });
  } catch (e) {
    return internalError(c, e);
  }
}

/**
 * GET /api/v1/briefings/:slug/feedback
 * Get all feedback for a briefing.
 */
export async function getFeedbackHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const slug = c.req.param('slug');
  if (!slug) return badRequest(c, 'briefing slug required');

  const db = c.env.BRIEFINGS_DB;
  if (!db) return c.json({ error: 'database unavailable' }, 503);

  try {
    const results = await db
      .prepare(
        `SELECT id, finding_hash, finding_text, action, analyst_note, confidence, analyst_id, created_at, updated_at
         FROM briefing_feedback
         WHERE briefing_slug = ?
         ORDER BY updated_at DESC`
      )
      .bind(slug)
      .all();

    // Aggregate by action type
    const summary = {
      total: results.results?.length ?? 0,
      false_positives: 0,
      high_priority: 0,
      verified: 0,
      investigating: 0,
      resolved: 0,
    };

    for (const row of results.results ?? []) {
      const r = row as { action?: string };
      if (r.action && r.action in summary) {
        (summary as Record<string, number>)[r.action]++;
      }
    }

    return c.json({
      slug,
      feedback: results.results ?? [],
      summary,
    }, 200, { 'Cache-Control': 'public, max-age=60' });
  } catch (e) {
    return internalError(c, e);
  }
}

/**
 * POST /api/v1/briefings/:slug/annotations
 * Add an annotation to a briefing.
 */
export async function submitAnnotationHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const slug = c.req.param('slug');
  if (!slug) return badRequest(c, 'briefing slug required');

  const db = c.env.BRIEFINGS_DB;
  if (!db) return c.json({ error: 'database unavailable' }, 503);

  const body = await c.req.json().catch(() => null);
  const parsed = annotationSchema.safeParse(body);
  if (!parsed.success) return badRequest(c, parsed.error.issues.map((i) => i.message).join('; '));

  const { annotation_type, content, priority } = parsed.data;
  const analystId = getAnalystId(c);

  try {
    const result = await db
      .prepare(
        `INSERT INTO briefing_annotations (briefing_slug, annotation_type, content, priority, analyst_id)
         VALUES (?, ?, ?, ?, ?)`
      )
      .bind(slug, annotation_type, content.slice(0, 5000), priority ?? 'normal', analystId)
      .run();

    return c.json({
      ok: true,
      id: result.meta.last_row_id,
      annotation_type,
      priority,
    }, 201, { 'Cache-Control': 'no-store' });
  } catch (e) {
    return internalError(c, e);
  }
}

/**
 * GET /api/v1/briefings/:slug/annotations
 * Get all annotations for a briefing.
 */
export async function getAnnotationsHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const slug = c.req.param('slug');
  if (!slug) return badRequest(c, 'briefing slug required');

  const db = c.env.BRIEFINGS_DB;
  if (!db) return c.json({ error: 'database unavailable' }, 503);

  try {
    const results = await db
      .prepare(
        `SELECT id, annotation_type, content, priority, analyst_id, created_at
         FROM briefing_annotations
         WHERE briefing_slug = ?
         ORDER BY created_at DESC`
      )
      .bind(slug)
      .all();

    return c.json({
      slug,
      annotations: results.results ?? [],
    }, 200, { 'Cache-Control': 'public, max-age=60' });
  } catch (e) {
    return internalError(c, e);
  }
}

/**
 * GET /api/v1/briefings/feedback/summary
 * Get feedback summary across all briefings for the analyst dashboard.
 */
export async function feedbackSummaryHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const db = c.env.BRIEFINGS_DB;
  if (!db) return c.json({ error: 'database unavailable' }, 503);

  try {
    // Get counts by action type
    const actionCounts = await db
      .prepare(
        `SELECT action, COUNT(*) as count
         FROM briefing_feedback
         GROUP BY action`
      )
      .all();

    // Get recent high-priority findings
    const highPriority = await db
      .prepare(
        `SELECT briefing_slug, finding_text, analyst_note, confidence, created_at
         FROM briefing_feedback
         WHERE action = 'high_priority'
         ORDER BY created_at DESC
         LIMIT 10`
      )
      .all();

    // Get recent false positives (for tuning)
    const falsePositives = await db
      .prepare(
        `SELECT briefing_slug, finding_text, analyst_note, created_at
         FROM briefing_feedback
         WHERE action = 'false_positive'
         ORDER BY created_at DESC
         LIMIT 10`
      )
      .all();

    // Get annotation count
    const annotationCount = await db
      .prepare('SELECT COUNT(*) as count FROM briefing_annotations')
      .first<{ count: number }>();

    return c.json({
      action_counts: actionCounts.results ?? [],
      high_priority: highPriority.results ?? [],
      false_positives: falsePositives.results ?? [],
      total_annotations: annotationCount?.count ?? 0,
    }, 200, { 'Cache-Control': 'public, max-age=300' });
  } catch (e) {
    return internalError(c, e);
  }
}
