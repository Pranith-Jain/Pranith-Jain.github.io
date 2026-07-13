import type { Context } from 'hono';
import type { Env } from '../env';
import { safeNullLog } from '../lib/safe-catch';

export type FeedbackTarget = 'copilot' | 'briefing' | 'pir' | 'finding' | 'ioc' | 'assessment';
export type FeedbackRating = 'useful' | 'not_useful' | 'actioned' | 'accurate' | 'inaccurate' | 'no_value';

export interface Feedback {
  id: string;
  target_type: FeedbackTarget;
  target_id: string;
  rating: FeedbackRating;
  comment?: string;
  sector?: string;
  created_at: string;
}

interface FeedbackAgg {
  target_type: FeedbackTarget;
  target_id: string;
  total: number;
  useful: number;
  not_useful: number;
  actioned: number;
  accurate: number;
  inaccurate: number;
  no_value: number;
  overall_score: number;
}

const KV_PREFIX = 'feedback:v1';

function generateId(): string {
  return `fb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * POST /api/v1/threat-intel/feedback
 */
export async function feedbackCreateHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const body = await c.req.json<{
      target_type: FeedbackTarget;
      target_id: string;
      rating: FeedbackRating;
      comment?: string;
      sector?: string;
    }>();

    const validTargets: FeedbackTarget[] = ['copilot', 'briefing', 'pir', 'finding', 'ioc', 'assessment'];
    const validRatings: FeedbackRating[] = ['useful', 'not_useful', 'actioned', 'accurate', 'inaccurate', 'no_value'];

    if (!validTargets.includes(body.target_type)) {
      return c.json({ error: `invalid target_type. must be one of: ${validTargets.join(', ')}` }, 400);
    }
    if (!validRatings.includes(body.rating)) {
      return c.json({ error: `invalid rating. must be one of: ${validRatings.join(', ')}` }, 400);
    }
    if (!body.target_id || body.target_id.trim().length === 0) {
      return c.json({ error: 'target_id is required' }, 400);
    }

    const feedback: Feedback = {
      id: generateId(),
      target_type: body.target_type,
      target_id: body.target_id.trim(),
      rating: body.rating,
      comment: body.comment?.trim().slice(0, 1000),
      sector: body.sector?.trim().slice(0, 100),
      created_at: new Date().toISOString(),
    };

    const kv = c.env.KV_CACHE;
    if (!kv) return c.json({ error: 'feedback storage not configured' }, 503);

    // Store individual feedback item
    const itemKey = `${KV_PREFIX}:${feedback.id}`;
    await kv.put(itemKey, JSON.stringify(feedback), { expirationTtl: 7776000 }); // 90 days

    // Update aggregate counter for this target
    const aggKey = `${KV_PREFIX}:agg:${feedback.target_type}:${feedback.target_id}`;
    const existing = await kv.get(aggKey);
    const agg: FeedbackAgg = existing
      ? JSON.parse(existing)
      : {
          target_type: feedback.target_type,
          target_id: feedback.target_id,
          total: 0,
          useful: 0,
          not_useful: 0,
          actioned: 0,
          accurate: 0,
          inaccurate: 0,
          no_value: 0,
          overall_score: 0,
        };

    agg.total++;
    agg[feedback.rating]++;
    agg.overall_score = Math.round(((agg.useful + agg.actioned + agg.accurate) / Math.max(1, agg.total)) * 100);
    await kv.put(aggKey, JSON.stringify(agg), { expirationTtl: 7776000 });
    await invalidateFeedbackList();

    return c.json({ ok: true, feedback, aggregate: agg }, 201);
  } catch (e) {
    console.error('handler failed:', e instanceof Error ? e.message : String(e));
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
}

/**
 * GET /api/v1/threat-intel/feedback
 * Query params: target_type, target_id, limit (default 50)
 */
const FEEDBACK_LIST_CACHE = 'https://feedback-list-cache.internal/v1';
const FEEDBACK_LIST_TTL = 60;

/**
 * Load + cache the full feedback set once per TTL. The `kv.list` + one `kv.get`
 * per key is the single most expensive read op in this file; caching the whole
 * set per-colo and filtering in-memory serves every (target_type, target_id)
 * combination from one cached scan.
 */
async function loadAllFeedback(kv: KVNamespace): Promise<Feedback[]> {
  const cache = (caches as unknown as { default: Cache }).default;
  try {
    const hit = await cache.match(new Request(FEEDBACK_LIST_CACHE));
    if (hit) return (await hit.json()) as Feedback[];
  } catch (_catchErr) {
    console.error('loadAllFeedback failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    /* fall through to a fresh scan */
  }
  const listResult = await kv.list({ prefix: KV_PREFIX + ':', limit: 1000 });
  const eligibleKeys = listResult.keys.slice(0, 500).filter((k) => !k.name.startsWith(KV_PREFIX + ':agg:'));
  const results = await Promise.all(
    eligibleKeys.map(async (key) => {
      try {
        const raw = await kv.get(key.name);
        return raw ? (JSON.parse(raw) as Feedback) : null;
      } catch (_catchErr) {
        console.error('loadAllFeedback failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
        return null;
      }
    })
  );
  const feedbacks: Feedback[] = results.filter((f): f is Feedback => f !== null);
  feedbacks.sort((a, b) => b.created_at.localeCompare(a.created_at));
  safeNullLog(
    'cache-put-feedback-list',
    cache.put(
      new Request(FEEDBACK_LIST_CACHE),
      new Response(JSON.stringify(feedbacks), { headers: { 'cache-control': `max-age=${FEEDBACK_LIST_TTL}` } })
    )
  );
  return feedbacks;
}

/** Purge the cached feedback list (same-colo) after a create/delete so the
 *  writer sees their change immediately; other colos refresh within TTL. */
async function invalidateFeedbackList(): Promise<void> {
  try {
    await (caches as unknown as { default: Cache }).default.delete(new Request(FEEDBACK_LIST_CACHE));
  } catch (_catchErr) {
    console.error('invalidateFeedbackList failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    /* best-effort */
  }
}

export async function feedbackListHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const targetType = c.req.query('target_type') as FeedbackTarget | undefined;
    const targetId = c.req.query('target_id');
    const limit = Math.min(100, parseInt(c.req.query('limit') ?? '50', 10));

    const kv = c.env.KV_CACHE;
    if (!kv) return c.json({ error: 'feedback storage not configured' }, 503);

    let feedbacks = await loadAllFeedback(kv);
    if (targetType) feedbacks = feedbacks.filter((fb) => fb.target_type === targetType);
    if (targetId) feedbacks = feedbacks.filter((fb) => fb.target_id === targetId);

    return c.json({
      total: feedbacks.length,
      results: feedbacks.slice(0, limit),
    });
  } catch (e) {
    console.error('feedbackListHandler failed:', e instanceof Error ? e.message : String(e));
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
}

/**
 * GET /api/v1/threat-intel/feedback/aggregate
 * Query params: target_type, target_id (required)
 */
export async function feedbackAggregateHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const targetType = c.req.query('target_type') as FeedbackTarget;
    const targetId = c.req.query('target_id');
    if (!targetType || !targetId) {
      return c.json({ error: 'target_type and target_id query params required' }, 400);
    }
    const kv = c.env.KV_CACHE;
    if (!kv) return c.json({ error: 'feedback storage not configured' }, 503);
    const aggKey = `${KV_PREFIX}:agg:${targetType}:${targetId}`;
    const raw = await kv.get(aggKey);
    if (!raw) return c.json({ total: 0, overall_score: null });
    const agg = JSON.parse(raw) as FeedbackAgg;
    return c.json(agg);
  } catch (e) {
    console.error('feedbackAggregateHandler failed:', e instanceof Error ? e.message : String(e));
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
}

/**
 * DELETE /api/v1/threat-intel/feedback/:id
 */
export async function feedbackDeleteHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const kv = c.env.KV_CACHE;
    if (!kv) return c.json({ error: 'feedback storage not configured' }, 503);
    const authHeader = c.req.header('authorization');
    if (!authHeader) return c.json({ error: 'unauthorized', message: 'missing authorization header' }, 401);
    const id = c.req.param('id');
    const itemKey = `${KV_PREFIX}:${id}`;
    const raw = await kv.get(itemKey);
    if (!raw) return c.json({ error: 'feedback not found' }, 404);

    const fb = JSON.parse(raw) as Feedback;
    await kv.delete(itemKey);

    // Update aggregate
    const aggKey = `${KV_PREFIX}:agg:${fb.target_type}:${fb.target_id}`;
    const existing = await kv.get(aggKey);
    if (existing) {
      const agg = JSON.parse(existing) as FeedbackAgg;
      agg.total = Math.max(0, agg.total - 1);
      agg[fb.rating] = Math.max(0, agg[fb.rating] - 1);
      agg.overall_score =
        agg.total > 0 ? Math.round(((agg.useful + agg.actioned + agg.accurate) / agg.total) * 100) : 0;
      if (agg.total > 0) {
        await kv.put(aggKey, JSON.stringify(agg), { expirationTtl: 7776000 });
      } else {
        await kv.delete(aggKey);
      }
    }
    await invalidateFeedbackList();

    return c.json({ ok: true, deleted: id });
  } catch (e) {
    console.error('handler failed:', e instanceof Error ? e.message : String(e));
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
}
