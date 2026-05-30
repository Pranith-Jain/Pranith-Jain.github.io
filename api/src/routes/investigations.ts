import type { Context } from 'hono';
import type { Env } from '../env';
import { safeJsonBody } from '../lib/safe-body';

interface Observable {
  id: string;
  value: string;
  type: 'ipv4' | 'ipv6' | 'domain' | 'url' | 'hash' | 'email';
  description?: string;
  tags: string[];
  created_at: string;
}

interface Task {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'in-progress' | 'completed';
  created_at: string;
}

interface TimelineEvent {
  id: string;
  type:
    | 'created'
    | 'observable-added'
    | 'observable-removed'
    | 'task-added'
    | 'task-updated'
    | 'status-changed'
    | 'note-added'
    | 'severity-changed';
  message: string;
  created_at: string;
}

interface Investigation {
  id: string;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  tlp: 'white' | 'green' | 'amber' | 'red';
  status: 'open' | 'in-progress' | 'closed';
  tags: string[];
  created_at: string;
  updated_at: string;
  observables: Observable[];
  tasks: Task[];
  timeline: TimelineEvent[];
}

const KV_KEY = 'investigations:v1';

async function listInvestigations(kv: KVNamespace): Promise<Investigation[]> {
  const raw = await kv.get(KV_KEY, 'json').catch(() => null);
  return (raw as Investigation[]) ?? [];
}

async function saveInvestigations(kv: KVNamespace, investigations: Investigation[]): Promise<void> {
  await kv.put(KV_KEY, JSON.stringify(investigations));
}

function now(): string {
  return new Date().toISOString();
}

function timelineEntry(type: TimelineEvent['type'], message: string): TimelineEvent {
  return { id: crypto.randomUUID(), type, message, created_at: now() };
}

export async function listInvestigationsHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const kv = c.env.KV_CACHE;
  if (!kv) return c.json({ error: 'KV not available' }, 503);
  const investigations = await listInvestigations(kv);
  return c.json({ investigations }, 200, { 'Cache-Control': 'no-store' });
}

export async function createInvestigationHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const kv = c.env.KV_CACHE;
  if (!kv) return c.json({ error: 'KV not available' }, 503);

  const parsed = await safeJsonBody<{
    title: string;
    description?: string;
    severity?: Investigation['severity'];
    tlp?: Investigation['tlp'];
    tags?: string[];
  }>(c, { maxBytes: 8 * 1024 });
  if ('error' in parsed) return parsed.error;
  const body = parsed.value;

  if (!body.title?.trim()) return c.json({ error: 'title is required' }, 400);

  const now_ = now();
  const investigation: Investigation = {
    id: crypto.randomUUID(),
    title: body.title.trim(),
    description: body.description ?? '',
    severity: body.severity ?? 'medium',
    tlp: body.tlp ?? 'amber',
    status: 'open',
    tags: body.tags ?? [],
    created_at: now_,
    updated_at: now_,
    observables: [],
    tasks: [],
    timeline: [timelineEntry('created', `Investigation "${body.title.trim()}" created`)],
  };

  const investigations = await listInvestigations(kv);
  investigations.unshift(investigation);
  await saveInvestigations(kv, investigations);
  return c.json({ investigation }, 201);
}

export async function getInvestigationHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const kv = c.env.KV_CACHE;
  if (!kv) return c.json({ error: 'KV not available' }, 503);

  const id = c.req.param('id');
  if (!id) return c.json({ error: 'id required' }, 400);

  const investigations = await listInvestigations(kv);
  const investigation = investigations.find((i) => i.id === id);
  if (!investigation) return c.json({ error: 'investigation not found' }, 404);

  return c.json({ investigation }, 200, { 'Cache-Control': 'no-store' });
}

export async function updateInvestigationHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const kv = c.env.KV_CACHE;
  if (!kv) return c.json({ error: 'KV not available' }, 503);

  const id = c.req.param('id');
  if (!id) return c.json({ error: 'id required' }, 400);

  const parsed = await safeJsonBody<{
    title?: string;
    description?: string;
    severity?: Investigation['severity'];
    tlp?: Investigation['tlp'];
    status?: Investigation['status'];
    tags?: string[];
  }>(c, { maxBytes: 8 * 1024 });
  if ('error' in parsed) return parsed.error;
  const body = parsed.value;

  const investigations = await listInvestigations(kv);
  const idx = investigations.findIndex((i) => i.id === id);
  if (idx < 0) return c.json({ error: 'investigation not found' }, 404);

  const inv = investigations[idx]!;
  if (body.title !== undefined) inv.title = body.title.trim();
  if (body.description !== undefined) inv.description = body.description;
  if (body.severity !== undefined && body.severity !== inv.severity) {
    inv.timeline.push(timelineEntry('severity-changed', `Severity changed to ${body.severity}`));
    inv.severity = body.severity;
  }
  if (body.tlp !== undefined) inv.tlp = body.tlp;
  if (body.status !== undefined && body.status !== inv.status) {
    inv.timeline.push(timelineEntry('status-changed', `Status changed to ${body.status}`));
    inv.status = body.status;
  }
  if (body.tags !== undefined) inv.tags = body.tags;
  inv.updated_at = now();
  investigations[idx] = inv;

  await saveInvestigations(kv, investigations);
  return c.json({ investigation: inv });
}

export async function deleteInvestigationHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const kv = c.env.KV_CACHE;
  if (!kv) return c.json({ error: 'KV not available' }, 503);

  const id = c.req.param('id');
  if (!id) return c.json({ error: 'id required' }, 400);

  const investigations = await listInvestigations(kv);
  const idx = investigations.findIndex((i) => i.id === id);
  if (idx < 0) return c.json({ error: 'investigation not found' }, 404);

  investigations.splice(idx, 1);
  await saveInvestigations(kv, investigations);
  return c.json({ ok: true });
}

export async function addObservableHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const kv = c.env.KV_CACHE;
  if (!kv) return c.json({ error: 'KV not available' }, 503);

  const id = c.req.param('id');
  if (!id) return c.json({ error: 'id required' }, 400);

  const parsed = await safeJsonBody<{ value: string; type: Observable['type']; description?: string; tags?: string[] }>(
    c,
    { maxBytes: 4 * 1024 }
  );
  if ('error' in parsed) return parsed.error;
  const body = parsed.value;

  if (!body.value?.trim() || !body.type) return c.json({ error: 'value and type required' }, 400);

  const investigations = await listInvestigations(kv);
  const idx = investigations.findIndex((i) => i.id === id);
  if (idx < 0) return c.json({ error: 'investigation not found' }, 404);

  const observable: Observable = {
    id: crypto.randomUUID(),
    value: body.value.trim(),
    type: body.type,
    description: body.description,
    tags: body.tags ?? [],
    created_at: now(),
  };

  const inv = investigations[idx]!;
  inv.observables.push(observable);
  inv.updated_at = now();
  inv.timeline.push(timelineEntry('observable-added', `Observable ${body.type}:${body.value.trim()} added`));
  investigations[idx] = inv;

  await saveInvestigations(kv, investigations);
  return c.json({ observable }, 201);
}

export async function removeObservableHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const kv = c.env.KV_CACHE;
  if (!kv) return c.json({ error: 'KV not available' }, 503);

  const id = c.req.param('id');
  const obsId = c.req.param('observableId');
  if (!id || !obsId) return c.json({ error: 'id and observableId required' }, 400);

  const investigations = await listInvestigations(kv);
  const idx = investigations.findIndex((i) => i.id === id);
  if (idx < 0) return c.json({ error: 'investigation not found' }, 404);

  const inv = investigations[idx]!;
  const obsIdx = inv.observables.findIndex((o) => o.id === obsId);
  if (obsIdx < 0) return c.json({ error: 'observable not found' }, 404);

  const removed = inv.observables[obsIdx]!;
  inv.observables.splice(obsIdx, 1);
  inv.updated_at = now();
  inv.timeline.push(timelineEntry('observable-removed', `Observable ${removed.type}:${removed.value} removed`));
  investigations[idx] = inv;

  await saveInvestigations(kv, investigations);
  return c.json({ ok: true });
}

export async function addTaskHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const kv = c.env.KV_CACHE;
  if (!kv) return c.json({ error: 'KV not available' }, 503);

  const id = c.req.param('id');
  if (!id) return c.json({ error: 'id required' }, 400);

  const parsed = await safeJsonBody<{ title: string; description?: string }>(c, { maxBytes: 4 * 1024 });
  if ('error' in parsed) return parsed.error;
  const body = parsed.value;

  if (!body.title?.trim()) return c.json({ error: 'title required' }, 400);

  const investigations = await listInvestigations(kv);
  const idx = investigations.findIndex((i) => i.id === id);
  if (idx < 0) return c.json({ error: 'investigation not found' }, 404);

  const task: Task = {
    id: crypto.randomUUID(),
    title: body.title.trim(),
    description: body.description,
    status: 'pending',
    created_at: now(),
  };

  const inv = investigations[idx]!;
  inv.tasks.push(task);
  inv.updated_at = now();
  inv.timeline.push(timelineEntry('task-added', `Task "${body.title.trim()}" added`));
  investigations[idx] = inv;

  await saveInvestigations(kv, investigations);
  return c.json({ task }, 201);
}

export async function updateTaskHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const kv = c.env.KV_CACHE;
  if (!kv) return c.json({ error: 'KV not available' }, 503);

  const id = c.req.param('id');
  const taskId = c.req.param('taskId');
  if (!id || !taskId) return c.json({ error: 'id and taskId required' }, 400);

  const parsed = await safeJsonBody<{ title?: string; description?: string; status?: Task['status'] }>(c, {
    maxBytes: 4 * 1024,
  });
  if ('error' in parsed) return parsed.error;
  const body = parsed.value;

  const investigations = await listInvestigations(kv);
  const idx = investigations.findIndex((i) => i.id === id);
  if (idx < 0) return c.json({ error: 'investigation not found' }, 404);

  const inv = investigations[idx]!;
  const tIdx = inv.tasks.findIndex((t) => t.id === taskId);
  if (tIdx < 0) return c.json({ error: 'task not found' }, 404);

  const task = inv.tasks[tIdx]!;
  if (body.title !== undefined) task.title = body.title.trim();
  if (body.description !== undefined) task.description = body.description;
  if (body.status !== undefined && body.status !== task.status) {
    inv.timeline.push(timelineEntry('task-updated', `Task "${task.title}" marked as ${body.status}`));
    task.status = body.status;
  }
  inv.updated_at = now();
  investigations[idx] = inv;

  await saveInvestigations(kv, investigations);
  return c.json({ task });
}

export async function addNoteHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const kv = c.env.KV_CACHE;
  if (!kv) return c.json({ error: 'KV not available' }, 503);

  const id = c.req.param('id');
  if (!id) return c.json({ error: 'id required' }, 400);

  const parsed = await safeJsonBody<{ message: string }>(c, { maxBytes: 8 * 1024 });
  if ('error' in parsed) return parsed.error;
  const body = parsed.value;

  if (!body.message?.trim()) return c.json({ error: 'message required' }, 400);

  const investigations = await listInvestigations(kv);
  const idx = investigations.findIndex((i) => i.id === id);
  if (idx < 0) return c.json({ error: 'investigation not found' }, 404);

  const inv = investigations[idx]!;
  inv.timeline.push(timelineEntry('note-added', body.message.trim()));
  inv.updated_at = now();
  investigations[idx] = inv;

  await saveInvestigations(kv, investigations);
  return c.json({ ok: true });
}
