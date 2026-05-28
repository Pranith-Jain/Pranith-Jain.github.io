import type { Context } from 'hono';
import type { Env } from '../env';
import { lookupCve, __resetKevCache } from '../lib/cve-lookup';

const CVE_RE = /^CVE-\d{4}-\d{4,7}$/i;

export { __resetKevCache as resetKevCache, __resetKevCache };

export async function cveSearchHandler(c: Context<{ Bindings: Env }>) {
  const id = c.req.query('id');
  if (!id) return c.json({ error: 'missing_id', message: 'Provide ?id=CVE-YYYY-NNNN' }, 400);
  if (!CVE_RE.test(id)) return c.json({ error: 'invalid_id', message: 'CVE id must match CVE-YYYY-NNNN[NNN]' }, 400);

  const result = await lookupCve(id.toUpperCase());
  if (!result.ok) {
    return c.json({ error: 'unavailable', message: result.error }, 404);
  }

  return c.json(result.data, 200, { 'Cache-Control': 'public, max-age=1800, s-maxage=3600' });
}
