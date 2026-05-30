import type { Context } from 'hono';
import type { Env } from '../env';

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

function generateId(): string {
  return `asmt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

async function loadAll(env: Env): Promise<Assessment[]> {
  try {
    const kv = env.KV_CACHE;
    if (!kv) return [];
    const list = await kv.list({ prefix: KV_PREFIX + ':' });
    const assessments: Assessment[] = [];
    for (const key of list.keys) {
      try {
        const raw = await kv.get(key.name);
        if (raw) assessments.push(JSON.parse(raw) as Assessment);
      } catch {
        /* skip */
      }
    }
    return assessments.sort((a, b) => b.created_at.localeCompare(a.created_at));
  } catch {
    return [];
  }
}

async function save(env: Env, assessment: Assessment): Promise<void> {
  const kv = env.KV_CACHE;
  if (!kv) return;
  // Assessments are durable intelligence products — persist indefinitely.
  // (KV rejects expirationTtl:0 at runtime; omit the option to never expire.)
  await kv.put(`${KV_PREFIX}:${assessment.id}`, JSON.stringify(assessment));
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
    const limit = Math.min(100, parseInt(c.req.query('limit') ?? '50', 10));

    let assessments = await loadAll(c.env);
    if (statusFilter) assessments = assessments.filter((a) => a.status === statusFilter);
    if (typeFilter) assessments = assessments.filter((a) => a.type === typeFilter);

    return c.json({
      total: assessments.length,
      results: assessments.slice(0, limit),
    });
  } catch (e) {
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
    const raw = await kv.get(`${KV_PREFIX}:${id}`);
    if (!raw) return c.json({ error: 'assessment not found' }, 404);
    return c.json(JSON.parse(raw) as Assessment);
  } catch (e) {
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

    const updated: Assessment = {
      ...existing,
      ...body,
      id: existing.id,
      created_at: existing.created_at,
      updated_at: now,
    };

    // If transitioning to published, set published_at
    if (body.status === 'published' && existing.status !== 'published') {
      updated.published_at = now;
    }

    await save(c.env, updated);
    return c.json({ ok: true, assessment: updated });
  } catch (e) {
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
    return c.json({ ok: true, deleted: id });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
}
