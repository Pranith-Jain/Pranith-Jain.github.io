import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Env } from '../env';

const UA = 'pranithjain-threatintel/1.0';
const CACHE_SHORT = 300;
const CACHE_MED = 600;
const CACHE_LONG = 1800;

// ── Per-IP rate limiter (in-memory, per-isolate) ──────────────────────
// Prevents a single client from overwhelming upstream APIs. 30 req/min/IP
// is generous for normal use but blocks scripted bursts.
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 60_000;
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();
let lastCleanup = Date.now();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  // Lazy cleanup every 5 minutes (runs inside request context, not global)
  if (now - lastCleanup > 300_000) {
    lastCleanup = now;
    for (const [key, entry] of rateLimitMap) {
      if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS * 2) rateLimitMap.delete(key);
    }
  }
  const entry = rateLimitMap.get(ip);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
    return true;
  }
  entry.count++;
  return entry.count <= RATE_LIMIT_MAX;
}

function cacheApiTtl(path: string): number {
  if (
    path.includes('greynoise') ||
    path.includes('ransomlook-recent') ||
    path.includes('threatfox-iocs') ||
    path.includes('bazaar-recent') ||
    path.includes('hybrid/feed')
  )
    return 300;
  if (
    path.includes('abuseipdb/blacklist') ||
    path.includes('vulners/id') ||
    path.includes('hibp/breach') ||
    path.includes('hibp/latest') ||
    path.includes('hibp/data-classes') ||
    path.includes('bazaar/hash') ||
    path.includes('hybrid/search') ||
    path.includes('otx/cve') ||
    path.includes('ransomlook-groups')
  )
    return 1800;
  return 600;
}

async function l1CacheGet(c: Context<{ Bindings: Env }>): Promise<Record<string, unknown> | null> {
  const cached = await caches.default.match(new Request(c.req.url));
  if (cached) return cached.json() as Promise<Record<string, unknown>>;
  return null;
}

function l1CacheSet(c: Context<{ Bindings: Env }>, data: Record<string, unknown>, ttl: number): void {
  const response = new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, s-maxage=${ttl}` },
  });
  c.executionCtx.waitUntil(caches.default.put(new Request(c.req.url), response));
}

export const darknetIntelRouter = new Hono<{ Bindings: Env }>();

darknetIntelRouter.use('/darknet-intel/*', async (c, next) => {
  // Per-IP rate limit (skip for cached responses)
  const ip = c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'anon';
  if (!checkRateLimit(ip)) {
    return c.json(
      { error: 'rate_limited', message: `Max ${RATE_LIMIT_MAX} requests per minute. Try again shortly.` },
      429,
      {
        'Retry-After': '60',
      }
    );
  }
  if (c.req.method !== 'GET') return next();
  const cached = await l1CacheGet(c);
  if (cached) return c.json({ ...cached, cached: true });
  await next();
  if (c.res.status !== 200) return;
  const ct = c.res.headers.get('content-type');
  if (!ct?.includes('application/json')) return;
  const clone = c.res.clone();
  const body = (await clone.json()) as Record<string, unknown>;
  if (body.error) return;
  l1CacheSet(c, body, cacheApiTtl(c.req.path));
});

// ─── GreyNoise Community (free, no key) ───────────────────────────────

darknetIntelRouter.get('/darknet-intel/greynoise/ip', async (c) => {
  const ip = c.req.query('ip');
  if (!ip) return c.json({ error: 'ip parameter required' }, 400);
  const key = c.env.GREYNOISE_API_KEY;
  const cacheKey = `gn:ip:${ip}`;
  const cached = (await c.env.KV_CACHE?.get(cacheKey, 'json')) as Record<string, unknown> | null;
  if (cached) return c.json({ ...(cached as object), cached: true });
  try {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (key) headers['key'] = key;
    const res = await fetch(`https://api.greynoise.io/v3/community/${encodeURIComponent(ip)}`, {
      headers,
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return c.json({ error: `GreyNoise upstream ${res.status}` }, 502);
    const data = (await res.json()) as Record<string, unknown>;
    const body = { ip, ...data, provider: 'greynoise', generated_at: new Date().toISOString(), cached: false };
    if (c.env.KV_CACHE)
      c.executionCtx.waitUntil(c.env.KV_CACHE.put(cacheKey, JSON.stringify(body), { expirationTtl: CACHE_SHORT }));
    return c.json(body);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'GreyNoise unreachable' }, 502);
  }
});

darknetIntelRouter.get('/darknet-intel/greynoise/check', async (c) => {
  const ip = c.req.query('ip');
  if (!ip) return c.json({ error: 'ip parameter required' }, 400);
  try {
    const headers: Record<string, string> = { Accept: 'application/json' };
    const key = c.env.GREYNOISE_API_KEY;
    if (key) headers['key'] = key;
    const res = await fetch(`https://api.greynoise.io/v3/community/${encodeURIComponent(ip)}`, {
      headers,
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return c.json({ error: `GreyNoise upstream ${res.status}` }, 502);
    const data = (await res.json()) as Record<string, unknown> as Record<string, unknown>;
    return c.json({
      ip,
      classification: data.noise ? 'malicious' : data.riot ? 'benign' : 'unknown',
      noise: data.noise,
      riot: data.riot,
      provider: 'greynoise',
      generated_at: new Date().toISOString(),
    });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'GreyNoise unreachable' }, 502);
  }
});

// ─── Pulsedive (free, optional key) ───────────────────────────────────

darknetIntelRouter.get('/darknet-intel/pulsedive/indicator', async (c) => {
  const type = c.req.query('type');
  const value = c.req.query('value');
  if (!type || !value) return c.json({ error: 'type and value parameters required' }, 400);
  const cacheKey = `pd:ind:${type}:${value}`;
  const cached = (await c.env.KV_CACHE?.get(cacheKey, 'json')) as Record<string, unknown> | null;
  if (cached) return c.json({ ...(cached as object), cached: true });
  try {
    let url = `https://pulsedive.com/api/v3.php?query=indicator&type=${encodeURIComponent(type)}&value=${encodeURIComponent(value)}`;
    const key = c.env.PULSEDIVE_API_KEY;
    if (key) url += `&key=${encodeURIComponent(key)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return c.json({ error: `Pulsedive upstream ${res.status}` }, 502);
    const data = (await res.json()) as Record<string, unknown>;
    const body = { type, value, ...data, provider: 'pulsedive', generated_at: new Date().toISOString(), cached: false };
    if (c.env.KV_CACHE)
      c.executionCtx.waitUntil(c.env.KV_CACHE.put(cacheKey, JSON.stringify(body), { expirationTtl: CACHE_MED }));
    return c.json(body);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'Pulsedive unreachable' }, 502);
  }
});

darknetIntelRouter.get('/darknet-intel/pulsedive/search', async (c) => {
  const q = c.req.query('q');
  if (!q) return c.json({ error: 'q parameter required' }, 400);
  try {
    let url = `https://pulsedive.com/api/v3.php?query=search&value=${encodeURIComponent(q)}`;
    const key = c.env.PULSEDIVE_API_KEY;
    if (key) url += `&key=${encodeURIComponent(key)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return c.json({ error: `Pulsedive upstream ${res.status}` }, 502);
    const data = (await res.json()) as Record<string, unknown>;
    return c.json({ query: q, ...data, provider: 'pulsedive', generated_at: new Date().toISOString() });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'Pulsedive unreachable' }, 502);
  }
});

darknetIntelRouter.get('/darknet-intel/pulsedive/explore', async (c) => {
  const indicator = c.req.query('indicator');
  if (!indicator) return c.json({ error: 'indicator parameter required' }, 400);
  try {
    let url = `https://pulsedive.com/api/v3.php?query=explore&value=${encodeURIComponent(indicator)}&filter_risk=all`;
    const key = c.env.PULSEDIVE_API_KEY;
    if (key) url += `&key=${encodeURIComponent(key)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return c.json({ error: `Pulsedive upstream ${res.status}` }, 502);
    const data = (await res.json()) as Record<string, unknown>;
    return c.json({ indicator, ...data, provider: 'pulsedive', generated_at: new Date().toISOString() });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'Pulsedive unreachable' }, 502);
  }
});

// ─── Vulners (free, optional key for search) ──────────────────────────

darknetIntelRouter.get('/darknet-intel/vulners/id', async (c) => {
  const id = c.req.query('id');
  if (!id) return c.json({ error: 'id parameter required (CVE, EDB, GHSA)' }, 400);
  const cacheKey = `vuln:id:${id}`;
  const cached = (await c.env.KV_CACHE?.get(cacheKey, 'json')) as Record<string, unknown> | null;
  if (cached) return c.json({ ...(cached as object), cached: true });
  try {
    let url = `https://vulners.com/api/v3/search/id/?id=${encodeURIComponent(id)}`;
    const key = c.env.VULNERS_API_KEY;
    if (key) url += `&apiKey=${encodeURIComponent(key)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return c.json({ error: `Vulners upstream ${res.status}` }, 502);
    const data = (await res.json()) as Record<string, unknown>;
    const body = { id, ...data, provider: 'vulners', generated_at: new Date().toISOString(), cached: false };
    if (c.env.KV_CACHE)
      c.executionCtx.waitUntil(c.env.KV_CACHE.put(cacheKey, JSON.stringify(body), { expirationTtl: CACHE_LONG }));
    return c.json(body);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'Vulners unreachable' }, 502);
  }
});

darknetIntelRouter.post('/darknet-intel/vulners/search', async (c) => {
  const body = (await c.req.json<{ query?: string; limit?: number }>().catch(() => ({}))) as {
    query?: string;
    limit?: number;
  };
  const query = body.query;
  if (!query) return c.json({ error: 'query field required in JSON body' }, 400);
  const limit = Math.min(body.limit ?? 20, 100);
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const key = c.env.VULNERS_API_KEY;
    if (key) headers['API-KEY'] = key;
    const res = await fetch('https://vulners.com/api/v3/search/lucene/', {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, fields: ['id', 'title', 'type', 'cvss', 'vhref', 'description'], limit }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return c.json({ error: `Vulners upstream ${res.status}` }, 502);
    const data = (await res.json()) as Record<string, unknown>;
    return c.json({ query, limit, ...data, provider: 'vulners', generated_at: new Date().toISOString() });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'Vulners unreachable' }, 502);
  }
});

darknetIntelRouter.post('/darknet-intel/vulners/exploit', async (c) => {
  const body = (await c.req.json<{ query?: string; limit?: number }>().catch(() => ({}))) as {
    query?: string;
    limit?: number;
  };
  const query = body.query;
  if (!query) return c.json({ error: 'query field required in JSON body' }, 400);
  const limit = Math.min(body.limit ?? 20, 100);
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const key = c.env.VULNERS_API_KEY;
    if (key) headers['API-KEY'] = key;
    const exploitQuery = `(${query}) AND type:exploit`;
    const res = await fetch('https://vulners.com/api/v3/search/lucene/', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        query: exploitQuery,
        fields: ['id', 'title', 'type', 'cvss', 'vhref', 'sourceData'],
        limit,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return c.json({ error: `Vulners upstream ${res.status}` }, 502);
    const data = (await res.json()) as Record<string, unknown>;
    return c.json({ query, limit, ...data, provider: 'vulners', generated_at: new Date().toISOString() });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'Vulners unreachable' }, 502);
  }
});

// ─── IntelligenceX (paid key required) ────────────────────────────────

darknetIntelRouter.get('/darknet-intel/intelx/search', async (c) => {
  const q = c.req.query('q');
  if (!q) return c.json({ error: 'q parameter required' }, 400);
  const key = c.env.INTELX_API_KEY;
  if (!key) return c.json({ error: 'INTELX_API_KEY not configured', docs: 'wrangler secret put INTELX_API_KEY' }, 503);
  try {
    const res = await fetch(
      `https://2.intelx.io/intelligent/search?term=${encodeURIComponent(q)}&key=${key}&maxresults=20&media=0`,
      {
        signal: AbortSignal.timeout(15000),
      }
    );
    if (!res.ok) return c.json({ error: `IntelligenceX upstream ${res.status}` }, 502);
    const data = (await res.json()) as Record<string, unknown>;
    return c.json({
      query: q,
      search_id: data.id,
      ...data,
      provider: 'intelx',
      generated_at: new Date().toISOString(),
    });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'IntelligenceX unreachable' }, 502);
  }
});

darknetIntelRouter.get('/darknet-intel/intelx/results', async (c) => {
  const id = c.req.query('id');
  if (!id) return c.json({ error: 'id parameter required (search_id from intelx/search)' }, 400);
  const key = c.env.INTELX_API_KEY;
  if (!key) return c.json({ error: 'INTELX_API_KEY not configured' }, 503);
  try {
    const res = await fetch(`https://2.intelx.io/intelligent/search/result?id=${id}&key=${key}&limit=50`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return c.json({ error: `IntelligenceX upstream ${res.status}` }, 502);
    const data = (await res.json()) as Record<string, unknown>;
    return c.json({ search_id: id, ...data, provider: 'intelx', generated_at: new Date().toISOString() });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'IntelligenceX unreachable' }, 502);
  }
});

darknetIntelRouter.get('/darknet-intel/intelx/phonebook', async (c) => {
  const q = c.req.query('q');
  if (!q) return c.json({ error: 'q parameter required' }, 400);
  const key = c.env.INTELX_API_KEY;
  if (!key) return c.json({ error: 'INTELX_API_KEY not configured' }, 503);
  try {
    const res = await fetch(
      `https://2.intelx.io/phonebook/search?term=${encodeURIComponent(q)}&key=${key}&maxresults=20`,
      {
        signal: AbortSignal.timeout(15000),
      }
    );
    if (!res.ok) return c.json({ error: `IntelligenceX upstream ${res.status}` }, 502);
    const data = (await res.json()) as Record<string, unknown>;
    return c.json({
      query: q,
      search_id: data.id,
      ...data,
      provider: 'intelx',
      generated_at: new Date().toISOString(),
    });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'IntelligenceX unreachable' }, 502);
  }
});

darknetIntelRouter.get('/darknet-intel/intelx/phonebook-results', async (c) => {
  const id = c.req.query('id');
  if (!id) return c.json({ error: 'id parameter required (search_id from intelx/phonebook)' }, 400);
  const key = c.env.INTELX_API_KEY;
  if (!key) return c.json({ error: 'INTELX_API_KEY not configured' }, 503);
  try {
    const res = await fetch(`https://2.intelx.io/phonebook/search/result?id=${id}&key=${key}&limit=50`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return c.json({ error: `IntelligenceX upstream ${res.status}` }, 502);
    const data = (await res.json()) as Record<string, unknown>;
    return c.json({ search_id: id, ...data, provider: 'intelx', generated_at: new Date().toISOString() });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'IntelligenceX unreachable' }, 502);
  }
});

// ─── AbuseIPDB (key required) ─────────────────────────────────────────

darknetIntelRouter.get('/darknet-intel/abuseipdb/check', async (c) => {
  const ip = c.req.query('ip');
  if (!ip) return c.json({ error: 'ip parameter required' }, 400);
  const key = c.env.ABUSEIPDB_API_KEY;
  if (!key)
    return c.json({ error: 'ABUSEIPDB_API_KEY not configured', docs: 'wrangler secret put ABUSEIPDB_API_KEY' }, 503);
  const cacheKey = `abuseipdb:check:${ip}`;
  const cached = (await c.env.KV_CACHE?.get(cacheKey, 'json')) as Record<string, unknown> | null;
  if (cached) return c.json({ ...(cached as object), cached: true });
  try {
    const res = await fetch(
      `https://api.abuseipdb.com/api/v2/check?ipAddress=${encodeURIComponent(ip)}&maxAgeInDays=90`,
      {
        headers: { Key: key, Accept: 'application/json' },
        signal: AbortSignal.timeout(10000),
      }
    );
    if (!res.ok) return c.json({ error: `AbuseIPDB upstream ${res.status}` }, 502);
    const data = (await res.json()) as Record<string, unknown>;
    const body = { ip, ...data, provider: 'abuseipdb', generated_at: new Date().toISOString(), cached: false };
    if (c.env.KV_CACHE)
      c.executionCtx.waitUntil(c.env.KV_CACHE.put(cacheKey, JSON.stringify(body), { expirationTtl: CACHE_MED }));
    return c.json(body);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'AbuseIPDB unreachable' }, 502);
  }
});

darknetIntelRouter.get('/darknet-intel/abuseipdb/reports', async (c) => {
  const ip = c.req.query('ip');
  if (!ip) return c.json({ error: 'ip parameter required' }, 400);
  const key = c.env.ABUSEIPDB_API_KEY;
  if (!key) return c.json({ error: 'ABUSEIPDB_API_KEY not configured' }, 503);
  try {
    const res = await fetch(
      `https://api.abuseipdb.com/api/v2/reports?ipAddress=${encodeURIComponent(ip)}&maxAgeInDays=90&limit=100`,
      {
        headers: { Key: key, Accept: 'application/json' },
        signal: AbortSignal.timeout(10000),
      }
    );
    if (!res.ok) return c.json({ error: `AbuseIPDB upstream ${res.status}` }, 502);
    const data = (await res.json()) as Record<string, unknown>;
    return c.json({ ip, ...data, provider: 'abuseipdb', generated_at: new Date().toISOString() });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'AbuseIPDB unreachable' }, 502);
  }
});

darknetIntelRouter.get('/darknet-intel/abuseipdb/blacklist', async (c) => {
  const key = c.env.ABUSEIPDB_API_KEY;
  if (!key) return c.json({ error: 'ABUSEIPDB_API_KEY not configured' }, 503);
  const cacheKey = 'abuseipdb:blacklist';
  const cached = (await c.env.KV_CACHE?.get(cacheKey, 'json')) as Record<string, unknown> | null;
  if (cached) return c.json({ ...(cached as object), cached: true });
  try {
    const confidence = c.req.query('confidence') ?? '90';
    const limit = c.req.query('limit') ?? '10000';
    const res = await fetch(
      `https://api.abuseipdb.com/api/v2/blacklist?confidenceMinimum=${confidence}&limit=${limit}`,
      {
        headers: { Key: key, Accept: 'application/json' },
        signal: AbortSignal.timeout(15000),
      }
    );
    if (!res.ok) return c.json({ error: `AbuseIPDB upstream ${res.status}` }, 502);
    const data = (await res.json()) as Record<string, unknown>;
    const body = { ...data, provider: 'abuseipdb', generated_at: new Date().toISOString(), cached: false };
    if (c.env.KV_CACHE)
      c.executionCtx.waitUntil(c.env.KV_CACHE.put(cacheKey, JSON.stringify(body), { expirationTtl: CACHE_LONG }));
    return c.json(body);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'AbuseIPDB unreachable' }, 502);
  }
});

darknetIntelRouter.get('/darknet-intel/abuseipdb/check-block', async (c) => {
  const network = c.req.query('network');
  if (!network) return c.json({ error: 'network parameter required (CIDR, e.g. 118.208.0.0/16)' }, 400);
  const key = c.env.ABUSEIPDB_API_KEY;
  if (!key) return c.json({ error: 'ABUSEIPDB_API_KEY not configured' }, 503);
  try {
    const res = await fetch(`https://api.abuseipdb.com/api/v2/check-block?network=${encodeURIComponent(network)}`, {
      headers: { Key: key, Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return c.json({ error: `AbuseIPDB upstream ${res.status}` }, 502);
    const data = (await res.json()) as Record<string, unknown>;
    return c.json({ network, ...data, provider: 'abuseipdb', generated_at: new Date().toISOString() });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'AbuseIPDB unreachable' }, 502);
  }
});

// ─── Deep Ransomware Intelligence (free, no key) ─────────────────────

darknetIntelRouter.get('/darknet-intel/ransomware/group', async (c) => {
  const name = c.req.query('name');
  if (!name) return c.json({ error: 'name parameter required' }, 400);
  const cacheKey = `rw:group:${name}`;
  const cached = (await c.env.KV_CACHE?.get(cacheKey, 'json')) as Record<string, unknown> | null;
  if (cached) return c.json({ ...(cached as object), cached: true });
  try {
    const res = await fetch(`https://api.ransomware.live/v2/group/${encodeURIComponent(name)}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return c.json({ error: `ransomware.live upstream ${res.status}` }, 502);
    const data = (await res.json()) as Record<string, unknown>;
    const body = {
      group: name,
      ...data,
      provider: 'ransomware.live',
      generated_at: new Date().toISOString(),
      cached: false,
    };
    if (c.env.KV_CACHE)
      c.executionCtx.waitUntil(c.env.KV_CACHE.put(cacheKey, JSON.stringify(body), { expirationTtl: CACHE_MED }));
    return c.json(body);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'ransomware.live unreachable' }, 502);
  }
});

darknetIntelRouter.get('/darknet-intel/ransomware/victims', async (c) => {
  const name = c.req.query('name');
  if (!name) return c.json({ error: 'name parameter required (group name)' }, 400);
  try {
    const res = await fetch(`https://api.ransomware.live/v2/group/${encodeURIComponent(name)}/victims`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return c.json({ error: `ransomware.live upstream ${res.status}` }, 502);
    const data = (await res.json()) as Record<string, unknown>;
    return c.json({ group: name, ...data, provider: 'ransomware.live', generated_at: new Date().toISOString() });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'ransomware.live unreachable' }, 502);
  }
});

darknetIntelRouter.get('/darknet-intel/ransomware/search', async (c) => {
  const q = c.req.query('q');
  if (!q) return c.json({ error: 'q parameter required' }, 400);
  try {
    const res = await fetch(`https://api.ransomware.live/v2/search/${encodeURIComponent(q)}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return c.json({ error: `ransomware.live upstream ${res.status}` }, 502);
    const data = (await res.json()) as Record<string, unknown>;
    return c.json({ query: q, ...data, provider: 'ransomware.live', generated_at: new Date().toISOString() });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'ransomware.live unreachable' }, 502);
  }
});

darknetIntelRouter.get('/darknet-intel/ransomware/country', async (c) => {
  const code = c.req.query('code');
  if (!code) return c.json({ error: 'code parameter required (ISO 3166-1 alpha-2)' }, 400);
  const cacheKey = `rw:country:${code}`;
  const cached = (await c.env.KV_CACHE?.get(cacheKey, 'json')) as Record<string, unknown> | null;
  if (cached) return c.json({ ...(cached as object), cached: true });
  try {
    const res = await fetch(`https://api.ransomware.live/v2/country/${encodeURIComponent(code)}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return c.json({ error: `ransomware.live upstream ${res.status}` }, 502);
    const data = (await res.json()) as Record<string, unknown>;
    const body = {
      country: code,
      ...data,
      provider: 'ransomware.live',
      generated_at: new Date().toISOString(),
      cached: false,
    };
    if (c.env.KV_CACHE)
      c.executionCtx.waitUntil(c.env.KV_CACHE.put(cacheKey, JSON.stringify(body), { expirationTtl: CACHE_MED }));
    return c.json(body);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'ransomware.live unreachable' }, 502);
  }
});

darknetIntelRouter.get('/darknet-intel/ransomware/sector', async (c) => {
  const sector = c.req.query('sector');
  if (!sector) return c.json({ error: 'sector parameter required (e.g. healthcare, finance)' }, 400);
  const cacheKey = `rw:sector:${sector}`;
  const cached = (await c.env.KV_CACHE?.get(cacheKey, 'json')) as Record<string, unknown> | null;
  if (cached) return c.json({ ...(cached as object), cached: true });
  try {
    const res = await fetch(`https://api.ransomware.live/v2/sector/${encodeURIComponent(sector)}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return c.json({ error: `ransomware.live upstream ${res.status}` }, 502);
    const data = (await res.json()) as Record<string, unknown>;
    const body = {
      sector,
      ...data,
      provider: 'ransomware.live',
      generated_at: new Date().toISOString(),
      cached: false,
    };
    if (c.env.KV_CACHE)
      c.executionCtx.waitUntil(c.env.KV_CACHE.put(cacheKey, JSON.stringify(body), { expirationTtl: CACHE_MED }));
    return c.json(body);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'ransomware.live unreachable' }, 502);
  }
});

darknetIntelRouter.get('/darknet-intel/ransomware/ransomlook-groups', async (c) => {
  const cacheKey = 'rw:rl:groups';
  const cached = (await c.env.KV_CACHE?.get(cacheKey, 'json')) as Record<string, unknown> | null;
  if (cached) return c.json({ ...(cached as object), cached: true });
  try {
    const res = await fetch('https://www.ransomlook.io/api/groups', { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return c.json({ error: `ransomlook upstream ${res.status}` }, 502);
    const data = (await res.json()) as Record<string, unknown>;
    const body = { ...data, provider: 'ransomlook', generated_at: new Date().toISOString(), cached: false };
    if (c.env.KV_CACHE)
      c.executionCtx.waitUntil(c.env.KV_CACHE.put(cacheKey, JSON.stringify(body), { expirationTtl: CACHE_LONG }));
    return c.json(body);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'ransomlook unreachable' }, 502);
  }
});

darknetIntelRouter.get('/darknet-intel/ransomware/ransomlook-recent', async (c) => {
  const cacheKey = 'rw:rl:recent';
  const cached = (await c.env.KV_CACHE?.get(cacheKey, 'json')) as Record<string, unknown> | null;
  if (cached) return c.json({ ...(cached as object), cached: true });
  try {
    const res = await fetch('https://www.ransomlook.io/api/recent', { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return c.json({ error: `ransomlook upstream ${res.status}` }, 502);
    const data = (await res.json()) as Record<string, unknown>;
    const body = { ...data, provider: 'ransomlook', generated_at: new Date().toISOString(), cached: false };
    if (c.env.KV_CACHE)
      c.executionCtx.waitUntil(c.env.KV_CACHE.put(cacheKey, JSON.stringify(body), { expirationTtl: CACHE_SHORT }));
    return c.json(body);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'ransomlook unreachable' }, 502);
  }
});

// ─── Deep HIBP Breach Intelligence ────────────────────────────────────

darknetIntelRouter.get('/darknet-intel/hibp/breach', async (c) => {
  const name = c.req.query('name');
  if (!name) return c.json({ error: 'name parameter required (breach name)' }, 400);
  const cacheKey = `hibp:breach:${name}`;
  const cached = (await c.env.KV_CACHE?.get(cacheKey, 'json')) as Record<string, unknown> | null;
  if (cached) return c.json({ ...(cached as object), cached: true });
  try {
    const headers: Record<string, string> = { 'User-Agent': UA };
    const key = c.env.HIBP_API_KEY;
    if (key) headers['hibp-api-key'] = key;
    const res = await fetch(`https://haveibeenpwned.com/api/v3/breach/${encodeURIComponent(name)}`, {
      headers,
      signal: AbortSignal.timeout(10000),
    });
    if (res.status === 404) return c.json({ error: 'breach not found', name }, 404);
    if (!res.ok) return c.json({ error: `HIBP upstream ${res.status}` }, 502);
    const data = (await res.json()) as Record<string, unknown>;
    const body = { ...data, provider: 'hibp', generated_at: new Date().toISOString(), cached: false };
    if (c.env.KV_CACHE)
      c.executionCtx.waitUntil(c.env.KV_CACHE.put(cacheKey, JSON.stringify(body), { expirationTtl: CACHE_LONG }));
    return c.json(body);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'HIBP unreachable' }, 502);
  }
});

darknetIntelRouter.get('/darknet-intel/hibp/latest', async (c) => {
  const cacheKey = 'hibp:latest';
  const cached = (await c.env.KV_CACHE?.get(cacheKey, 'json')) as Record<string, unknown> | null;
  if (cached) return c.json({ ...(cached as object), cached: true });
  try {
    const headers: Record<string, string> = { 'User-Agent': UA };
    const key = c.env.HIBP_API_KEY;
    if (key) headers['hibp-api-key'] = key;
    const res = await fetch('https://haveibeenpwned.com/api/v3/breaches', {
      headers,
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return c.json({ error: `HIBP upstream ${res.status}` }, 502);
    const data = (await res.json()) as Record<string, unknown>;
    const body = {
      breaches: data,
      count: Array.isArray(data) ? data.length : 0,
      provider: 'hibp',
      generated_at: new Date().toISOString(),
      cached: false,
    };
    if (c.env.KV_CACHE)
      c.executionCtx.waitUntil(c.env.KV_CACHE.put(cacheKey, JSON.stringify(body), { expirationTtl: CACHE_LONG }));
    return c.json(body);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'HIBP unreachable' }, 502);
  }
});

darknetIntelRouter.get('/darknet-intel/hibp/data-classes', async (c) => {
  const cacheKey = 'hibp:dataclasses';
  const cached = (await c.env.KV_CACHE?.get(cacheKey, 'json')) as Record<string, unknown> | null;
  if (cached) return c.json({ ...(cached as object), cached: true });
  try {
    const headers: Record<string, string> = { 'User-Agent': UA };
    const key = c.env.HIBP_API_KEY;
    if (key) headers['hibp-api-key'] = key;
    const res = await fetch('https://haveibeenpwned.com/api/v3/dataclasses', {
      headers,
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return c.json({ error: `HIBP upstream ${res.status}` }, 502);
    const data = (await res.json()) as Record<string, unknown>;
    const body = {
      data_classes: data,
      count: Array.isArray(data) ? data.length : 0,
      provider: 'hibp',
      generated_at: new Date().toISOString(),
      cached: false,
    };
    if (c.env.KV_CACHE)
      c.executionCtx.waitUntil(c.env.KV_CACHE.put(cacheKey, JSON.stringify(body), { expirationTtl: CACHE_LONG }));
    return c.json(body);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'HIBP unreachable' }, 502);
  }
});

darknetIntelRouter.get('/darknet-intel/hibp/password', async (c) => {
  const password = c.req.query('password');
  if (!password) return c.json({ error: 'password parameter required' }, 400);
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-1', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase();
    const prefix = hashHex.slice(0, 5);
    const suffix = hashHex.slice(5);
    const res = await fetch(`https://haveibeenpwned.com/api/v3/pwnedpassword/${prefix}`, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok && res.status !== 404) return c.json({ error: `HIBP upstream ${res.status}` }, 502);
    const text = await res.text();
    const lines = text.split('\r\n');
    let count = 0;
    for (const line of lines) {
      const [hashSuffix, n] = line.split(':');
      if (hashSuffix === suffix && n) {
        count = parseInt(n, 10);
        break;
      }
    }
    return c.json({
      password: '***',
      sha1_prefix: prefix,
      pwned: count > 0,
      count,
      provider: 'hibp',
      generated_at: new Date().toISOString(),
    });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'HIBP unreachable' }, 502);
  }
});

// ─── Deep abuse.ch (ThreatFox, URLhaus, MalwareBazaar — free) ────────

darknetIntelRouter.get('/darknet-intel/abusech/threatfox-iocs', async (c) => {
  const days = parseInt(c.req.query('days') ?? '3', 10);
  const cacheKey = `abusech:tf:iocs:${days}`;
  const cached = (await c.env.KV_CACHE?.get(cacheKey, 'json')) as Record<string, unknown> | null;
  if (cached) return c.json({ ...(cached as object), cached: true });
  try {
    const res = await fetch('https://threatfox-api.abuse.ch/api/v1/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'get_iocs', days: Math.min(Math.max(days, 1), 30) }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return c.json({ error: `ThreatFox upstream ${res.status}` }, 502);
    const data = (await res.json()) as Record<string, unknown>;
    const body = { days, ...data, provider: 'threatfox', generated_at: new Date().toISOString(), cached: false };
    if (c.env.KV_CACHE)
      c.executionCtx.waitUntil(c.env.KV_CACHE.put(cacheKey, JSON.stringify(body), { expirationTtl: CACHE_SHORT }));
    return c.json(body);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'ThreatFox unreachable' }, 502);
  }
});

darknetIntelRouter.get('/darknet-intel/abusech/threatfox-search', async (c) => {
  const q = c.req.query('q');
  if (!q) return c.json({ error: 'q parameter required (IP, domain, hash, or URL)' }, 400);
  try {
    const res = await fetch('https://threatfox-api.abuse.ch/api/v1/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'search_ioc', search_term: q }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return c.json({ error: `ThreatFox upstream ${res.status}` }, 502);
    const data = (await res.json()) as Record<string, unknown>;
    return c.json({ query: q, ...data, provider: 'threatfox', generated_at: new Date().toISOString() });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'ThreatFox unreachable' }, 502);
  }
});

darknetIntelRouter.get('/darknet-intel/abusech/threatfox-tag', async (c) => {
  const tag = c.req.query('tag');
  if (!tag) return c.json({ error: 'tag parameter required (e.g. Cobalt Strike, Emotet)' }, 400);
  const limit = Math.min(parseInt(c.req.query('limit') ?? '50', 10), 500);
  try {
    const res = await fetch('https://threatfox-api.abuse.ch/api/v1/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'taginfo', tag, limit }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return c.json({ error: `ThreatFox upstream ${res.status}` }, 502);
    const data = (await res.json()) as Record<string, unknown>;
    return c.json({ tag, limit, ...data, provider: 'threatfox', generated_at: new Date().toISOString() });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'ThreatFox unreachable' }, 502);
  }
});

darknetIntelRouter.get('/darknet-intel/abusech/threatfox-malware', async (c) => {
  const malware = c.req.query('malware');
  if (!malware) return c.json({ error: 'malware parameter required (Malpedia name)' }, 400);
  try {
    const res = await fetch('https://threatfox-api.abuse.ch/api/v1/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'malwareinfo', malware }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return c.json({ error: `ThreatFox upstream ${res.status}` }, 502);
    const data = (await res.json()) as Record<string, unknown>;
    return c.json({ malware, ...data, provider: 'threatfox', generated_at: new Date().toISOString() });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'ThreatFox unreachable' }, 502);
  }
});

darknetIntelRouter.get('/darknet-intel/abusech/urlhaus', async (c) => {
  const url = c.req.query('url');
  const host = c.req.query('host');
  if (!url && !host) return c.json({ error: 'url or host parameter required' }, 400);
  try {
    const body: Record<string, string> = {};
    if (url) body.url = url;
    if (host) body.host = host;
    const res = await fetch('https://urlhaus-api.abuse.ch/v1/url/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return c.json({ error: `URLhaus upstream ${res.status}` }, 502);
    const data = (await res.json()) as Record<string, unknown>;
    return c.json({ ...data, provider: 'urlhaus', generated_at: new Date().toISOString() });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'URLhaus unreachable' }, 502);
  }
});

darknetIntelRouter.get('/darknet-intel/abusech/urlhaus-tag', async (c) => {
  const tag = c.req.query('tag');
  if (!tag) return c.json({ error: 'tag parameter required' }, 400);
  try {
    const res = await fetch('https://urlhaus-api.abuse.ch/v1/tag/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return c.json({ error: `URLhaus upstream ${res.status}` }, 502);
    const data = (await res.json()) as Record<string, unknown>;
    return c.json({ tag, ...data, provider: 'urlhaus', generated_at: new Date().toISOString() });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'URLhaus unreachable' }, 502);
  }
});

darknetIntelRouter.get('/darknet-intel/abusech/bazaar-hash', async (c) => {
  const hash = c.req.query('hash');
  if (!hash) return c.json({ error: 'hash parameter required (MD5, SHA1, or SHA256)' }, 400);
  const cacheKey = `bazaar:hash:${hash}`;
  const cached = (await c.env.KV_CACHE?.get(cacheKey, 'json')) as Record<string, unknown> | null;
  if (cached) return c.json({ ...(cached as object), cached: true });
  try {
    const res = await fetch('https://mb-api.abuse.ch/api/v1/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `query=get_info&${hash.length === 64 ? 'sha256_hash' : hash.length === 40 ? 'sha1_hash' : 'md5_hash'}=${encodeURIComponent(hash)}`,
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return c.json({ error: `MalwareBazaar upstream ${res.status}` }, 502);
    const data = (await res.json()) as Record<string, unknown>;
    const body = { hash, ...data, provider: 'malwarebazaar', generated_at: new Date().toISOString(), cached: false };
    if (c.env.KV_CACHE)
      c.executionCtx.waitUntil(c.env.KV_CACHE.put(cacheKey, JSON.stringify(body), { expirationTtl: CACHE_LONG }));
    return c.json(body);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'MalwareBazaar unreachable' }, 502);
  }
});

darknetIntelRouter.get('/darknet-intel/abusech/bazaar-recent', async (c) => {
  const cacheKey = 'bazaar:recent';
  const cached = (await c.env.KV_CACHE?.get(cacheKey, 'json')) as Record<string, unknown> | null;
  if (cached) return c.json({ ...(cached as object), cached: true });
  try {
    const res = await fetch('https://mb-api.abuse.ch/api/v1/?query=get_recent&selector=100', {
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return c.json({ error: `MalwareBazaar upstream ${res.status}` }, 502);
    const data = (await res.json()) as Record<string, unknown>;
    const body = { ...data, provider: 'malwarebazaar', generated_at: new Date().toISOString(), cached: false };
    if (c.env.KV_CACHE)
      c.executionCtx.waitUntil(c.env.KV_CACHE.put(cacheKey, JSON.stringify(body), { expirationTtl: CACHE_SHORT }));
    return c.json(body);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'MalwareBazaar unreachable' }, 502);
  }
});

darknetIntelRouter.get('/darknet-intel/abusech/bazaar-tag', async (c) => {
  const tag = c.req.query('tag');
  if (!tag) return c.json({ error: 'tag parameter required' }, 400);
  const limit = Math.min(parseInt(c.req.query('limit') ?? '50', 10), 1000);
  try {
    const res = await fetch('https://mb-api.abuse.ch/api/v1/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `query=get_taginfo&tag=${encodeURIComponent(tag)}&limit=${limit}`,
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return c.json({ error: `MalwareBazaar upstream ${res.status}` }, 502);
    const data = (await res.json()) as Record<string, unknown>;
    return c.json({ tag, limit, ...data, provider: 'malwarebazaar', generated_at: new Date().toISOString() });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'MalwareBazaar unreachable' }, 502);
  }
});

// ─── Deep AlienVault OTX (free, optional key) ────────────────────────

darknetIntelRouter.get('/darknet-intel/otx/ip', async (c) => {
  const ip = c.req.query('ip');
  if (!ip) return c.json({ error: 'ip parameter required' }, 400);
  const cacheKey = `otx:ip:${ip}`;
  const cached = (await c.env.KV_CACHE?.get(cacheKey, 'json')) as Record<string, unknown> | null;
  if (cached) return c.json({ ...(cached as object), cached: true });
  try {
    const headers: Record<string, string> = { Accept: 'application/json' };
    const key = c.env.OTX_API_KEY;
    if (key) headers['X-OTX-API-KEY'] = key;
    const res = await fetch(`https://otx.alienvault.com/api/v1/indicators/IPv4/${encodeURIComponent(ip)}/general`, {
      headers,
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return c.json({ error: `OTX upstream ${res.status}` }, 502);
    const data = (await res.json()) as Record<string, unknown>;
    const body = { ip, ...data, provider: 'otx', generated_at: new Date().toISOString(), cached: false };
    if (c.env.KV_CACHE)
      c.executionCtx.waitUntil(c.env.KV_CACHE.put(cacheKey, JSON.stringify(body), { expirationTtl: CACHE_MED }));
    return c.json(body);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'OTX unreachable' }, 502);
  }
});

darknetIntelRouter.get('/darknet-intel/otx/domain', async (c) => {
  const domain = c.req.query('domain');
  if (!domain) return c.json({ error: 'domain parameter required' }, 400);
  const cacheKey = `otx:domain:${domain}`;
  const cached = (await c.env.KV_CACHE?.get(cacheKey, 'json')) as Record<string, unknown> | null;
  if (cached) return c.json({ ...(cached as object), cached: true });
  try {
    const headers: Record<string, string> = { Accept: 'application/json' };
    const key = c.env.OTX_API_KEY;
    if (key) headers['X-OTX-API-KEY'] = key;
    const res = await fetch(
      `https://otx.alienvault.com/api/v1/indicators/domain/${encodeURIComponent(domain)}/general`,
      {
        headers,
        signal: AbortSignal.timeout(10000),
      }
    );
    if (!res.ok) return c.json({ error: `OTX upstream ${res.status}` }, 502);
    const data = (await res.json()) as Record<string, unknown>;
    const body = { domain, ...data, provider: 'otx', generated_at: new Date().toISOString(), cached: false };
    if (c.env.KV_CACHE)
      c.executionCtx.waitUntil(c.env.KV_CACHE.put(cacheKey, JSON.stringify(body), { expirationTtl: CACHE_MED }));
    return c.json(body);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'OTX unreachable' }, 502);
  }
});

darknetIntelRouter.get('/darknet-intel/otx/hash', async (c) => {
  const hash = c.req.query('hash');
  if (!hash) return c.json({ error: 'hash parameter required' }, 400);
  const cacheKey = `otx:hash:${hash}`;
  const cached = (await c.env.KV_CACHE?.get(cacheKey, 'json')) as Record<string, unknown> | null;
  if (cached) return c.json({ ...(cached as object), cached: true });
  try {
    const headers: Record<string, string> = { Accept: 'application/json' };
    const key = c.env.OTX_API_KEY;
    if (key) headers['X-OTX-API-KEY'] = key;
    const res = await fetch(`https://otx.alienvault.com/api/v1/indicators/file/${encodeURIComponent(hash)}/general`, {
      headers,
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return c.json({ error: `OTX upstream ${res.status}` }, 502);
    const data = (await res.json()) as Record<string, unknown>;
    const body = { hash, ...data, provider: 'otx', generated_at: new Date().toISOString(), cached: false };
    if (c.env.KV_CACHE)
      c.executionCtx.waitUntil(c.env.KV_CACHE.put(cacheKey, JSON.stringify(body), { expirationTtl: CACHE_MED }));
    return c.json(body);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'OTX unreachable' }, 502);
  }
});

darknetIntelRouter.get('/darknet-intel/otx/cve', async (c) => {
  const cve = c.req.query('cve');
  if (!cve) return c.json({ error: 'cve parameter required (e.g. CVE-2024-3094)' }, 400);
  const cacheKey = `otx:cve:${cve}`;
  const cached = (await c.env.KV_CACHE?.get(cacheKey, 'json')) as Record<string, unknown> | null;
  if (cached) return c.json({ ...(cached as object), cached: true });
  try {
    const headers: Record<string, string> = { Accept: 'application/json' };
    const key = c.env.OTX_API_KEY;
    if (key) headers['X-OTX-API-KEY'] = key;
    const res = await fetch(`https://otx.alienvault.com/api/v1/indicators/cve/${encodeURIComponent(cve)}/general`, {
      headers,
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return c.json({ error: `OTX upstream ${res.status}` }, 502);
    const data = (await res.json()) as Record<string, unknown>;
    const body = { cve, ...data, provider: 'otx', generated_at: new Date().toISOString(), cached: false };
    if (c.env.KV_CACHE)
      c.executionCtx.waitUntil(c.env.KV_CACHE.put(cacheKey, JSON.stringify(body), { expirationTtl: CACHE_LONG }));
    return c.json(body);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'OTX unreachable' }, 502);
  }
});

// ─── Hybrid Analysis (key required) ───────────────────────────────────

darknetIntelRouter.get('/darknet-intel/hybrid/search', async (c) => {
  const hash = c.req.query('hash');
  if (!hash) return c.json({ error: 'hash parameter required' }, 400);
  const key = c.env.HYBRID_ANALYSIS_API_KEY;
  if (!key)
    return c.json(
      { error: 'HYBRID_ANALYSIS_API_KEY not configured', docs: 'wrangler secret put HYBRID_ANALYSIS_API_KEY' },
      503
    );
  const cacheKey = `hybrid:search:${hash}`;
  const cached = (await c.env.KV_CACHE?.get(cacheKey, 'json')) as Record<string, unknown> | null;
  if (cached) return c.json({ ...(cached as object), cached: true });
  try {
    const res = await fetch(`https://www.hybrid-analysis.com/api/v2/search/hash?hash=${encodeURIComponent(hash)}`, {
      headers: { 'api-key': key, Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return c.json({ error: `Hybrid Analysis upstream ${res.status}` }, 502);
    const data = (await res.json()) as Record<string, unknown>;
    const body = { hash, ...data, provider: 'hybrid-analysis', generated_at: new Date().toISOString(), cached: false };
    if (c.env.KV_CACHE)
      c.executionCtx.waitUntil(c.env.KV_CACHE.put(cacheKey, JSON.stringify(body), { expirationTtl: CACHE_LONG }));
    return c.json(body);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'Hybrid Analysis unreachable' }, 502);
  }
});

darknetIntelRouter.get('/darknet-intel/hybrid/feed', async (c) => {
  const key = c.env.HYBRID_ANALYSIS_API_KEY;
  if (!key) return c.json({ error: 'HYBRID_ANALYSIS_API_KEY not configured' }, 503);
  const cacheKey = 'hybrid:feed';
  const cached = (await c.env.KV_CACHE?.get(cacheKey, 'json')) as Record<string, unknown> | null;
  if (cached) return c.json({ ...(cached as object), cached: true });
  try {
    const res = await fetch('https://www.hybrid-analysis.com/api/v2/feed/latest', {
      headers: { 'api-key': key, Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return c.json({ error: `Hybrid Analysis upstream ${res.status}` }, 502);
    const data = (await res.json()) as Record<string, unknown>;
    const body = { ...data, provider: 'hybrid-analysis', generated_at: new Date().toISOString(), cached: false };
    if (c.env.KV_CACHE)
      c.executionCtx.waitUntil(c.env.KV_CACHE.put(cacheKey, JSON.stringify(body), { expirationTtl: CACHE_SHORT }));
    return c.json(body);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'Hybrid Analysis unreachable' }, 502);
  }
});

// ─── Source Status (meta) ─────────────────────────────────────────────

darknetIntelRouter.get('/darknet-intel/sources', async (c) => {
  return c.json({
    providers: [
      { name: 'GreyNoise Community', tools: 2, auth: 'optional', key_env: 'GREYNOISE_API_KEY', free: true },
      { name: 'Pulsedive', tools: 3, auth: 'optional', key_env: 'PULSEDIVE_API_KEY', free: true },
      { name: 'Vulners', tools: 3, auth: 'optional', key_env: 'VULNERS_API_KEY', free: true },
      { name: 'IntelligenceX', tools: 4, auth: 'required', key_env: 'INTELX_API_KEY', free: false },
      { name: 'AbuseIPDB', tools: 4, auth: 'required', key_env: 'ABUSEIPDB_API_KEY', free: true },
      { name: 'Ransomware.live', tools: 5, auth: 'none', key_env: null, free: true },
      { name: 'RansomLook', tools: 2, auth: 'none', key_env: null, free: true },
      { name: 'HIBP', tools: 4, auth: 'partial', key_env: 'HIBP_API_KEY', free: true },
      { name: 'ThreatFox', tools: 4, auth: 'none', key_env: null, free: true },
      { name: 'URLhaus', tools: 2, auth: 'none', key_env: null, free: true },
      { name: 'MalwareBazaar', tools: 3, auth: 'none', key_env: null, free: true },
      { name: 'AlienVault OTX', tools: 4, auth: 'optional', key_env: 'OTX_API_KEY', free: true },
      { name: 'Hybrid Analysis', tools: 2, auth: 'required', key_env: 'HYBRID_ANALYSIS_API_KEY', free: false },
    ],
    total_tools: 42,
    generated_at: new Date().toISOString(),
  });
});
