import type { Context } from 'hono';
import type { Env } from '../env';
import {
  torStatus,
  torFetchOnion,
  torScrapeOnion,
  torSearchOnion,
  torExitNodes,
  torExitCheck,
  torExitDetails,
  onionLookup,
  btcAbuseCheck,
} from '../lib/darknet';

export async function torStatusHandler(c: Context<{ Bindings: Env }>) {
  const r = await torStatus();
  return c.json(r);
}

export async function torFetchOnionHandler(c: Context<{ Bindings: Env }>) {
  const url = c.req.query('url');
  if (!url) return c.json({ error: 'missing_url', message: '?url= parameter is required' }, 400);
  const gateway = parseInt(c.req.query('gateway') ?? '0', 10);
  const r = await torFetchOnion(url, isNaN(gateway) ? 0 : Math.min(Math.max(gateway, 0), 3));
  return c.json(r);
}

export async function torScrapeOnionHandler(c: Context<{ Bindings: Env }>) {
  const url = c.req.query('url');
  if (!url) return c.json({ error: 'missing_url', message: '?url= parameter is required' }, 400);
  const gateway = parseInt(c.req.query('gateway') ?? '0', 10);
  const r = await torScrapeOnion(url, isNaN(gateway) ? 0 : Math.min(Math.max(gateway, 0), 3));
  return c.json(r);
}

export async function torSearchOnionHandler(c: Context<{ Bindings: Env }>) {
  const q = c.req.query('q');
  if (!q) return c.json({ error: 'missing_q', message: '?q= parameter is required' }, 400);
  const limit = parseInt(c.req.query('limit') ?? '20', 10);
  const r = await torSearchOnion(q, isNaN(limit) ? 20 : Math.min(Math.max(limit, 1), 100));
  return c.json({ query: q, count: r.length, results: r });
}

export async function torExitNodesHandler(c: Context<{ Bindings: Env }>) {
  const limitStr = c.req.query('limit');
  const limit = limitStr ? parseInt(limitStr, 10) : undefined;
  try {
    const ips = await torExitNodes(isNaN(limit ?? 0) ? undefined : limit, c.env.KV_CACHE);
    return c.json({ count: ips.length, ips });
  } catch (err) {
    return c.json(
      {
        error: 'upstream_unavailable',
        message: `Tor exit list unavailable: ${err instanceof Error ? err.message : 'unknown'}`,
      },
      502
    );
  }
}

export async function torExitCheckHandler(c: Context<{ Bindings: Env }>) {
  const ip = c.req.query('ip');
  if (!ip) return c.json({ error: 'missing_ip', message: '?ip= parameter is required' }, 400);
  try {
    const r = await torExitCheck(ip, c.env.KV_CACHE);
    return c.json(r);
  } catch (err) {
    return c.json({
      isTorExit: false,
      ip,
      error: 'upstream_unavailable',
      message: `Tor exit list temporarily unavailable: ${err instanceof Error ? err.message : 'unknown'}`,
    });
  }
}

export async function torExitDetailsHandler(c: Context<{ Bindings: Env }>) {
  const limitStr = c.req.query('limit');
  const limit = limitStr ? parseInt(limitStr, 10) : undefined;
  const r = await torExitDetails(isNaN(limit ?? 0) ? undefined : limit);
  return c.json({ count: r.length, exits: r });
}

export async function onionLookupHandler(c: Context<{ Bindings: Env }>) {
  const address = c.req.query('address');
  if (!address) return c.json({ error: 'missing_address', message: '?address= parameter is required' }, 400);
  try {
    const r = await onionLookup(address);
    return c.json(r);
  } catch (err) {
    console.error('onionLookupHandler failed:', err instanceof Error ? err.message : String(err));
    // CIRCL (the upstream onion-intel provider) is intermittently down / rate-
    // limited and returns non-2xx for some addresses. Degrade gracefully with a
    // 200 "unavailable" result so the Dark Web Recon page renders an empty card
    // instead of a hard "upstream error". The shape mirrors onionLookup's
    // not_found case so the frontend renders it unchanged.
    const hostname = address.trim().toLowerCase();
    return c.json({
      address: hostname,
      first_seen: null,
      last_seen: null,
      last_check: null,
      status: 'unavailable',
      tags: [],
      pgp: [],
      certificates: [],
      ports: [],
      title: null,
      bitcoin_addresses: [],
      note: `onion lookup temporarily unavailable: ${err instanceof Error ? err.message : 'upstream error'}`,
    });
  }
}

export async function btcAbuseCheckHandler(c: Context<{ Bindings: Env }>) {
  const address = c.req.query('address');
  if (!address) return c.json({ error: 'missing_address', message: '?address= parameter is required' }, 400);
  const r = await btcAbuseCheck(address, c.env.CHAINABUSE_API_KEY);
  return c.json(r);
}
