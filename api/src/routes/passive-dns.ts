import type { Context } from 'hono';
import { badRequest, serviceUnavailable } from '../lib/api-error';
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
  if (!query) return badRequest(c, 'query parameter required');
  if (query.length > 253) return badRequest(c, 'query too long');

  const force = c.req.query('force') === '1';
  const db = c.env.BRIEFINGS_DB;
  if (!db) return serviceUnavailable(c, 'database not available');

  const env: PassiveDnsEnv = {
    VT_API_KEY: c.env.VT_API_KEY,
    URLSCAN_API_KEY: c.env.URLSCAN_API_KEY,
  };

  const result = await queryPassiveDns(db, query, env, { forceRefresh: force });
  return c.json(result);
}

export async function passiveDnsReverseHandler(c: Context): Promise<Response> {
  const ip = c.req.query('ip')?.trim();
  if (!ip) return badRequest(c, 'ip parameter required');

  const db = c.env.BRIEFINGS_DB;
  if (!db) return serviceUnavailable(c, 'database not available');

  const results = await reverseLookup(db, ip);
  return c.json({ ip, domains: results, count: results.length });
}

export async function passiveDnsOverlapHandler(c: Context): Promise<Response> {
  const domainsParam = c.req.query('domains')?.trim();
  if (!domainsParam) return badRequest(c, 'domains parameter required (comma-separated)');

  const domains = domainsParam
    .split(',')
    .map((d) => d.trim())
    .filter(Boolean);
  if (domains.length < 2) return badRequest(c, 'at least 2 domains required');

  const db = c.env.BRIEFINGS_DB;
  if (!db) return serviceUnavailable(c, 'database not available');

  const results = await findInfrastructureOverlap(db, domains);
  return c.json({ domains, overlaps: results, count: results.length });
}

export async function passiveDnsStatsHandler(c: Context): Promise<Response> {
  const db = c.env.BRIEFINGS_DB;
  if (!db) return serviceUnavailable(c, 'database not available');

  await ensurePassiveDnsTables(db);
  const stats = await getPassiveDnsStats(db);
  return c.json(stats);
}
