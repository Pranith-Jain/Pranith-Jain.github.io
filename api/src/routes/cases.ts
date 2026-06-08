/**
 * Case Management API Routes
 *
 * POST   /api/v1/cases                    — Create case
 * GET    /api/v1/cases                    — List cases
 * GET    /api/v1/cases/:id                — Get case
 * PATCH  /api/v1/cases/:id                — Update case
 * DELETE /api/v1/cases/:id                — Delete case
 * GET    /api/v1/cases/:id/evidence       — List evidence
 * POST   /api/v1/cases/:id/evidence       — Add evidence
 * PATCH  /api/v1/cases/:id/evidence/:eid  — Update evidence custody
 * GET    /api/v1/cases/:id/timeline       — Get timeline
 * POST   /api/v1/cases/:id/timeline       — Add timeline event
 * GET    /api/v1/cases/:id/notes          — List notes
 * POST   /api/v1/cases/:id/notes          — Add note
 * DELETE /api/v1/cases/:id/notes/:nid     — Delete note
 * GET    /api/v1/cases/:id/iocs           — List case IOCs
 * POST   /api/v1/cases/:id/iocs           — Add case IOC
 * PATCH  /api/v1/cases/:id/iocs/:iid      — Update IOC status
 * GET    /api/v1/cases/stats              — Dashboard stats
 */

import { Hono } from 'hono';
import type { Env } from '../env';
import {
  createCase,
  getCase,
  listCases,
  updateCase,
  deleteCase,
  addEvidence,
  getCaseEvidence,
  updateEvidenceCustody,
  addTimelineEvent,
  getCaseTimeline,
  addNote,
  getCaseNotes,
  deleteNote,
  addCaseIOC,
  getCaseIOCs,
  updateCaseIOCStatus,
  getCaseStats,
  CASE_SCHEMA_SQL,
  type CaseStatus,
  type CaseSeverity,
  type CaseType,
} from '../lib/case-manager';

const cases = new Hono<{ Bindings: Env }>();

/* ─── Schema initialization ──────────────────────────────────────────────── */

cases.post('/api/v1/cases/init', async (c) => {
  const db = c.env.DB;
  const statements = CASE_SCHEMA_SQL.split(';').filter((s) => s.trim());
  for (const sql of statements) {
    if (sql.trim()) await db.prepare(sql).run();
  }
  return c.json({ ok: true });
});

/* ─── Stats (must be before /:id) ────────────────────────────────────────── */

cases.get('/api/v1/cases/stats', async (c) => {
  const stats = await getCaseStats(c.env.DB);
  return c.json(stats);
});

/* ─── Case CRUD ──────────────────────────────────────────────────────────── */

cases.post('/api/v1/cases', async (c) => {
  const body = await c.req.json();
  if (!body.title) return c.json({ error: 'title is required' }, 400);
  if (!body.severity) return c.json({ error: 'severity is required' }, 400);
  if (!body.type) return c.json({ error: 'type is required' }, 400);

  const created = await createCase(c.env.DB, body, body.created_by ?? 'analyst');
  return c.json(created, 201);
});

cases.get('/api/v1/cases', async (c) => {
  const status = c.req.query('status') as CaseStatus | undefined;
  const severity = c.req.query('severity') as CaseSeverity | undefined;
  const type = c.req.query('type') as CaseType | undefined;
  const assigned = c.req.query('assigned_to');
  const limit = Number(c.req.query('limit') ?? 50);
  const offset = Number(c.req.query('offset') ?? 0);

  const result = await listCases(c.env.DB, { status, severity, type, assigned_to: assigned, limit, offset });
  return c.json(result);
});

cases.get('/api/v1/cases/:id', async (c) => {
  const id = c.req.param('id');
  const found = await getCase(c.env.DB, id);
  if (!found) return c.json({ error: 'Case not found' }, 404);
  return c.json(found);
});

cases.patch('/api/v1/cases/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const updated = await updateCase(c.env.DB, id, body);
  if (!updated) return c.json({ error: 'Case not found' }, 404);
  return c.json(updated);
});

cases.delete('/api/v1/cases/:id', async (c) => {
  const id = c.req.param('id');
  const deleted = await deleteCase(c.env.DB, id);
  if (!deleted) return c.json({ error: 'Case not found' }, 404);
  return c.json({ ok: true });
});

/* ─── Evidence ───────────────────────────────────────────────────────────── */

cases.get('/api/v1/cases/:id/evidence', async (c) => {
  const id = c.req.param('id');
  const evidence = await getCaseEvidence(c.env.DB, id);
  return c.json(evidence);
});

cases.post('/api/v1/cases/:id/evidence', async (c) => {
  const caseId = c.req.param('id');
  const body = await c.req.json();
  if (!body.name) return c.json({ error: 'name is required' }, 400);
  if (!body.type) return c.json({ error: 'type is required' }, 400);

  const created = await addEvidence(c.env.DB, caseId, body, body.collected_by ?? 'analyst');
  return c.json(created, 201);
});

cases.patch('/api/v1/cases/:id/evidence/:eid', async (c) => {
  const eid = c.req.param('eid');
  const body = await c.req.json();
  if (!body.action || !body.by) return c.json({ error: 'action and by are required' }, 400);

  const ok = await updateEvidenceCustody(c.env.DB, eid, {
    action: body.action,
    by: body.by,
    at: new Date().toISOString(),
    notes: body.notes ?? '',
  });
  if (!ok) return c.json({ error: 'Evidence not found' }, 404);
  return c.json({ ok: true });
});

/* ─── Timeline ───────────────────────────────────────────────────────────── */

cases.get('/api/v1/cases/:id/timeline', async (c) => {
  const id = c.req.param('id');
  const limit = Number(c.req.query('limit') ?? 200);
  const events = await getCaseTimeline(c.env.DB, id, limit);
  return c.json(events);
});

cases.post('/api/v1/cases/:id/timeline', async (c) => {
  const caseId = c.req.param('id');
  const body = await c.req.json();
  if (!body.title) return c.json({ error: 'title is required' }, 400);

  const event = await addTimelineEvent(c.env.DB, {
    case_id: caseId,
    timestamp: body.timestamp ?? new Date().toISOString(),
    event_type: body.event_type ?? 'note',
    title: body.title,
    description: body.description ?? '',
    analyst: body.analyst ?? 'analyst',
    iocs: body.iocs,
    mitre_techniques: body.mitre_techniques,
    evidence_refs: body.evidence_refs,
  });
  return c.json(event, 201);
});

/* ─── Notes ──────────────────────────────────────────────────────────────── */

cases.get('/api/v1/cases/:id/notes', async (c) => {
  const id = c.req.param('id');
  const notes = await getCaseNotes(c.env.DB, id);
  return c.json(notes);
});

cases.post('/api/v1/cases/:id/notes', async (c) => {
  const caseId = c.req.param('id');
  const body = await c.req.json();
  if (!body.content) return c.json({ error: 'content is required' }, 400);

  const note = await addNote(c.env.DB, caseId, body.author ?? 'analyst', body.content, body.pinned);
  return c.json(note, 201);
});

cases.delete('/api/v1/cases/:id/notes/:nid', async (c) => {
  const nid = c.req.param('nid');
  const deleted = await deleteNote(c.env.DB, nid);
  if (!deleted) return c.json({ error: 'Note not found' }, 404);
  return c.json({ ok: true });
});

/* ─── Case IOCs ──────────────────────────────────────────────────────────── */

cases.get('/api/v1/cases/:id/iocs', async (c) => {
  const id = c.req.param('id');
  const iocs = await getCaseIOCs(c.env.DB, id);
  return c.json(iocs);
});

cases.post('/api/v1/cases/:id/iocs', async (c) => {
  const caseId = c.req.param('id');
  const body = await c.req.json();
  if (!body.indicator_type) return c.json({ error: 'indicator_type is required' }, 400);
  if (!body.value) return c.json({ error: 'value is required' }, 400);

  const ioc = await addCaseIOC(c.env.DB, caseId, body);
  return c.json(ioc, 201);
});

cases.patch('/api/v1/cases/:id/iocs/:iid', async (c) => {
  const iid = c.req.param('iid');
  const body = await c.req.json();
  if (!body.status) return c.json({ error: 'status is required' }, 400);

  const ok = await updateCaseIOCStatus(c.env.DB, iid, body.status);
  if (!ok) return c.json({ error: 'IOC not found' }, 404);
  return c.json({ ok: true });
});

export default cases;
