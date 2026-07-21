import type { Context } from 'hono';
import type { Env } from '../env';
import { safeNullLog } from '../lib/safe-catch';

export type RiskLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';
export type RiskStatus = 'identified' | 'assessed' | 'treatment' | 'monitoring' | 'accepted' | 'closed';
export type TreatmentStrategy = 'mitigate' | 'transfer' | 'accept' | 'avoid';

export interface FairQuantification {
  sle_min: number;
  sle_most_likely: number;
  sle_max: number;
  annual_occurrences: number;
  ale_min: number;
  ale_most_likely: number;
  ale_max: number;
  currency: string;
}

export interface RiskRegisterEntry {
  id: string;
  title: string;
  description: string;
  category: string;
  asset_ids: string[];
  inherent_level: RiskLevel;
  current_level: RiskLevel;
  residual_level: RiskLevel;
  status: RiskStatus;
  treatment_strategy?: TreatmentStrategy;
  treatment_plan?: string;
  treatment_owner?: string;
  treatment_due?: string;
  fair?: FairQuantification;
  priority_score: number;
  created_at: string;
  updated_at: string;
  accepted_until?: string;
  accepted_justification?: string;
}

const KV_PREFIX = 'risk-register:v1';
const INDEX_CACHE_KEY = 'https://risk-register-index-cache.internal/v1';
const INDEX_CACHE_TTL = 30;

const RISK_LEVEL_VALUE: Record<RiskLevel, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

function computePriority(
  entry: Pick<RiskRegisterEntry, 'inherent_level' | 'current_level' | 'residual_level' | 'fair' | 'status'>
): number {
  let score = 0;
  const residual = RISK_LEVEL_VALUE[entry.residual_level] ?? 0;
  const current = RISK_LEVEL_VALUE[entry.current_level] ?? 0;
  const inherent = RISK_LEVEL_VALUE[entry.inherent_level] ?? 0;

  // Base score from risk levels
  score += residual * 20;
  score += current * 10;
  score += inherent * 5;

  // Boost if FAIR quantification suggests high ALE
  if (entry.fair?.ale_most_likely) {
    const ale = entry.fair.ale_most_likely;
    if (ale > 1_000_000) score += 20;
    else if (ale > 100_000) score += 15;
    else if (ale > 10_000) score += 10;
    else if (ale > 1_000) score += 5;
  }

  // Reduce if accepted or closed
  if (entry.status === 'closed') score = 0;
  else if (entry.status === 'accepted') score = Math.round(score * 0.5);

  return Math.min(100, Math.max(0, score));
}

function generateId(): string {
  return `risk-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
}

function cacheApi(): Cache | null {
  try {
    return (caches as unknown as { default: Cache }).default;
  } catch {
    return null;
  }
}

async function loadAll(env: Env): Promise<RiskRegisterEntry[]> {
  try {
    const kv = env.KV_CACHE;
    if (!kv) return [];
    const cache = cacheApi();
    if (cache) {
      try {
        const r = await cache.match(INDEX_CACHE_KEY);
        if (r) return (await r.json()) as RiskRegisterEntry[];
      } catch {
        /* fall through */
      }
    }
    const list = await kv.list({ prefix: KV_PREFIX + ':' });
    const results = await Promise.all(
      list.keys.map(async (key) => {
        try {
          const raw = await kv.get(key.name);
          return raw ? (JSON.parse(raw) as RiskRegisterEntry) : null;
        } catch {
          return null;
        }
      })
    );
    const entries = results.filter((e): e is RiskRegisterEntry => e !== null);
    const sorted = entries.sort(
      (a, b) => b.priority_score - a.priority_score || b.created_at.localeCompare(a.created_at)
    );
    if (cache && sorted.length > 0) {
      safeNullLog(
        'cache-put-risk-index',
        cache.put(
          INDEX_CACHE_KEY,
          new Response(JSON.stringify(sorted), { headers: { 'cache-control': `max-age=${INDEX_CACHE_TTL}` } })
        )
      ).catch((err) => console.error('risk-index cache put failed:', err));
    }
    return sorted;
  } catch {
    return [];
  }
}

async function save(env: Env, entry: RiskRegisterEntry): Promise<void> {
  const kv = env.KV_CACHE;
  if (!kv) return;
  await kv.put(`${KV_PREFIX}:${entry.id}`, JSON.stringify(entry));
  const cache = cacheApi();
  if (cache) {
    try {
      await cache.delete(INDEX_CACHE_KEY);
    } catch {
      /* non-fatal */
    }
  }
}

async function remove(env: Env, id: string): Promise<boolean> {
  const kv = env.KV_CACHE;
  if (!kv) return false;
  await kv.delete(`${KV_PREFIX}:${id}`);
  const cache = cacheApi();
  if (cache) {
    try {
      await cache.delete(INDEX_CACHE_KEY);
    } catch {
      /* non-fatal */
    }
  }
  return true;
}

export async function riskRegisterListHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const entries = await loadAll(c.env);
  const status = c.req.query('status');
  const category = c.req.query('category');
  const minScore = Number(c.req.query('min_score')) || 0;

  let filtered = entries;
  if (status) filtered = filtered.filter((e) => e.status === status);
  if (category) filtered = filtered.filter((e) => e.category === category);
  if (minScore > 0) filtered = filtered.filter((e) => e.priority_score >= minScore);

  return c.json({
    count: filtered.length,
    entries: filtered,
    generated_at: new Date().toISOString(),
  });
}

export async function riskRegisterGetHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'id required' }, 400);
  const kv = c.env.KV_CACHE;
  if (!kv) return c.json({ error: 'KV not available' }, 503);
  const raw = await kv.get(`${KV_PREFIX}:${id}`);
  if (!raw) return c.json({ error: 'not found' }, 404);
  return c.json(JSON.parse(raw) as RiskRegisterEntry);
}

export async function riskRegisterCreateHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  let body: any;
  try {
    body = await c.req.json();
  } catch (e) {
    console.warn('parse body failed:', e instanceof Error ? e.message : String(e));
    return c.json({ error: 'invalid_json_body' }, 400);
  }

  const now = new Date().toISOString();
  const entry: RiskRegisterEntry = {
    id: generateId(),
    title: body.title ?? 'Untitled Risk',
    description: body.description ?? '',
    category: body.category ?? 'general',
    asset_ids: body.asset_ids ?? [],
    inherent_level: body.inherent_level ?? 'medium',
    current_level: body.current_level ?? 'medium',
    residual_level: body.residual_level ?? 'medium',
    status: body.status ?? 'identified',
    treatment_strategy: body.treatment_strategy,
    treatment_plan: body.treatment_plan,
    treatment_owner: body.treatment_owner,
    treatment_due: body.treatment_due,
    fair: body.fair,
    priority_score: 0,
    created_at: now,
    updated_at: now,
    accepted_until: body.accepted_until,
    accepted_justification: body.accepted_justification,
  };

  entry.priority_score = computePriority(entry);
  await save(c.env, entry);
  return c.json(entry, 201);
}

export async function riskRegisterUpdateHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'id required' }, 400);
  let body: any;
  try {
    body = await c.req.json();
  } catch (e) {
    console.warn('parse body failed:', e instanceof Error ? e.message : String(e));
    return c.json({ error: 'invalid_json_body' }, 400);
  }

  const kv = c.env.KV_CACHE;
  if (!kv) return c.json({ error: 'KV not available' }, 503);
  const raw = await kv.get(`${KV_PREFIX}:${id}`);
  if (!raw) return c.json({ error: 'not found' }, 404);

  const existing = JSON.parse(raw) as RiskRegisterEntry;
  const updated: RiskRegisterEntry = {
    ...existing,
    ...body,
    id: existing.id,
    created_at: existing.created_at,
    updated_at: new Date().toISOString(),
  };
  updated.priority_score = computePriority(updated);
  await save(c.env, updated);
  return c.json(updated);
}

export async function riskRegisterDeleteHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'id required' }, 400);
  const ok = await remove(c.env, id);
  if (!ok) return c.json({ error: 'delete failed' }, 500);
  return c.json({ ok: true });
}

export async function riskRegisterStatsHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const entries = await loadAll(c.env);
  const total = entries.length;
  const byLevel: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  let totalAle = 0;
  let openRisks = 0;

  for (const e of entries) {
    byLevel[e.residual_level] = (byLevel[e.residual_level] ?? 0) + 1;
    byStatus[e.status] = (byStatus[e.status] ?? 0) + 1;
    byCategory[e.category] = (byCategory[e.category] ?? 0) + 1;
    if (e.status !== 'closed') openRisks++;
    if (e.fair?.ale_most_likely) totalAle += e.fair.ale_most_likely;
  }

  return c.json({
    total,
    open_risks: openRisks,
    total_ale: totalAle,
    currency: entries.find((e) => e.fair?.currency)?.fair?.currency ?? 'USD',
    by_level: byLevel,
    by_status: byStatus,
    by_category: byCategory,
    generated_at: new Date().toISOString(),
  });
}
