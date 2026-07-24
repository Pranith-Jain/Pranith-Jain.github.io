/**
 * Dark web OSINT routes — native TorBot + darkdump equivalents.
 *
 *   GET  /darkweb-osint/search?q=...&engines=ahmia,onionland,tor66
 *   GET  /darkweb-osint/crawl?url=...&depth=2&pages=10
 *   GET  /darkweb-osint/scrape?url=...
 *   GET  /darkweb-osint/onion-search?q=...&limit=20
 *   GET  /darkweb-osint/status
 */
import { Hono } from 'hono';
import type { Env } from '../env';
import { darkwebMultiSearch, darkwebCrawl, darkwebScrapeDeep } from '../lib/darkweb-osint';
import { torSearchOnion, onionLookup, btcAbuseCheck, torExitCheck } from '../lib/darknet';

export const darkwebOsintRouter = new Hono<{ Bindings: Env }>();

// ─── Status ───────────────────────────────────────────────────────────────
darkwebOsintRouter.get('/darkweb-osint/status', (c) => {
  return c.json({
    status: 'active',
    engines: ['ahmia', 'onionland', 'tor66', 'darkweblink'],
    features: [
      'multi-engine_search',
      'depth_limited_crawl',
      'link_tree_extraction',
      'email_harvesting',
      'onion_metadata',
      'deep_scrape',
      'onion_lookup',
      'btc_abuse_check',
      'tor_exit_check',
    ],
    max_crawl_depth: 3,
    max_crawl_pages: 20,
    access_method: 'tor2web_gateways',
    note: 'Uses clearnet tor2web gateways. For full Tor anonymity, run a local daemon.',
  });
});

// ─── Multi-engine search (darkdump -q equivalent) ────────────────────────
darkwebOsintRouter.get('/darkweb-osint/search', async (c) => {
  const q = c.req.query('q');
  if (!q) return c.json({ error: 'q parameter required' }, 400);

  const enginesParam = c.req.query('engines');
  const engines = enginesParam
    ? enginesParam
        .split(',')
        .map((e) => e.trim())
        .filter(Boolean)
    : ['ahmia', 'onionland', 'tor66', 'darkweblink'];
  const limit = Math.min(Math.max(parseInt(c.req.query('limit') ?? '20', 10), 1), 50);

  try {
    const result = await darkwebMultiSearch(q, engines, limit);
    return c.json(result);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'search failed' }, 500);
  }
});

// ─── Depth-limited crawl (TorBot BFS) ────────────────────────────────────
darkwebOsintRouter.get('/darkweb-osint/crawl', async (c) => {
  const url = c.req.query('url');
  if (!url) return c.json({ error: 'url parameter required (.onion address)' }, 400);

  const depth = Math.min(Math.max(parseInt(c.req.query('depth') ?? '2', 10), 0), 3);
  const pages = Math.min(Math.max(parseInt(c.req.query('pages') ?? '10', 10), 1), 20);
  const extractEmails = c.req.query('emails') !== 'false';

  try {
    const tree = await darkwebCrawl(url, { maxDepth: depth, maxPages: pages, extractEmails });
    return c.json(tree);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'crawl failed' }, 500);
  }
});

// ─── Deep scrape single page (darkdump -s equivalent) ────────────────────
darkwebOsintRouter.get('/darkweb-osint/scrape', async (c) => {
  const url = c.req.query('url');
  if (!url) return c.json({ error: 'url parameter required (.onion address)' }, 400);

  try {
    const result = await darkwebScrapeDeep(url);
    return c.json(result);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'scrape failed' }, 500);
  }
});

// ─── Ahmia search alias (used by existing DarkWebRecon) ──────────────────
darkwebOsintRouter.get('/darkweb-osint/onion-search', async (c) => {
  const q = c.req.query('q');
  if (!q) return c.json({ error: 'q parameter required' }, 400);
  const limit = Math.min(Math.max(parseInt(c.req.query('limit') ?? '20', 10), 1), 100);

  try {
    const results = await torSearchOnion(q, limit);
    return c.json({ query: q, count: results.length, results });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'search failed' }, 500);
  }
});

// ─── Onion lookup (CIRCL AIL) ────────────────────────────────────────────
darkwebOsintRouter.get('/darkweb-osint/onion-lookup', async (c) => {
  const address = c.req.query('address');
  if (!address) return c.json({ error: 'address parameter required' }, 400);
  try {
    const result = await onionLookup(address);
    return c.json(result);
  } catch (e) {
    return c.json({
      address: address.trim().toLowerCase(),
      status: 'unavailable',
      first_seen: null,
      last_seen: null,
      error: e instanceof Error ? e.message : 'lookup failed',
    });
  }
});

// ─── BTC abuse check ─────────────────────────────────────────────────────
darkwebOsintRouter.get('/darkweb-osint/btc-check', async (c) => {
  const address = c.req.query('address');
  if (!address) return c.json({ error: 'address parameter required' }, 400);
  try {
    const result = await btcAbuseCheck(address, c.env.CHAINABUSE_API_KEY);
    return c.json(result);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'BTC check failed' }, 500);
  }
});

// ─── Tor exit check ──────────────────────────────────────────────────────
darkwebOsintRouter.get('/darkweb-osint/tor-exit', async (c) => {
  const ip = c.req.query('ip');
  if (!ip) return c.json({ error: 'ip parameter required' }, 400);
  try {
    const result = await torExitCheck(ip, c.env.KV_CACHE);
    return c.json(result);
  } catch (e) {
    return c.json({
      isTorExit: false,
      ip,
      error: 'upstream_unavailable',
      message: `Tor exit list temporarily unavailable: ${e instanceof Error ? e.message : 'unknown'}`,
    });
  }
});
