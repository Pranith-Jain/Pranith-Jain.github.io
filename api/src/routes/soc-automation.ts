import type { Context } from 'hono';
import type { Env } from '../env';

export type PlaybookTrigger =
  'incident_created' | 'incident_updated' | 'alert_created' | 'scheduled' | 'webhook' | 'manual';
export type ActionType =
  | 'webhook'
  | 'email'
  | 'slack'
  | 'kb_update'
  | 'mcp_tool'
  | 'create_ticket'
  | 'update_ticket'
  | 'add_note'
  | 'run_script'
  | 'wait'
  | 'condition';
export type RunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'timeout';

export interface PlaybookAction {
  id: string;
  type: ActionType;
  label: string;
  config: Record<string, unknown>;
  next_on_success?: string;
  next_on_failure?: string;
  timeout_seconds: number;
}

export interface Playbook {
  id: string;
  name: string;
  description: string;
  trigger: PlaybookTrigger;
  trigger_config?: Record<string, unknown>;
  actions: PlaybookAction[];
  enabled: boolean;
  tags: string[];
  run_count: number;
  avg_duration_ms: number;
  last_run_at?: string;
  last_run_status?: RunStatus;
  created_at: string;
  updated_at: string;
}

export interface PlaybookRun {
  id: string;
  playbook_id: string;
  playbook_name: string;
  trigger: PlaybookTrigger;
  trigger_event_id?: string;
  status: RunStatus;
  started_at: string;
  completed_at?: string;
  duration_ms?: number;
  action_results: Array<{
    action_id: string;
    action_label: string;
    status: 'success' | 'failed' | 'skipped' | 'timeout';
    output?: string;
    duration_ms: number;
  }>;
  error?: string;
}

const KV_PREFIX = 'soc:v1';
const INDEX_CACHE_KEY = 'https://soc-index-cache.internal/v1';
const INDEX_CACHE_TTL = 30;

function makeId(): string {
  return Date.now().toString(36) + '-' + crypto.randomUUID().slice(0, 8);
}

async function loadAll<T>(env: Env, type: string): Promise<T[]> {
  const kv = env.KV_CACHE;
  if (!kv) return [];
  try {
    const cacheKey = `${INDEX_CACHE_KEY}/${type}`;
    const cached = await kv.get(cacheKey);
    if (cached) return JSON.parse(cached) as T[];
    const idsRaw = await kv.get(`${KV_PREFIX}:${type}:index`);
    const ids: string[] = idsRaw ? JSON.parse(idsRaw) : [];
    const results: T[] = [];
    for (const id of ids) {
      const raw = await kv.get(`${KV_PREFIX}:${type}:${id}`);
      if (raw) results.push(JSON.parse(raw) as T);
    }
    await kv.put(cacheKey, JSON.stringify(results), { expirationTtl: INDEX_CACHE_TTL });
    return results;
  } catch {
    return [];
  }
}

async function saveAll<T>(env: Env, type: string, items: T[], getId: (item: T) => string): Promise<void> {
  const kv = env.KV_CACHE;
  if (!kv) return;
  const ids = items.map(getId);
  await kv.put(`${KV_PREFIX}:${type}:index`, JSON.stringify(ids));
  for (const item of items) await kv.put(`${KV_PREFIX}:${type}:${getId(item)}`, JSON.stringify(item));
  await kv.delete(`${INDEX_CACHE_KEY}/${type}`);
}

// ── Playbooks ────────────────────────────────────────────────────────

export async function socListPlaybooks(c: Context<{ Bindings: Env }>): Promise<Response> {
  let items = await loadAll<Playbook>(c.env, 'playbooks');
  const trigger = c.req.query('trigger');
  const enabled = c.req.query('enabled');
  if (trigger) items = items.filter((p) => p.trigger === trigger);
  if (enabled !== undefined) items = items.filter((p) => p.enabled === (enabled === 'true'));
  items.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  return c.json({ count: items.length, items });
}

export async function socGetPlaybook(c: Context<{ Bindings: Env }>): Promise<Response> {
  const kv = c.env.KV_CACHE;
  if (!kv) return c.json({ error: 'KV not available' }, 500);
  const raw = await kv.get(`${KV_PREFIX}:playbooks:${c.req.param('id')}`);
  if (!raw) return c.json({ error: 'Not found' }, 404);
  try {
    return c.json(JSON.parse(raw));
  } catch {
    return c.json({ error: 'Not found' }, 404, { 'Cache-Control': 'no-store' });
  }
}

export async function socCreatePlaybook(c: Context<{ Bindings: Env }>): Promise<Response> {
  const body = await c.req.json<Omit<Playbook, 'id' | 'created_at' | 'updated_at' | 'run_count' | 'avg_duration_ms'>>();
  const now = new Date().toISOString();
  const playbook: Playbook = {
    ...body,
    id: makeId(),
    run_count: 0,
    avg_duration_ms: 0,
    created_at: now,
    updated_at: now,
  };
  const items = await loadAll<Playbook>(c.env, 'playbooks');
  items.push(playbook);
  await saveAll(c.env, 'playbooks', items, (p) => p.id);
  return c.json(playbook, 201);
}

export async function socUpdatePlaybook(c: Context<{ Bindings: Env }>): Promise<Response> {
  const kv = c.env.KV_CACHE;
  if (!kv) return c.json({ error: 'KV not available' }, 500);
  const id = c.req.param('id');
  const raw = await kv.get(`${KV_PREFIX}:playbooks:${id}`);
  if (!raw) return c.json({ error: 'Not found' }, 404);
  let existing: Playbook;
  try {
    existing = JSON.parse(raw) as Playbook;
  } catch {
    return c.json({ error: 'Not found' }, 404, { 'Cache-Control': 'no-store' });
  }
  const body = await c.req.json<Partial<Playbook>>();
  const updated: Playbook = { ...existing, ...body, id: existing.id, updated_at: new Date().toISOString() };
  await kv.put(`${KV_PREFIX}:playbooks:${id}`, JSON.stringify(updated));
  await kv.delete(`${INDEX_CACHE_KEY}/playbooks`);
  return c.json(updated);
}

export async function socDeletePlaybook(c: Context<{ Bindings: Env }>): Promise<Response> {
  const id = c.req.param('id');
  const items = await loadAll<Playbook>(c.env, 'playbooks');
  const filtered = items.filter((p) => p.id !== id);
  await saveAll(c.env, 'playbooks', filtered, (p) => p.id);
  return c.json({ deleted: id });
}

// ── Execute ──────────────────────────────────────────────────────────

export async function socExecutePlaybook(c: Context<{ Bindings: Env }>): Promise<Response> {
  const kv = c.env.KV_CACHE;
  if (!kv) return c.json({ error: 'KV not available' }, 500);
  const id = c.req.param('id');
  const raw = await kv.get(`${KV_PREFIX}:playbooks:${id}`);
  if (!raw) return c.json({ error: 'Not found' }, 404);
  let playbook: Playbook;
  try {
    playbook = JSON.parse(raw) as Playbook;
  } catch {
    return c.json({ error: 'Not found' }, 404, { 'Cache-Control': 'no-store' });
  }
  if (!playbook.actions) playbook.actions = [];
  const runId = makeId();
  const startedAt = new Date().toISOString();
  const actionResults: PlaybookRun['action_results'] = [];
  let runStatus: RunStatus = 'completed';
  let runError: string | undefined;

  for (const action of playbook.actions) {
    const actionStart = Date.now();
    try {
      // Simulate action execution
      const result = await simulateAction(action, c.env, playbook.trigger);
      actionResults.push({
        action_id: action.id,
        action_label: action.label,
        status: result.success ? 'success' : 'failed',
        output: result.output,
        duration_ms: Date.now() - actionStart,
      });
    } catch (e) {
      actionResults.push({
        action_id: action.id,
        action_label: action.label,
        status: 'failed',
        output: (e as Error).message,
        duration_ms: Date.now() - actionStart,
      });
      runStatus = 'failed';
      runError = (e as Error).message;
      if (!action.next_on_failure) break;
    }
  }

  const completedAt = new Date().toISOString();
  const durationMs = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  const run: PlaybookRun = {
    id: runId,
    playbook_id: playbook.id,
    playbook_name: playbook.name,
    trigger: playbook.trigger,
    status: runStatus,
    started_at: startedAt,
    completed_at: completedAt,
    duration_ms: durationMs,
    action_results: actionResults,
    error: runError,
  };

  // Update playbook stats
  const pbRaw = await kv.get(`${KV_PREFIX}:playbooks:${id}`);
  if (pbRaw) {
    let pb: Playbook;
    try {
      pb = JSON.parse(pbRaw) as Playbook;
    } catch {
      pb = playbook;
    }
    pb.run_count += 1;
    pb.avg_duration_ms = Math.round((pb.avg_duration_ms * (pb.run_count - 1) + durationMs) / pb.run_count);
    pb.last_run_at = completedAt;
    pb.last_run_status = runStatus;
    await kv.put(`${KV_PREFIX}:playbooks:${id}`, JSON.stringify(pb));
    await kv.delete(`${INDEX_CACHE_KEY}/playbooks`);
  }

  // Save run
  const runs = await loadAll<PlaybookRun>(c.env, 'runs');
  runs.push(run);
  await saveAll(c.env, 'runs', runs, (r) => r.id);

  return c.json(run, 201);
}

async function simulateAction(
  action: PlaybookAction,
  _env: Env,
  _trigger: PlaybookTrigger
): Promise<{ success: boolean; output: string }> {
  // Simulate latency
  await new Promise((resolve) => setTimeout(resolve, Math.min(action.timeout_seconds * 1000, 200)));
  return { success: true, output: JSON.stringify({ simulated: true, action: action.type, label: action.label }) };
}

// ── Runs ─────────────────────────────────────────────────────────────

export async function socListRuns(c: Context<{ Bindings: Env }>): Promise<Response> {
  let items = await loadAll<PlaybookRun>(c.env, 'runs');
  const playbookId = c.req.query('playbook_id');
  const status = c.req.query('status');
  if (playbookId) items = items.filter((r) => r.playbook_id === playbookId);
  if (status) items = items.filter((r) => r.status === status);
  items.sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
  return c.json({ count: items.length, items });
}

export async function socGetRun(c: Context<{ Bindings: Env }>): Promise<Response> {
  const kv = c.env.KV_CACHE;
  if (!kv) return c.json({ error: 'KV not available' }, 500);
  const raw = await kv.get(`${KV_PREFIX}:runs:${c.req.param('id')}`);
  if (!raw) return c.json({ error: 'Not found' }, 404);
  try {
    return c.json(JSON.parse(raw));
  } catch {
    return c.json({ error: 'Not found' }, 404, { 'Cache-Control': 'no-store' });
  }
}

// ── Stats ────────────────────────────────────────────────────────────

export async function socStats(c: Context<{ Bindings: Env }>): Promise<Response> {
  const [playbooks, runs] = await Promise.all([
    loadAll<Playbook>(c.env, 'playbooks'),
    loadAll<PlaybookRun>(c.env, 'runs'),
  ]);
  const enabledCount = playbooks.filter((p) => p.enabled).length;
  const byTrigger: Record<string, number> = {};
  for (const p of playbooks) {
    byTrigger[p.trigger] = (byTrigger[p.trigger] ?? 0) + 1;
  }
  const totalRuns = runs.length;
  const successRate =
    totalRuns > 0 ? Math.round((runs.filter((r) => r.status === 'completed').length / totalRuns) * 100) : 0;
  const avgDuration = totalRuns > 0 ? Math.round(runs.reduce((s, r) => s + (r.duration_ms ?? 0), 0) / totalRuns) : 0;
  return c.json({
    total_playbooks: playbooks.length,
    enabled_playbooks: enabledCount,
    playbooks_by_trigger: byTrigger,
    total_runs: totalRuns,
    success_rate: successRate,
    avg_duration_ms: avgDuration,
  });
}
