import type { Context } from 'hono';
import type { Env } from '../env';
import { badRequest, serviceUnavailable } from '../lib/api-error';
import { safeNullLog } from '../lib/safe-catch';
// Canonical producer key — the watchlist `ioc_sightings` read previously
// hardcoded stale v11 and so was always 0 for every watched domain.
import { LIVE_IOCS_CACHE_KEY } from './live-iocs';

interface Watchlist {
  domains: string[];
  emails: string[];
}

interface DomainStatus {
  domain: string;
  ioc_sightings: number;
  ioc_details: Array<{ value: string; kind: string; source: string }>;
  breach_count: number;
  breach_details: Array<{ name: string; pwn_count?: number; breach_date?: string; data_classes?: string[] }>;
}

interface DashboardData {
  watchlist: Watchlist;
  domains: DomainStatus[];
  generated_at: string;
}

const WATCHLIST_KV_KEY = 'dashboard:watchlist';
const WATCHLIST_CACHE_KEY = 'https://dashboard-watchlist-cache.internal/v1';
const WATCHLIST_CACHE_TTL = 60;

function cacheApi(): Cache | null {
  try {
    return (caches as unknown as { default: Cache }).default;
  } catch {
    return null;
  }
}

async function readWatchlistCached(): Promise<Watchlist | null> {
  const cache = cacheApi();
  if (!cache) return null;
  try {
    const r = await cache.match(WATCHLIST_CACHE_KEY);
    return r ? ((await r.json()) as Watchlist) : null;
  } catch {
    return null;
  }
}

async function writeWatchlistCache(wl: Watchlist): Promise<void> {
  const cache = cacheApi();
  if (!cache) return;
  try {
    await cache.put(
      WATCHLIST_CACHE_KEY,
      new Response(JSON.stringify(wl), {
        headers: { 'content-type': 'application/json', 'cache-control': `max-age=${WATCHLIST_CACHE_TTL}` },
      })
    );
  } catch {
    /* best-effort */
  }
}

async function readWatchlist(kv: KVNamespace): Promise<Watchlist> {
  const cached = await readWatchlistCached();
  if (cached) return cached;
  const raw = await safeNullLog('kv-get-watchlist', kv.get(WATCHLIST_KV_KEY, 'json'));
  const wl = (raw as Watchlist) ?? { domains: [], emails: [] };
  await writeWatchlistCache(wl);
  return wl;
}

async function readCache<T>(key: string): Promise<T | null> {
  try {
    const cache = caches.default;
    const cached = await cache.match(new Request(key));
    if (cached) return (await cached.json()) as T;
  } catch {
    /* miss */
  }
  return null;
}

export async function getWatchlistHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const kv = c.env.KV_CACHE;
  if (!kv) return serviceUnavailable(c, 'KV not available');
  const wl = await readWatchlist(kv);
  return c.json({ watchlist: wl });
}

export async function updateWatchlistHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const kv = c.env.KV_CACHE;
  if (!kv) return serviceUnavailable(c, 'KV not available');
  const body = await c.req.json<{ domains?: unknown[]; emails?: unknown[] }>();
  if (body.domains !== undefined && !Array.isArray(body.domains)) {
    return badRequest(c, 'domains must be an array');
  }
  if (body.emails !== undefined && !Array.isArray(body.emails)) {
    return badRequest(c, 'emails must be an array');
  }
  const wl: Watchlist = {
    domains: (body.domains ?? []).slice(0, 20).map((d: unknown) => String(d).toLowerCase().trim()),
    emails: (body.emails ?? []).slice(0, 20).map((e: unknown) => String(e).toLowerCase().trim()),
  };
  await kv.put(WATCHLIST_KV_KEY, JSON.stringify(wl));
  await writeWatchlistCache(wl);
  return c.json({ ok: true, watchlist: wl });
}

function iocMatchesDomain(value: string, domain: string): boolean {
  const v = value.toLowerCase().trim();
  // exact host or proper subdomain
  if (v === domain || v.endsWith('.' + domain)) return true;
  // url-valued IOC: compare parsed hostname
  try {
    const host = new URL(v.includes('://') ? v : 'http://' + v).hostname;
    return host === domain || host.endsWith('.' + domain);
  } catch {
    return false;
  }
}

export async function dashboardHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const kv = c.env.KV_CACHE;
  if (!kv) return serviceUnavailable(c, 'KV not available');

  const wl = await readWatchlist(kv);
  const results: DomainStatus[] = [];

  // Hoist shared cache reads above the loop — previously these fired
  // per-domain (N×2 cache reads for N domains). The data is identical
  // across iterations; read once and filter in-memory.
  const liveIocs = await readCache<{ items: Array<{ value: string; kind: string; source: string }> }>(
    LIVE_IOCS_CACHE_KEY
  );
  const breaches = await readCache<{
    breaches: Array<{
      name: string;
      title: string;
      domain?: string;
      pwn_count?: number;
      breach_date?: string;
      data_classes?: string[];
    }>;
  }>('https://breach-cache.internal/v6-hibp-only');

  // Check domains against cached threat data
  for (const domain of wl.domains) {
    const domainLower = domain.toLowerCase();

    const domainIocs = (liveIocs?.items ?? []).filter((i) => iocMatchesDomain(i.value, domainLower));

    const domainBreaches = (breaches?.breaches ?? []).filter((b) => b.domain?.toLowerCase() === domainLower);

    results.push({
      domain: domainLower,
      ioc_sightings: domainIocs.length,
      ioc_details: domainIocs.slice(0, 10).map((i) => ({ value: i.value, kind: i.kind, source: i.source })),
      breach_count: domainBreaches.length,
      breach_details: domainBreaches.slice(0, 5).map((b) => ({
        name: b.name,
        pwn_count: b.pwn_count,
        breach_date: b.breach_date,
        data_classes: b.data_classes,
      })),
    });
  }

  const data: DashboardData = {
    watchlist: wl,
    domains: results,
    generated_at: new Date().toISOString(),
  };

  return c.json(data, 200, { 'Cache-Control': 'no-store' });
}
