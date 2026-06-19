import type { Context } from 'hono';
import type { Env } from '../env';
import {
  queryPassiveDns,
  reverseLookup,
  findInfrastructureOverlap,
  getPassiveDnsStats,
  ensurePassiveDnsTables,
  type PassiveDnsEnv,
} from '../lib/passive-dns';

/**
 * Passive DNS Correlation Engine — HTTP handlers.
 *
 * Main handler:
 *   GET /api/v1/passive-dns?query=<domain|ip>&force=1
 *
 * Sub-routes registered in index.ts:
 *   GET /api/v1/passive-dns/reverse?ip=<ip>
 *   GET /api/v1/passive-dns/overlap?domains=a.com,b.com,c.com
 *   GET /api/v1/passive-dns/stats
 */

export async function passiveDnsLookupHandler(c: Context): Promise<Response> {
  const query = c.req.query('query')?.trim();
  if (!query) return c.json({ error: 'query parameter required' }, 400);
  if (query.length > 253) return c.json({ error: 'query too long' }, 400);

  const force = c.req.query('force') === '1';
  const db = c.env.BRIEFINGS_DB;
  if (!db) return c.json({ error: 'database not available' }, 503);

  const env: PassiveDnsEnv = {
    VT_API_KEY: c.env.VT_API_KEY,
    URLSCAN_API_KEY: c.env.URLSCAN_API_KEY,
  };

  const result = await queryPassiveDns(db, query, env, { forceRefresh: force });
  return c.json(result);
}

export async function passiveDnsReverseHandler(c: Context): Promise<Response> {
  const ip = c.req.query('ip')?.trim();
  if (!ip) return c.json({ error: 'ip parameter required' }, 400);

  const db = c.env.BRIEFINGS_DB;
  if (!db) return c.json({ error: 'database not available' }, 503);

  const results = await reverseLookup(db, ip);
  return c.json({ ip, domains: results, count: results.length });
}

export async function passiveDnsOverlapHandler(c: Context): Promise<Response> {
  const domainsParam = c.req.query('domains')?.trim();
  if (!domainsParam) return c.json({ error: 'domains parameter required (comma-separated)' }, 400);

  const domains = domainsParam.split(',').map((d) => d.trim()).filter(Boolean);
  if (domains.length < 2) return c.json({ error: 'at least 2 domains required' }, 400);

  const db = c.env.BRIEFINGS_DB;
  if (!db) return c.json({ error: 'database not available' }, 503);

  const results = await findInfrastructureOverlap(db, domains);
  return c.json({ domains, overlaps: results, count: results.length });
}

export async function passiveDnsStatsHandler(c: Context): Promise<Response> {
  const db = c.env.BRIEFINGS_DB;
  if (!db) return c.json({ error: 'database not available' }, 503);

  await ensurePassiveDnsTables(db);
  const stats = await getPassiveDnsStats(db);
  return c.json(stats);
}
