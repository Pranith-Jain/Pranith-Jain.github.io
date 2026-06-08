/**
 * Playbook Engine API Routes
 *
 * GET    /api/v1/playbooks           — List playbooks
 * POST   /api/v1/playbooks           — Create playbook
 * GET    /api/v1/playbooks/:id       — Get playbook
 * PATCH  /api/v1/playbooks/:id       — Update playbook
 * DELETE /api/v1/playbooks/:id       — Delete playbook
 * POST   /api/v1/playbooks/:id/execute — Start execution
 * GET    /api/v1/playbooks/:id/executions — List executions
 * GET    /api/v1/playbooks/executions/:eid — Get execution
 * POST   /api/v1/playbooks/seed-templates — Seed default templates
 */

import { Hono } from 'hono';
import type { Env } from '../env';
import {
  createPlaybook, getPlaybook, listPlaybooks, updatePlaybook, deletePlaybook,
  startExecution, getExecution, listExecutions,
  PLAYBOOK_SCHEMA_SQL, seedPlaybookTemplates,
} from '../lib/playbook-engine';

const playbooks = new Hono<{ Bindings: Env }>();

playbooks.post('/api/v1/playbooks/init', async (c) => {
  const statements = PLAYBOOK_SCHEMA_SQL.split(';').filter((s) => s.trim());
  for (const sql of statements) { if (sql.trim()) await c.env.DB.prepare(sql).run(); }
  return c.json({ ok: true });
});

playbooks.post('/api/v1/playbooks/seed-templates', async (c) => {
  const count = await seedPlaybookTemplates(c.env.DB);
  return c.json({ seeded: count });
});

playbooks.post('/api/v1/playbooks', async (c) => {
  const body = await c.req.json();
  if (!body.name) return c.json({ error: 'name is required' }, 400);
  const created = await createPlaybook(c.env.DB, { ...body, created_by: body.created_by ?? 'analyst' });
  return c.json(created, 201);
});

playbooks.get('/api/v1/playbooks', async (c) => {
  const status = c.req.query('status') as any;
  const category = c.req.query('category');
  const limit = Number(c.req.query('limit') ?? 50);
  const result = await listPlaybooks(c.env.DB, { status, category, limit });
  return c.json(result);
});

playbooks.get('/api/v1/playbooks/:id', async (c) => {
  const found = await getPlaybook(c.env.DB, c.req.param('id'));
  if (!found) return c.json({ error: 'Not found' }, 404);
  return c.json(found);
});

playbooks.patch('/api/v1/playbooks/:id', async (c) => {
  const updated = await updatePlaybook(c.env.DB, c.req.param('id'), await c.req.json());
  if (!updated) return c.json({ error: 'Not found' }, 404);
  return c.json(updated);
});

playbooks.delete('/api/v1/playbooks/:id', async (c) => {
  const deleted = await deletePlaybook(c.env.DB, c.req.param('id'));
  if (!deleted) return c.json({ error: 'Not found' }, 404);
  return c.json({ ok: true });
});

playbooks.post('/api/v1/playbooks/:id/execute', async (c) => {
  try {
    const body = await c.req.json();
    const execution = await startExecution(c.env.DB, c.req.param('id'), body.inputs ?? {}, body.triggered_by ?? 'analyst');
    return c.json(execution, 201);
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
});

playbooks.get('/api/v1/playbooks/:id/executions', async (c) => {
  const executions = await listExecutions(c.env.DB, c.req.param('id'));
  return c.json(executions);
});

playbooks.get('/api/v1/playbooks/executions/:eid', async (c) => {
  const found = await getExecution(c.env.DB, c.req.param('eid'));
  if (!found) return c.json({ error: 'Not found' }, 404);
  return c.json(found);
});

export default playbooks;
