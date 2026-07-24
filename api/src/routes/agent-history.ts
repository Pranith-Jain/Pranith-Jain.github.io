import type { Context } from 'hono';
import type { Env } from '../env';
import { serviceUnavailable } from '../lib/api-error';
import { getRecentInvestigations, type InvestigationMemoryEntry } from '../lib/agent/investigation-memory';

/**
 * GET /api/v1/agent/history — list recent investigations from memory.
 */
export async function agentHistoryHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const db = (c.env as unknown as { BRIEFINGS_DB?: D1Database }).BRIEFINGS_DB;
  if (!db) return serviceUnavailable(c, 'Database not configured');

  const limit = Math.min(Math.max(parseInt(c.req.query('limit') ?? '20', 10), 1), 100);
  const entries = await getRecentInvestigations(db, limit);

  return c.json({
    count: entries.length,
    entries: entries.map((e: InvestigationMemoryEntry) => ({
      id: e.id,
      query: e.query,
      queryType: e.queryType,
      qualityScore: e.qualityScore,
      modelUsed: e.modelUsed,
      completedAt: e.completedAt,
      iocCount: e.iocs.length,
      actorCount: e.actors.length,
      keyFindings: e.keyFindings.slice(0, 3),
    })),
  });
}
