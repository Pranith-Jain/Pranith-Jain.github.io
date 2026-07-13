import type { Context } from 'hono';
import type { Env } from '../env';
import { safeErrorMessage } from '../lib/error';
import { aggregateHostIntel, isValidIpv4 } from '../lib/host-intel';

/**
 * GET /api/v1/host?ip=… — etugen.io-style exposed-host view for an IPv4.
 * Live data only (Shodan InternetDB + ipinfo + LeakIX). Cached 30 min.
 */
export async function hostIntelHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const ip = c.req.query('ip')?.trim();
  if (!ip) return c.json({ error: 'missing ip' }, 400);
  if (!isValidIpv4(ip)) return c.json({ error: 'invalid ipv4' }, 400);

  try {
    const result = await aggregateHostIntel(
      ip,
      { IPINFO_TOKEN: c.env.IPINFO_TOKEN, SHODAN_API_KEY: c.env.SHODAN_API_KEY },
      new Date().toISOString()
    );
    // Live data — cache 30 min at the edge to stay within the source rate limits.
    return c.json(result, 200, { 'Cache-Control': 'public, max-age=1800' });
  } catch (err) {
    console.error('hostIntelHandler failed:', err instanceof Error ? err.message : String(err));
    return c.json({ error: safeErrorMessage(c.env as never, err) }, 502, { 'Cache-Control': 'no-store' });
  }
}
