import type { Context } from 'hono';
import type { Env } from '../env';

const HR_BASE = 'https://cavalier.hudsonrock.com/api/json/v2/osint-tools';
const CACHE_TTL_SECONDS = 3600;

interface HudsonRockCredential {
  url: string;
  domain: string;
  username: string;
  password: string;
  type: 'employee' | 'user' | 'third_party';
}

interface HudsonRockStealerEntry {
  stealer: string;
  date_compromised: string;
  date_uploaded: string;
  stealer_family: string;
  ip: string;
  computer_name: string;
  operating_system: string;
  credentials: HudsonRockCredential[];
}

interface HudsonRockResponse {
  data: HudsonRockStealerEntry[];
  nextCursor?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DOMAIN_RE = /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

export async function hudsonRockSearchHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const email = c.req.query('email');
  if (!email) {
    return c.json({ error: 'email parameter required' }, 400);
  }
  if (!EMAIL_RE.test(email)) {
    return c.json({ error: 'invalid email format' }, 400);
  }

  const cacheKeyStr = `https://hr-cache.internal/v1-${encodeURIComponent(email)}`;
  const cacheReq = new Request(cacheKeyStr);
  const cached = await caches.default.match(cacheReq);
  if (cached) return new Response(cached.body, cached);

  try {
    const res = await fetch(`${HR_BASE}/search-by-email?email=${encodeURIComponent(email)}`, {
      headers: {
        accept: 'application/json',
        'user-agent': 'pranithjain.qzz.io DFIR toolkit',
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return c.json({ error: `Hudson Rock upstream ${res.status}` }, 502);

    const data = (await res.json()) as HudsonRockResponse;
    const totalCredentials = data.data.reduce((sum, entry) => sum + entry.credentials.length, 0);

    const body = JSON.stringify({
      email,
      found: data.data.length > 0,
      total_infections: data.data.length,
      total_credentials: totalCredentials,
      results: data.data.map((entry) => ({
        stealer_id: entry.stealer,
        stealer_family: entry.stealer_family,
        date_compromised: entry.date_compromised,
        date_uploaded: entry.date_uploaded,
        ip: entry.ip,
        computer_name: entry.computer_name,
        operating_system: entry.operating_system,
        credentials: entry.credentials.map((c) => ({
          url: c.url,
          domain: c.domain,
          username: c.username,
          type: c.type,
        })),
      })),
      generated_at: new Date().toISOString(),
    });

    const response = new Response(body, {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'cache-control': `public, max-age=${CACHE_TTL_SECONDS}`,
      },
    });
    c.executionCtx.waitUntil(caches.default.put(cacheReq, response.clone()));
    return response;
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'Hudson Rock unreachable' }, 502);
  }
}

export async function hudsonRockDomainHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const domain = c.req.query('domain');
  if (!domain) {
    return c.json({ error: 'domain parameter required' }, 400);
  }
  if (!DOMAIN_RE.test(domain)) {
    return c.json({ error: 'invalid domain format' }, 400);
  }

  const cacheKeyStr = `https://hr-cache.internal/domain-v1-${encodeURIComponent(domain)}`;
  const cacheReq = new Request(cacheKeyStr);
  const cached = await caches.default.match(cacheReq);
  if (cached) return new Response(cached.body, cached);

  try {
    const res = await fetch(`${HR_BASE}/search-by-domain?domain=${encodeURIComponent(domain)}`, {
      headers: {
        accept: 'application/json',
        'user-agent': 'pranithjain.qzz.io DFIR toolkit',
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return c.json({ error: `Hudson Rock upstream ${res.status}` }, 502);

    const data = await res.json();
    const body = JSON.stringify({
      domain,
      found: true,
      data,
      generated_at: new Date().toISOString(),
    });

    const response = new Response(body, {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'cache-control': `public, max-age=${CACHE_TTL_SECONDS}`,
      },
    });
    c.executionCtx.waitUntil(caches.default.put(cacheReq, response.clone()));
    return response;
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'Hudson Rock unreachable' }, 502);
  }
}
