import type { Context } from 'hono';
import type { Env } from '../env';

const CACHE_TTL_SECONDS = 3600;

export async function certspotterSearchHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const domain = c.req.query('domain') || c.req.query('q');
  if (!domain || domain.length > 200) return c.json({ error: 'domain parameter required (max 200)' }, 400);

  const cacheKey = `https://certspotter-cache.internal/v1-${encodeURIComponent(domain)}`;
  const cacheReq = new Request(cacheKey);
  const cached = await caches.default.match(cacheReq);
  if (cached) return new Response(cached.body, cached);

  try {
    const res = await fetch(
      `https://api.certspotter.com/v1/issuances?domain=${encodeURIComponent(domain)}&include_subdomains=true&expand=dns_names`,
      { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) return c.json({ error: `CertSpotter upstream ${res.status}` }, 502);

    const data = (await res.json()) as Array<{ dns_names?: string[] }>;
    const subdomains = new Set<string>();
    for (const cert of data.slice(0, 50)) {
      const names = cert?.dns_names as string[] | undefined;
      if (names) for (const n of names) subdomains.add(n.toLowerCase());
    }

    const sorted = [...subdomains].sort();
    const body = JSON.stringify({ count: sorted.length, subdomains: sorted, generated_at: new Date().toISOString() });
    const response = new Response(body, {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${CACHE_TTL_SECONDS}` },
    });
    c.executionCtx.waitUntil(caches.default.put(cacheReq, response.clone()));
    return response;
  } catch (e) {
    console.error('handler failed:', e instanceof Error ? e.message : String(e));
    return c.json({ error: e instanceof Error ? e.message : 'CertSpotter unreachable' }, 502);
  }
}
