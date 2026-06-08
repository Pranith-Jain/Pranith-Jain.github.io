import { Hono } from 'hono';
import type { Env } from '../env';
import { createHunt, getHunt, listHunts, updateHunt, addFinding, getHuntFindings, HUNT_SCHEMA, HUNT_TEMPLATES } from '../lib/hunting-framework';

const hunts = new Hono<{ Bindings: Env }>();

hunts.post('/api/v1/hunts/init', async (c) => {
  const statements = HUNT_SCHEMA.split(';').filter((s) => s.trim());
  for (const sql of statements) { if (sql.trim()) await c.env.DB.prepare(sql).run(); }
  return c.json({ ok: true });
});

hunts.get('/api/v1/hunts/templates', (c) => c.json(HUNT_TEMPLATES));

hunts.post('/api/v1/hunts', async (c) => {
  const body = await c.req.json();
  if (!body.title || !body.hypothesis) return c.json({ error: 'title and hypothesis required' }, 400);
  const created = await createHunt(c.env.DB, { ...body, created_by: body.created_by ?? 'analyst' });
  return c.json(created, 201);
});

hunts.get('/api/v1/hunts', async (c) => {
  const status = c.req.query('status') as any;
  const result = await listHunts(c.env.DB, { status, limit: Number(c.req.query('limit') ?? 50) });
  return c.json(result);
});

hunts.get('/api/v1/hunts/:id', async (c) => {
  const found = await getHunt(c.env.DB, c.req.param('id'));
  if (!found) return c.json({ error: 'Not found' }, 404);
  return c.json(found);
});

hunts.patch('/api/v1/hunts/:id', async (c) => {
  const updated = await updateHunt(c.env.DB, c.req.param('id'), await c.req.json());
  if (!updated) return c.json({ error: 'Not found' }, 404);
  return c.json(updated);
});

hunts.post('/api/v1/hunts/:id/findings', async (c) => {
  const body = await c.req.json();
  if (!body.title) return c.json({ error: 'title required' }, 400);
  const finding = await addFinding(c.env.DB, c.req.param('id'), body);
  return c.json(finding, 201);
});

hunts.get('/api/v1/hunts/:id/findings', async (c) => {
  const findings = await getHuntFindings(c.env.DB, c.req.param('id'));
  return c.json(findings);
});

export default hunts;
