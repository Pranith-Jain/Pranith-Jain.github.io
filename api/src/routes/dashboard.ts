import type { Context } from 'hono';
import type { Env } from '../env';

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

async function readWatchlist(kv: KVNamespace): Promise<Watchlist> {
  const raw = await kv.get(WATCHLIST_KV_KEY, 'json').catch(() => null);
  return (raw as Watchlist) ?? { domains: [], emails: [] };
}

async function readCache<T>(key: string): Promise<T | null> {
  try {
    const cache = caches.default;
    const cached = await cache.match(new Request(key));
    if (cached) return (await cached.json()) as T;
  } catch { /* miss */ }
  return null;
}

export async function getWatchlistHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const kv = c.env.KV_CACHE;
  if (!kv) return c.json({ error: 'KV not available' }, 503);
  const wl = await readWatchlist(kv);
  return c.json({ watchlist: wl });
}

export async function updateWatchlistHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const kv = c.env.KV_CACHE;
  if (!kv) return c.json({ error: 'KV not available' }, 503);
  const body = await c.req.json<any>();
  if (body.domains !== undefined && !Array.isArray(body.domains)) {
    return c.json({ error: 'domains must be an array' }, 400);
  }
  if (body.emails !== undefined && !Array.isArray(body.emails)) {
    return c.json({ error: 'emails must be an array' }, 400);
  }
  const wl: Watchlist = {
    domains: (body.domains ?? []).slice(0, 20).map((d) => String(d).toLowerCase().trim()),
    emails: (body.emails ?? []).slice(0, 20).map((e) => String(e).toLowerCase().trim()),
  };
  await kv.put(WATCHLIST_KV_KEY, JSON.stringify(wl));
  return c.json({ ok: true, watchlist: wl });
}

export async function dashboardHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const kv = c.env.KV_CACHE;
  if (!kv) return c.json({ error: 'KV not available' }, 503);

  const wl = await readWatchlist(kv);
  const results: DomainStatus[] = [];

  // Check domains against cached threat data
  for (const domain of wl.domains) {
    const domainLower = domain.toLowerCase();

    // IOC sightings
    const liveIocs = await readCache<{ items: Array<{ value: string; kind: string; source: string }> }>('https://live-iocs-cache.internal/v11-freshness-filter');
    const domainIocs = (liveIocs?.items ?? []).filter(
      (i) => i.value.toLowerCase() === domainLower || i.value.toLowerCase().includes(domainLower)
    );

    // Breach disclosures
    const breaches = await readCache<{ breaches: Array<{ name: string; title: string; domain?: string; pwn_count?: number; breach_date?: string; data_classes?: string[] }> }>('https://breach-cache.internal/v6-hibp-only');
    const domainBreaches = (breaches?.breaches ?? []).filter(
      (b) => b.domain?.toLowerCase() === domainLower
    );

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
