import type { Context } from 'hono';
import type { Env } from '../env';
import { BLOCKLIST_KV_ALL_KEY, buildBlocklists } from '../lib/blocklist-builder';
import { safeNullLog } from '../lib/safe-catch';

interface BlocklistAll {
  pfsense: string;
  iptables: string;
  suricata: string;
  ip_count: number;
  generated_at: string;
}

// Per-colo Cache API front for the shared blocklist blob. All four public
// endpoints (pfsense/iptables/suricata/meta) read the SAME KV object, so a
// 300s per-colo cache (matching the responses' max-age contract) collapses
// their cold-edge KV reads to ~1 per colo per 5 min instead of one per request.
const BLOCKLIST_CACHE_KEY = 'https://blocklist-cache.internal/v1-all';
const BLOCKLIST_CACHE_TTL = 300;

async function readAllFromKv(kv: KVNamespace | undefined): Promise<BlocklistAll | null> {
  if (!kv) return null;
  const cache = (caches as unknown as { default: Cache }).default;
  try {
    const hit = await cache.match(new Request(BLOCKLIST_CACHE_KEY));
    if (hit) return (await hit.json()) as BlocklistAll;
  } catch {
    /* fall through to KV */
  }
  try {
    const raw = await kv.get(BLOCKLIST_KV_ALL_KEY, 'json');
    if (raw && typeof raw === 'object' && 'pfsense' in raw) {
      const all = raw as BlocklistAll;
      // Write-through so subsequent reads in this colo skip KV for the TTL.
      safeNullLog('cache-put-blocklists',
        cache.put(
          new Request(BLOCKLIST_CACHE_KEY),
          new Response(JSON.stringify(all), { headers: { 'cache-control': `max-age=${BLOCKLIST_CACHE_TTL}` } })
        )
      );
      return all;
    }
  } catch (e) {
    console.warn(JSON.stringify({ job: 'blocklists-load', error: e instanceof Error ? e.message : String(e) }));
  }
  return null;
}

async function serveFormat(
  kv: KVNamespace | undefined,
  format: 'pfsense' | 'iptables' | 'suricata',
  _ctx: Context<{ Bindings: Env }>
): Promise<Response | null> {
  const all = await readAllFromKv(kv);
  if (all) {
    return new Response(all[format], {
      status: 200,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
        'X-Blocklist-Source': 'kv-cache',
      },
    });
  }
  return null;
}

export async function blocklistPfSenseHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const fromKv = await serveFormat(c.env.KV_CACHE, 'pfsense', c);
  if (fromKv) return fromKv;
  const bl = await buildBlocklists(c.env.KV_CACHE, c.executionCtx);
  return new Response(bl.pfsense, {
    status: 200,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=300' },
  });
}

export async function blocklistIptablesHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const fromKv = await serveFormat(c.env.KV_CACHE, 'iptables', c);
  if (fromKv) return fromKv;
  const bl = await buildBlocklists(c.env.KV_CACHE, c.executionCtx);
  return new Response(bl.iptables, {
    status: 200,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=300' },
  });
}

export async function blocklistSuricataHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const fromKv = await serveFormat(c.env.KV_CACHE, 'suricata', c);
  if (fromKv) return fromKv;
  const bl = await buildBlocklists(c.env.KV_CACHE, c.executionCtx);
  return new Response(bl.suricata, {
    status: 200,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=300' },
  });
}

export async function blocklistMetaHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const all = await readAllFromKv(c.env.KV_CACHE);
  if (all) {
    return c.json({ ok: true, ip_count: all.ip_count, generated_at: all.generated_at, source: 'kv' }, 200, {
      'Cache-Control': 'public, max-age=60',
    });
  }
  return c.json({ ok: false, error: 'no blocklist data' }, 503);
}
