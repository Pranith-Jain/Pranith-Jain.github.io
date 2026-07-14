import type { Context } from 'hono';
import type { Env } from '../env';
import { safeNullLog } from '../lib/safe-catch';

export type AssessmentStatus = 'draft' | 'review' | 'published' | 'archived';
export type AssessmentType = 'actor' | 'campaign' | 'cve' | 'ransomware' | 'sector' | 'general';

export interface Assessment {
  id: string;
  title: string;
  type: AssessmentType;
  status: AssessmentStatus;
  topic: string;
  /** The analytical narrative body */
  body: string;
  /** Source names used in this assessment */
  sources: string[];
  /** Computed confidence at time of creation */
  confidence_score: number;
  confidence_level: string;
  /** Author / analyst identifier */
  author?: string;
  /** Sector this assessment is relevant to */
  sector?: string;
  /** Related PIR IDs */
  related_pirs?: string[];
  created_at: string;
  updated_at: string;
  published_at?: string;
}

const KV_PREFIX = 'assessment:v1';
const INDEX_CACHE_KEY = 'https://assessment-index-cache.internal/v1';
const INDEX_CACHE_TTL = 30;

function cacheApi(): Cache | null {
  try {
    return (caches as unknown as { default: Cache }).default;
  } catch (_catchErr) {
    console.error('cacheApi failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    return null;
  }
}

function generateId(): string {
  return `asmt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

async function loadAll(env: Env): Promise<Assessment[]> {
  try {
    const kv = env.KV_CACHE;
    if (!kv) return [];
    const cache = cacheApi();
    if (cache) {
      try {
        const r = await cache.match(INDEX_CACHE_KEY);
        if (r) return (await r.json()) as Assessment[];
      } catch (_catchErr) {
        console.error('loadAll failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
        /* fall through */
      }
    }
    const list = await kv.list({ prefix: KV_PREFIX + ':' });
    const results = await Promise.all(
      list.keys.map(async (key) => {
        try {
          const raw = await kv.get(key.name);
          return raw ? (JSON.parse(raw) as Assessment) : null;
        } catch (_catchErr) {
          console.error('loadAll failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
          return null;
        }
      })
    );
    const assessments: Assessment[] = results.filter((a): a is Assessment => a !== null);
    const sorted = assessments.sort((a, b) => b.created_at.localeCompare(a.created_at));
    if (cache && sorted.length > 0) {
      safeNullLog(
        'cache-put-assessment-index',
        cache.put(
          INDEX_CACHE_KEY,
          new Response(JSON.stringify(sorted), { headers: { 'cache-control': `max-age=${INDEX_CACHE_TTL}` } })
        )
      );
    }
    return sorted;
  } catch (e) {
    console.warn(JSON.stringify({ job: 'assessments-load', error: e instanceof Error ? e.message : String(e) }));
    return [];
  }
}

async function save(env: Env, assessment: Assessment): Promise<void> {
  const kv = env.KV_CACHE;
  if (!kv) return;
  // Assessments are durable intelligence products — persist indefinitely.
  // (KV rejects expirationTtl:0 at runtime; omit the option to never expire.)
  await kv.put(`${KV_PREFIX}:${assessment.id}`, JSON.stringify(assessment));
  // Invalidate the cached index so the next loadAll picks up the change
  const cache = cacheApi();
  if (cache) safeNullLog('cache-delete-index', cache.delete(INDEX_CACHE_KEY));
}

/**
 * POST /api/v1/threat-intel/assessments — create a new assessment
 */
export async function assessmentCreateHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const body = await c.req.json<{
      title: string;
      type: AssessmentType;
      topic: string;
      body: string;
      sources?: string[];
      confidence_score?: number;
      confidence_level?: string;
      author?: string;
      sector?: string;
      related_pirs?: string[];
    }>();
    if (!body.title || !body.type || !body.topic || !body.body) {
      return c.json({ error: 'title, type, topic, and body are required' }, 400);
    }
    const now = new Date().toISOString();
    const assessment: Assessment = {
      id: generateId(),
      title: body.title,
      type: body.type,
      status: 'draft',
      topic: body.topic,
      body: body.body,
      sources: body.sources ?? [],
      confidence_score: body.confidence_score ?? 0,
      confidence_level: body.confidence_level ?? 'unassessed',
      author: body.author?.slice(0, 100),
      sector: body.sector?.slice(0, 100),
      related_pirs: body.related_pirs,
      created_at: now,
      updated_at: now,
    };
    await save(c.env, assessment);
    return c.json({ ok: true, assessment }, 201);
  } catch (e) {
    console.error('handler failed:', e instanceof Error ? e.message : String(e));
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
}

/**
 * GET /api/v1/threat-intel/assessments — list assessments
 * Query params: status, type, limit
 */
export async function assessmentListHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const statusFilter = c.req.query('status') as AssessmentStatus | undefined;
    const typeFilter = c.req.query('type') as AssessmentType | undefined;
    const n = parseInt(c.req.query('limit') ?? '50', 10);
    const limit = Number.isFinite(n) ? Math.min(100, Math.max(1, n)) : 50;

    let assessments = await loadAll(c.env);
    if (statusFilter) assessments = assessments.filter((a) => a.status === statusFilter);
    if (typeFilter) assessments = assessments.filter((a) => a.type === typeFilter);

    return c.json({
      total: assessments.length,
      results: assessments.slice(0, limit),
    });
  } catch (e) {
    console.error('assessmentListHandler failed:', e instanceof Error ? e.message : String(e));
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
}

/**
 * GET /api/v1/threat-intel/assessments/:id — get single assessment
 */
export async function assessmentDetailHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const kv = c.env.KV_CACHE;
    if (!kv) return c.json({ error: 'assessment storage not configured' }, 503);
    const id = c.req.param('id');
    const cacheKey = `https://assessment-detail-cache.internal/v1/${id}`;
    const cache = cacheApi();
    if (cache) {
      try {
        const r = await cache.match(new Request(cacheKey));
        if (r) return c.json((await r.json()) as Assessment);
      } catch (_catchErr) {
        console.error(
          'assessmentDetailHandler failed:',
          _catchErr instanceof Error ? _catchErr.message : String(_catchErr)
        );
        /* fall through */
      }
    }
    const raw = await kv.get(`${KV_PREFIX}:${id}`);
    if (!raw) return c.json({ error: 'assessment not found' }, 404);
    const assessment = JSON.parse(raw) as Assessment;
    if (cache) {
      safeNullLog(
        'cache-put-assessment-detail',
        cache.put(
          new Request(cacheKey),
          new Response(JSON.stringify(assessment), { headers: { 'cache-control': `max-age=${INDEX_CACHE_TTL}` } })
        )
      );
    }
    return c.json(assessment);
  } catch (e) {
    console.error('assessmentDetailHandler failed:', e instanceof Error ? e.message : String(e));
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
}

/**
 * PUT /api/v1/threat-intel/assessments/:id — update assessment
 */
export async function assessmentUpdateHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const kv = c.env.KV_CACHE;
    if (!kv) return c.json({ error: 'assessment storage not configured' }, 503);
    const id = c.req.param('id');
    const raw = await kv.get(`${KV_PREFIX}:${id}`);
    if (!raw) return c.json({ error: 'assessment not found' }, 404);

    const existing = JSON.parse(raw) as Assessment;
    const body = await c.req.json<Partial<Assessment>>();
    const now = new Date().toISOString();

    // Strip server-controlled fields from the client body so they cannot be
    // mass-assigned via the raw JSON (id/created_at/updated_at are pinned below;
    // published_at is set ONLY by the real status transition, not by the caller).
    const { id: _id, created_at: _ca, updated_at: _ua, published_at: _pa, ...rest } = body;
    void _id;
    void _ca;
    void _ua;
    void _pa;

    const updated: Assessment = {
      ...existing,
      ...rest,
      id: existing.id,
      created_at: existing.created_at,
      updated_at: now,
      published_at: existing.published_at,
    };

    // If transitioning to published, set published_at
    if (body.status === 'published' && existing.status !== 'published') {
      updated.published_at = now;
    }

    await save(c.env, updated);
    return c.json({ ok: true, assessment: updated });
  } catch (e) {
    console.error('handler failed:', e instanceof Error ? e.message : String(e));
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
}

/**
 * DELETE /api/v1/threat-intel/assessments/:id
 */
export async function assessmentDeleteHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const kv = c.env.KV_CACHE;
    if (!kv) return c.json({ error: 'assessment storage not configured' }, 503);
    const id = c.req.param('id');
    await kv.delete(`${KV_PREFIX}:${id}`);
    const cache = cacheApi();
    if (cache) {
      safeNullLog('cache-delete-index', cache.delete(INDEX_CACHE_KEY));
      safeNullLog(
        'cache-delete-assessment-detail',
        cache.delete(new Request(`https://assessment-detail-cache.internal/v1/${id}`))
      );
    }
    return c.json({ ok: true, deleted: id });
  } catch (e) {
    console.error('assessmentDeleteHandler failed:', e instanceof Error ? e.message : String(e));
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
}
