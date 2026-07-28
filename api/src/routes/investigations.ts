import type { Context } from 'hono';
import type { D1Database } from '@cloudflare/workers-types';
import type { Env } from '../env';
import { safeJsonBody } from '../lib/safe-body';
import { badRequest, notFound, serviceUnavailable } from '../lib/api-error';

interface Observable {
  id: string;
  value: string;
  type: 'ipv4' | 'ipv6' | 'domain' | 'url' | 'hash' | 'email' | 'crypto-address' | 'tx-hash';
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

function now(): string {
  return new Date().toISOString();
}

function timelineEntry(type: TimelineEvent['type'], message: string): TimelineEvent {
  return { id: crypto.randomUUID(), type, message, created_at: now() };
}

// ── D1 table management ──────────────────────────────────────────────────

const DDL = `
CREATE TABLE IF NOT EXISTS investigations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  severity TEXT NOT NULL DEFAULT 'medium',
  tlp TEXT NOT NULL DEFAULT 'amber',
  status TEXT NOT NULL DEFAULT 'open',
  tags TEXT DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS investigation_observables (
  id TEXT PRIMARY KEY,
  investigation_id TEXT NOT NULL,
  value TEXT NOT NULL,
  type TEXT NOT NULL,
  description TEXT,
  tags TEXT DEFAULT '[]',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS investigation_tasks (
  id TEXT PRIMARY KEY,
  investigation_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS investigation_timeline (
  id TEXT PRIMARY KEY,
  investigation_id TEXT NOT NULL,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_inv_obs_inv ON investigation_observables(investigation_id);
CREATE INDEX IF NOT EXISTS idx_inv_tasks_inv ON investigation_tasks(investigation_id);
CREATE INDEX IF NOT EXISTS idx_inv_timeline_inv ON investigation_timeline(investigation_id);
`;

async function ensureTables(db: D1Database): Promise<void> {
  const stmts = DDL.split(';')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const stmt of stmts) {
    await db.prepare(stmt).run();
  }
}

// ── Query helpers ────────────────────────────────────────────────────────

function parseTags(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw as string[];
  if (typeof raw === 'string')
    try {
      return JSON.parse(raw);
    } catch (_catchErr) {
      console.error('parseTags failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
      return [];
    }
  return [];
}

function rowToObservable(row: Record<string, unknown>): Observable {
  return {
    id: row.id as string,
    value: row.value as string,
    type: row.type as Observable['type'],
    description: row.description as string | undefined,
    tags: parseTags(row.tags),
    created_at: row.created_at as string,
  };
}

function rowToTask(row: Record<string, unknown>): Task {
  return {
    id: row.id as string,
    title: row.title as string,
    description: row.description as string | undefined,
    status: row.status as Task['status'],
    created_at: row.created_at as string,
  };
}

function rowToTimeline(row: Record<string, unknown>): TimelineEvent {
  return {
    id: row.id as string,
    type: row.type as TimelineEvent['type'],
    message: row.message as string,
    created_at: row.created_at as string,
  };
}

function rowToInvestigation(row: Record<string, unknown>): Omit<Investigation, 'observables' | 'tasks' | 'timeline'> {
  return {
    id: row.id as string,
    title: row.title as string,
    description: (row.description as string) ?? '',
    severity: row.severity as Investigation['severity'],
    tlp: row.tlp as Investigation['tlp'],
    status: row.status as Investigation['status'],
    tags: parseTags(row.tags),
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

async function loadFullInvestigation(db: D1Database, id: string): Promise<Investigation | null> {
  const row = await db.prepare('SELECT * FROM investigations WHERE id = ?').bind(id).first();
  if (!row) return null;
  const base = rowToInvestigation(row as Record<string, unknown>);
  const [observables, tasks, timeline] = await Promise.all([
    db.prepare('SELECT * FROM investigation_observables WHERE investigation_id = ? ORDER BY created_at').bind(id).all(),
    db.prepare('SELECT * FROM investigation_tasks WHERE investigation_id = ? ORDER BY created_at').bind(id).all(),
    db.prepare('SELECT * FROM investigation_timeline WHERE investigation_id = ? ORDER BY created_at').bind(id).all(),
  ]);
  return {
    ...base,
    observables: (observables.results ?? []).map((r) => rowToObservable(r as Record<string, unknown>)),
    tasks: (tasks.results ?? []).map((r) => rowToTask(r as Record<string, unknown>)),
    timeline: (timeline.results ?? []).map((r) => rowToTimeline(r as Record<string, unknown>)),
  };
}

async function loadAllInvestigations(db: D1Database): Promise<Investigation[]> {
  const rows = await db.prepare('SELECT * FROM investigations ORDER BY updated_at DESC').all();
  if (!rows.results?.length) return [];

  const bases = rows.results.map((r) => rowToInvestigation(r as Record<string, unknown>));
  const ids = bases.map((b) => b.id);

  // Batch-fetch sub-items for all investigations (4 queries total)
  // ids are string UUIDs from the database — safe for D1 parameterized binds.
  const placeholder = ids.map(() => '?').join(',');
  const toBind = ids;
  const [obsResult, tasksResult, tlResult] = await Promise.all([
    db
      .prepare(`SELECT * FROM investigation_observables WHERE investigation_id IN (${placeholder}) ORDER BY created_at`)
      .bind(...toBind)
      .all(),
    db
      .prepare(`SELECT * FROM investigation_tasks WHERE investigation_id IN (${placeholder}) ORDER BY created_at`)
      .bind(...toBind)
      .all(),
    db
      .prepare(`SELECT * FROM investigation_timeline WHERE investigation_id IN (${placeholder}) ORDER BY created_at`)
      .bind(...toBind)
      .all(),
  ]);

  // Group sub-items by investigation_id (extract from raw rows)
  const obsByInv = new Map<string, Observable[]>();
  const tasksByInv = new Map<string, Task[]>();
  const tlByInv = new Map<string, TimelineEvent[]>();

  for (const r of obsResult.results ?? []) {
    const row = r as Record<string, unknown>;
    const invId = row.investigation_id as string;
    if (!obsByInv.has(invId)) obsByInv.set(invId, []);
    obsByInv.get(invId)!.push(rowToObservable(row));
  }
  for (const r of tasksResult.results ?? []) {
    const row = r as Record<string, unknown>;
    const invId = row.investigation_id as string;
    if (!tasksByInv.has(invId)) tasksByInv.set(invId, []);
    tasksByInv.get(invId)!.push(rowToTask(row));
  }
  for (const r of tlResult.results ?? []) {
    const row = r as Record<string, unknown>;
    const invId = row.investigation_id as string;
    if (!tlByInv.has(invId)) tlByInv.set(invId, []);
    tlByInv.get(invId)!.push(rowToTimeline(row));
  }

  return bases.map((b) => ({
    ...b,
    observables: obsByInv.get(b.id) ?? [],
    tasks: tasksByInv.get(b.id) ?? [],
    timeline: tlByInv.get(b.id) ?? [],
  }));
}

// ── Handlers ─────────────────────────────────────────────────────────────

export async function listInvestigationsHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const db = c.env.BRIEFINGS_DB;
  if (!db) return serviceUnavailable(c, 'Database not configured');
  await ensureTables(db);
  const investigations = await loadAllInvestigations(db);
  return c.json({ investigations }, 200, { 'Cache-Control': 'no-store' });
}

export async function createInvestigationHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const db = c.env.BRIEFINGS_DB;
  if (!db) return serviceUnavailable(c, 'Database not configured');

  const parsed = await safeJsonBody<{
    title: string;
    description?: string;
    severity?: Investigation['severity'];
    tlp?: Investigation['tlp'];
    tags?: string[];
  }>(c, { maxBytes: 8 * 1024 });
  if ('error' in parsed) return parsed.error;
  const body = parsed.value;

  if (!body.title?.trim()) return badRequest(c, 'title is required');
  await ensureTables(db);

  const now_ = now();
  const inv = {
    id: crypto.randomUUID(),
    title: body.title.trim(),
    description: body.description ?? '',
    severity: body.severity ?? ('medium' as const),
    tlp: body.tlp ?? ('amber' as const),
    status: 'open' as const,
    tags: body.tags ?? [],
    created_at: now_,
    updated_at: now_,
  };
  const tl = timelineEntry('created', `Investigation "${body.title.trim()}" created`);

  await db
    .prepare(
      `INSERT INTO investigations (id, title, description, severity, tlp, status, tags, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      inv.id,
      inv.title,
      inv.description,
      inv.severity,
      inv.tlp,
      inv.status,
      JSON.stringify(inv.tags),
      inv.created_at,
      inv.updated_at
    )
    .run();

  await db
    .prepare(
      'INSERT INTO investigation_timeline (id, investigation_id, type, message, created_at) VALUES (?, ?, ?, ?, ?)'
    )
    .bind(tl.id, inv.id, tl.type, tl.message, tl.created_at)
    .run();

  const investigation: Investigation = { ...inv, observables: [], tasks: [], timeline: [tl] };
  return c.json({ investigation }, 201);
}

export async function getInvestigationHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const db = c.env.BRIEFINGS_DB;
  if (!db) return serviceUnavailable(c, 'Database not configured');

  const id = c.req.param('id');
  if (!id) return badRequest(c, 'id required');
  await ensureTables(db);

  const investigation = await loadFullInvestigation(db, id);
  if (!investigation) return notFound(c, 'investigation not found');
  return c.json({ investigation }, 200, { 'Cache-Control': 'no-store' });
}

export async function updateInvestigationHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const db = c.env.BRIEFINGS_DB;
  if (!db) return serviceUnavailable(c, 'Database not configured');

  const id = c.req.param('id');
  if (!id) return badRequest(c, 'id required');

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
  await ensureTables(db);

  const existing = await db.prepare('SELECT * FROM investigations WHERE id = ?').bind(id).first();
  if (!existing) return notFound(c, 'investigation not found');

  const inv = rowToInvestigation(existing as Record<string, unknown>);
  const timelineInserts: Array<{ type: string; message: string }> = [];

  if (body.title !== undefined) inv.title = body.title.trim();
  if (body.description !== undefined) inv.description = body.description;
  if (body.severity !== undefined && body.severity !== inv.severity) {
    timelineInserts.push({ type: 'severity-changed', message: `Severity changed to ${body.severity}` });
    inv.severity = body.severity;
  }
  if (body.tlp !== undefined) inv.tlp = body.tlp;
  if (body.status !== undefined && body.status !== inv.status) {
    timelineInserts.push({ type: 'status-changed', message: `Status changed to ${body.status}` });
    inv.status = body.status;
  }
  if (body.tags !== undefined) inv.tags = body.tags;
  inv.updated_at = now();

  await db
    .prepare(
      `UPDATE investigations SET title = ?, description = ?, severity = ?, tlp = ?, status = ?, tags = ?, updated_at = ? WHERE id = ?`
    )
    .bind(inv.title, inv.description, inv.severity, inv.tlp, inv.status, JSON.stringify(inv.tags), inv.updated_at, id)
    .run();

  for (const tl of timelineInserts) {
    const ev = timelineEntry(tl.type as TimelineEvent['type'], tl.message);
    await db
      .prepare(
        'INSERT INTO investigation_timeline (id, investigation_id, type, message, created_at) VALUES (?, ?, ?, ?, ?)'
      )
      .bind(ev.id, id, ev.type, ev.message, ev.created_at)
      .run();
  }

  const investigation = await loadFullInvestigation(db, id);
  return c.json({ investigation });
}

export async function deleteInvestigationHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const db = c.env.BRIEFINGS_DB;
  if (!db) return serviceUnavailable(c, 'Database not configured');

  const id = c.req.param('id');
  if (!id) return badRequest(c, 'id required');
  await ensureTables(db);

  const existing = await db.prepare('SELECT id FROM investigations WHERE id = ?').bind(id).first();
  if (!existing) return notFound(c, 'investigation not found');

  // CASCADE delete children manually (D1 doesn't support FK constraints)
  await db.prepare('DELETE FROM investigation_observables WHERE investigation_id = ?').bind(id).run();
  await db.prepare('DELETE FROM investigation_tasks WHERE investigation_id = ?').bind(id).run();
  await db.prepare('DELETE FROM investigation_timeline WHERE investigation_id = ?').bind(id).run();
  await db.prepare('DELETE FROM investigations WHERE id = ?').bind(id).run();

  return c.json({ ok: true });
}

export async function addObservableHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const db = c.env.BRIEFINGS_DB;
  if (!db) return serviceUnavailable(c, 'Database not configured');

  const id = c.req.param('id');
  if (!id) return badRequest(c, 'id required');

  const parsed = await safeJsonBody<{ value: string; type: Observable['type']; description?: string; tags?: string[] }>(
    c,
    { maxBytes: 4 * 1024 }
  );
  if ('error' in parsed) return parsed.error;
  const body = parsed.value;
  if (!body.value?.trim() || !body.type) return badRequest(c, 'value and type required');
  await ensureTables(db);

  const existing = await db.prepare('SELECT id FROM investigations WHERE id = ?').bind(id).first();
  if (!existing) return notFound(c, 'investigation not found');

  const observable: Observable = {
    id: crypto.randomUUID(),
    value: body.value.trim(),
    type: body.type,
    description: body.description,
    tags: body.tags ?? [],
    created_at: now(),
  };
  const tl = timelineEntry('observable-added', `Observable ${body.type}:${body.value.trim()} added`);

  await db
    .prepare(
      'INSERT INTO investigation_observables (id, investigation_id, value, type, description, tags, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    .bind(
      observable.id,
      id,
      observable.value,
      observable.type,
      observable.description ?? null,
      JSON.stringify(observable.tags),
      observable.created_at
    )
    .run();
  await db.prepare('UPDATE investigations SET updated_at = ? WHERE id = ?').bind(now(), id).run();
  await db
    .prepare(
      'INSERT INTO investigation_timeline (id, investigation_id, type, message, created_at) VALUES (?, ?, ?, ?, ?)'
    )
    .bind(tl.id, id, tl.type, tl.message, tl.created_at)
    .run();

  return c.json({ observable }, 201);
}

export async function removeObservableHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const db = c.env.BRIEFINGS_DB;
  if (!db) return serviceUnavailable(c, 'Database not configured');

  const id = c.req.param('id');
  const obsId = c.req.param('observableId');
  if (!id || !obsId) return badRequest(c, 'id and observableId required');
  await ensureTables(db);

  const obs = await db
    .prepare('SELECT * FROM investigation_observables WHERE id = ? AND investigation_id = ?')
    .bind(obsId, id)
    .first();
  if (!obs) return notFound(c, 'observable not found');

  const removed = rowToObservable(obs as Record<string, unknown>);
  await db.prepare('DELETE FROM investigation_observables WHERE id = ?').bind(obsId).run();
  await db.prepare('UPDATE investigations SET updated_at = ? WHERE id = ?').bind(now(), id).run();

  const tl = timelineEntry('observable-removed', `Observable ${removed.type}:${removed.value} removed`);
  await db
    .prepare(
      'INSERT INTO investigation_timeline (id, investigation_id, type, message, created_at) VALUES (?, ?, ?, ?, ?)'
    )
    .bind(tl.id, id, tl.type, tl.message, tl.created_at)
    .run();

  return c.json({ ok: true });
}

export async function addTaskHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const db = c.env.BRIEFINGS_DB;
  if (!db) return serviceUnavailable(c, 'Database not configured');

  const id = c.req.param('id');
  if (!id) return badRequest(c, 'id required');

  const parsed = await safeJsonBody<{ title: string; description?: string }>(c, { maxBytes: 4 * 1024 });
  if ('error' in parsed) return parsed.error;
  const body = parsed.value;
  if (!body.title?.trim()) return badRequest(c, 'title required');
  await ensureTables(db);

  const existing = await db.prepare('SELECT id FROM investigations WHERE id = ?').bind(id).first();
  if (!existing) return notFound(c, 'investigation not found');

  const task: Task = {
    id: crypto.randomUUID(),
    title: body.title.trim(),
    description: body.description,
    status: 'pending',
    created_at: now(),
  };
  const tl = timelineEntry('task-added', `Task "${body.title.trim()}" added`);

  await db
    .prepare(
      'INSERT INTO investigation_tasks (id, investigation_id, title, description, status, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .bind(task.id, id, task.title, task.description ?? null, task.status, task.created_at)
    .run();
  await db.prepare('UPDATE investigations SET updated_at = ? WHERE id = ?').bind(now(), id).run();
  await db
    .prepare(
      'INSERT INTO investigation_timeline (id, investigation_id, type, message, created_at) VALUES (?, ?, ?, ?, ?)'
    )
    .bind(tl.id, id, tl.type, tl.message, tl.created_at)
    .run();

  return c.json({ task }, 201);
}

export async function updateTaskHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const db = c.env.BRIEFINGS_DB;
  if (!db) return serviceUnavailable(c, 'Database not configured');

  const id = c.req.param('id');
  const taskId = c.req.param('taskId');
  if (!id || !taskId) return badRequest(c, 'id and taskId required');

  const parsed = await safeJsonBody<{ title?: string; description?: string; status?: Task['status'] }>(c, {
    maxBytes: 4 * 1024,
  });
  if ('error' in parsed) return parsed.error;
  const body = parsed.value;
  await ensureTables(db);

  const taskRow = await db
    .prepare('SELECT * FROM investigation_tasks WHERE id = ? AND investigation_id = ?')
    .bind(taskId, id)
    .first();
  if (!taskRow) return notFound(c, 'task not found');

  const task = rowToTask(taskRow as Record<string, unknown>);
  if (body.title !== undefined) task.title = body.title.trim();
  if (body.description !== undefined) task.description = body.description;
  if (body.status !== undefined && body.status !== task.status) {
    const tl = timelineEntry('task-updated', `Task "${task.title}" marked as ${body.status}`);
    await db
      .prepare(
        'INSERT INTO investigation_timeline (id, investigation_id, type, message, created_at) VALUES (?, ?, ?, ?, ?)'
      )
      .bind(tl.id, id, tl.type, tl.message, tl.created_at)
      .run();
    task.status = body.status;
  }

  await db
    .prepare('UPDATE investigation_tasks SET title = ?, description = ?, status = ? WHERE id = ?')
    .bind(task.title, task.description ?? null, task.status, taskId)
    .run();
  await db.prepare('UPDATE investigations SET updated_at = ? WHERE id = ?').bind(now(), id).run();

  return c.json({ task });
}

export async function addNoteHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const db = c.env.BRIEFINGS_DB;
  if (!db) return serviceUnavailable(c, 'Database not configured');

  const id = c.req.param('id');
  if (!id) return badRequest(c, 'id required');

  const parsed = await safeJsonBody<{ message: string }>(c, { maxBytes: 8 * 1024 });
  if ('error' in parsed) return parsed.error;
  const body = parsed.value;
  if (!body.message?.trim()) return badRequest(c, 'message required');
  await ensureTables(db);

  const existing = await db.prepare('SELECT id FROM investigations WHERE id = ?').bind(id).first();
  if (!existing) return notFound(c, 'investigation not found');

  const tl = timelineEntry('note-added', body.message.trim());
  await db
    .prepare(
      'INSERT INTO investigation_timeline (id, investigation_id, type, message, created_at) VALUES (?, ?, ?, ?, ?)'
    )
    .bind(tl.id, id, tl.type, tl.message, tl.created_at)
    .run();
  await db.prepare('UPDATE investigations SET updated_at = ? WHERE id = ?').bind(now(), id).run();

  return c.json({ ok: true });
}
