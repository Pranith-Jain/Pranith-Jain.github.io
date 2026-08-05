import type { Context } from 'hono';
import type { Env } from '../env';
import { logError } from '../lib/logger';
import { badRequest, notFound, internalError, badGateway, serviceUnavailable, tooManyRequests, conflict, payloadTooLarge } from '../lib/api-error';
import { safeErrorMessage } from '../lib/error';
import { aggregateHostIntel, isValidIpv4 } from '../lib/host-intel';

/**
 * GET /api/v1/host?ip=… — etugen.io-style exposed-host view for an IPv4.
 * Live data only (Shodan InternetDB + ipinfo + LeakIX). Cached 30 min.
 */
export async function hostIntelHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const ip = c.req.query('ip')?.trim();
  if (!ip) return badRequest(c, 'missing ip');
  if (!isValidIpv4(ip)) return badRequest(c, 'invalid ipv4');

  try {
    const result = await aggregateHostIntel(
      ip,
      { IPINFO_TOKEN: c.env.IPINFO_TOKEN, SHODAN_API_KEY: c.env.SHODAN_API_KEY },
      new Date().toISOString()
    );
    // Live data — cache 30 min at the edge to stay within the source rate limits.
    return c.json(result, 200, { 'Cache-Control': 'public, max-age=1800' });
  } catch (err) {
    logError('hostIntelHandler failed', err);
    return badGateway(c, safeErrorMessage(c.env as never, err));
  }
}
