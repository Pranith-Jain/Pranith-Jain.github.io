/**
 * Threat Monitor — minimal RSS proxy endpoint.
 * The detection engine, APT groups, and techniques run client-side.
 * This endpoint just proxies RSS feed fetches to avoid CORS issues.
 */
import { Hono } from 'hono';
import type { Env } from '../env';

export const threatMonitorRouter = new Hono<{ Bindings: Env }>();

// Proxy RSS feed fetch (avoids CORS in browser)
threatMonitorRouter.get('/threat-monitor/proxy', async (c) => {
  const url = c.req.query('url');
  if (!url) return c.json({ error: 'url required' }, 400);
  try {
    const u = new URL(url);
    if (!u.protocol.startsWith('http')) return c.json({ error: 'invalid protocol' }, 400);
    const res = await fetch(url, {
      headers: { 'User-Agent': 'GlobalThreatActorMonitor/1.0' },
      signal: AbortSignal.timeout(15000),
    });
    return new Response(await res.text(), {
      headers: {
        'Content-Type': res.headers.get('Content-Type') ?? 'application/xml',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

// Config endpoint
threatMonitorRouter.get('/threat-monitor/config', (c) =>
  c.json({
    proxyUrl: '/api/v1/threat-monitor/proxy',
    aptGroups: 40,
    techniques: 29,
    killChainStages: 7,
    osintFeeds: 30,
  })
);
