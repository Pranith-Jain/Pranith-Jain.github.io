/**
 * Network signal analytics REST surface — C2 beacon periodicity + DNS
 * tunneling heuristics over pre-parsed telemetry (JSON in, score out).
 *
 * POST /net-analytics/beacon      { timestamps[], destination?, bytes? }
 * POST /net-analytics/dns-tunnel  { queries[], zone? }
 * GET  /net-analytics/meta
 */
import { Hono } from 'hono';
import type { Env } from '../env';
import { logError } from '../lib/logger';
import { badRequest, internalError } from '../lib/api-error';
import { detectBeacon, analyzeDnsTunnel } from '../lib/net-analytics';

export const netAnalyticsRouter = new Hono<{ Bindings: Env }>();

netAnalyticsRouter.post('/net-analytics/beacon', async (c) => {
  try {
    const body = await c.req.json<{ timestamps?: unknown; destination?: unknown; bytes?: unknown }>().catch(() => ({} as Record<string, unknown>));
    const ts = body.timestamps;
    if (!Array.isArray(ts)) return badRequest(c, 'timestamps must be an array of epoch-ms numbers or ISO strings');
    if (ts.length > 50_000) return badRequest(c, 'too many timestamps (max 50000)');
    const bytes = Array.isArray(body.bytes)
      ? (body.bytes as unknown[]).map(Number).filter((n) => Number.isFinite(n))
      : undefined;
    const result = detectBeacon({
      timestamps: ts as Array<number | string>,
      ...(typeof body.destination === 'string' ? { destination: body.destination } : {}),
      ...(bytes && bytes.length ? { bytes } : {}),
    });
    return c.json(result);
  } catch (e) {
    logError('beacon analysis failed', e);
    return internalError(c, `beacon_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

netAnalyticsRouter.post('/net-analytics/dns-tunnel', async (c) => {
  try {
    const body = await c.req.json<{ queries?: unknown; zone?: unknown }>().catch(() => ({} as Record<string, unknown>));
    if (!Array.isArray(body.queries)) return badRequest(c, 'queries must be an array of DNS query names');
    if ((body.queries as unknown[]).length > 100_000) return badRequest(c, 'too many queries (max 100000)');
    const result = analyzeDnsTunnel({
      queries: (body.queries as unknown[]).map(String),
      ...(typeof body.zone === 'string' ? { zone: body.zone } : {}),
    });
    return c.json(result);
  } catch (e) {
    logError('dns tunnel analysis failed', e);
    return internalError(c, `dns_tunnel_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

netAnalyticsRouter.get('/net-analytics/meta', (c) => {
  return c.json({
    endpoints: ['/net-analytics/beacon', '/net-analytics/dns-tunnel'],
    beacon: {
      input: 'timestamps (epoch ms or ISO), optional destination + per-connection bytes',
      output: 'beaconScore 0-100, jitter ratio, verdict regular|moderately_regular|irregular',
    },
    dns_tunnel: {
      input: 'queries[] + optional zone',
      output: 'tunnelScore 0-100, label length/entropy stats, verdict likely_tunnel|suspicious|normal',
    },
  });
});
