import { Hono } from 'hono';
import {
  getCloakIndex,
  getCloakTactic,
  getCloakTechnique,
  filterTactics,
  filterTechniques,
} from '../lib/cloak-manifest';

const app = new Hono();

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'public, max-age=300',
};

app.get('/cloak', async (c) => {
  const index = await getCloakIndex();
  if (!index) return c.json({ error: 'CLOAK data unavailable' }, 503);
  const q = c.req.query('q');
  const tactics = filterTactics(index, { q });
  return c.json({ ...index, tacticIndex: tactics }, 200, JSON_HEADERS);
});

app.get('/cloak/tactics/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) return c.json({ error: 'Invalid tactic id' }, 400);
  const tactic = await getCloakTactic(id);
  if (!tactic) return c.json({ error: 'Tactic not found' }, 404);
  const q = c.req.query('q');
  const type = c.req.query('type');
  const techniques = filterTechniques(tactic, { q, type });
  return c.json({ ...tactic, techniques }, 200, JSON_HEADERS);
});

app.get('/cloak/techniques/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) return c.json({ error: 'Invalid technique id' }, 400);
  const technique = await getCloakTechnique(id);
  if (!technique) return c.json({ error: 'Technique not found' }, 404);
  return c.json(technique, 200, JSON_HEADERS);
});

app.get('/cloak/stats', async (c) => {
  const index = await getCloakIndex();
  if (!index) return c.json({ error: 'CLOAK data unavailable' }, 503);
  return c.json({ counts: index.counts, tacticCount: index.tacticIndex.length }, 200, JSON_HEADERS);
});

export default app;
