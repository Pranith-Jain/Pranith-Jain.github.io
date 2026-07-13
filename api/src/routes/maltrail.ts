import type { Context } from 'hono';
import type { Env } from '../env';

const MALTRAIL_RAW = 'https://raw.githubusercontent.com/stamparm/maltrail/master/trails/static/malware';
const MALTRAIL_API = 'https://api.github.com/repos/stamparm/maltrail/contents/trails/static/malware';

interface MaltrailTrailFile {
  name: string;
  path: string;
  size: number;
  actors: string[];
}

/**
 * Parse actor name(s) from a Maltrail trail filename.
 * Convention: `<actor>_<sub>...` or `<actor>.txt`
 */
function parseActorFromFilename(name: string): string[] {
  const base = name.replace(/\.txt$/i, '');
  const parts = base.split(/[_\s]+/);
  const actor = parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ');
  return [actor.trim()];
}

/**
 * Classify a single IOC line from a Maltrail trail file.
 */
function classifyIoc(line: string): 'ipv4' | 'domain' | 'url' | 'hash' | 'unknown' {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) return 'unknown';
  const ipv4Re = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
  if (ipv4Re.test(trimmed)) return 'ipv4';
  const domainRe = /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
  if (domainRe.test(trimmed)) return 'domain';
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return 'url';
  const hashRe = /^[a-fA-F0-9]{32,128}$/;
  if (hashRe.test(trimmed)) return 'hash';
  return 'unknown';
}

const MALTRAIL_LIST_TTL = 7200;
const MALTRAIL_LIST_CACHE_KEY = new Request('https://maltrail-list.internal/v1');

export async function maltrailListHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  // Provider list is public, never-mutated GitHub data — perfect fit
  // for caches.default. Moved off KV 2026-05-24 to drop the per-visit
  // KV read (and the stale-fallback read on errors).
  const edgeCache = (caches as unknown as { default: Cache }).default;
  try {
    const cached = await edgeCache.match(MALTRAIL_LIST_CACHE_KEY);
    if (cached) {
      return c.json((await cached.json()) as Record<string, unknown>, 200, {
        'cache-control': 'public, max-age=3600',
      });
    }

    const res = await fetch(MALTRAIL_API, {
      headers: { Accept: 'application/vnd.github.v3+json', 'User-Agent': 'pranithjain.qzz.io' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      // No stale entry to serve (the only way to get one is a prior
      // success). Surface the upstream error.
      return c.json({ error: `github: ${res.status}` }, 502, { 'cache-control': 'no-store' });
    }

    const files = (await res.json()) as Array<{ name: string; path: string; size: number; type: string }>;
    const trailFiles: MaltrailTrailFile[] = (Array.isArray(files) ? files : [])
      .filter((f) => f.type === 'file' && f.name.endsWith('.txt'))
      .map((f) => ({
        name: f.name,
        path: f.path,
        size: f.size,
        actors: parseActorFromFilename(f.name),
      }));

    const body = { ok: true, total: trailFiles.length, files: trailFiles };
    const cacheable = new Response(JSON.stringify(body), {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'cache-control': `public, max-age=${MALTRAIL_LIST_TTL}, s-maxage=${MALTRAIL_LIST_TTL}`,
      },
    });
    c.executionCtx.waitUntil(edgeCache.put(MALTRAIL_LIST_CACHE_KEY, cacheable).catch(() => undefined));
    return c.json(body, 200, { 'cache-control': 'public, max-age=3600' });
  } catch (err) {
    console.error('handler failed:', err instanceof Error ? err.message : String(err));
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 502, {
      'cache-control': 'no-store',
    });
  }
}

export async function maltrailFetchHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const trail = c.req.query('trail');
  if (!trail || !trail.trim()) {
    return c.json({ error: 'missing query param trail (e.g. ?trail=apt_lazarus.txt)' }, 400, {
      'cache-control': 'no-store',
    });
  }

  const filename = trail.trim();
  const url = `${MALTRAIL_RAW}/${encodeURIComponent(filename)}`;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'pranithjain.qzz.io' },
      signal: AbortSignal.timeout(20_000),
    });
    if (res.status === 404) {
      return c.json({ ok: false, error: 'trail file not found' }, 404, { 'cache-control': 'public, max-age=3600' });
    }
    if (!res.ok) {
      return c.json({ error: `maltrail: ${res.status}` }, 502, { 'cache-control': 'no-store' });
    }

    const text = await res.text();
    const lines = text.split('\n');
    const iocs = lines.map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && !l.startsWith('//'));

    const byType: Record<string, number> = {};
    const iocList: Array<{ value: string; type: string }> = [];
    for (const ioc of iocs) {
      const t = classifyIoc(ioc);
      if (t !== 'unknown') {
        byType[t] = (byType[t] ?? 0) + 1;
        iocList.push({ value: ioc, type: t });
      }
    }

    return c.json(
      {
        ok: true,
        filename,
        actors: parseActorFromFilename(filename),
        total_iocs: iocList.length,
        by_type: byType,
        iocs: iocList.slice(0, 5000),
        truncated: iocList.length > 5000,
      },
      200,
      { 'cache-control': 'public, max-age=3600' }
    );
  } catch (err) {
    console.error('handler failed:', err instanceof Error ? err.message : String(err));
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 502, {
      'cache-control': 'no-store',
    });
  }
}
