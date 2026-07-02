/**
 * Radar deep-crawl Durable Object routes.
 * Handles /api/v1/radar/crawl/* with admin-key authentication.
 */

import { withSecurityHeaders } from './csp';
import { validateRawKey } from '../api/src/lib/auth';
import type { Env } from './env';

export async function handleRadarCrawl(
  request: Request,
  env: Env,
  url: URL,
  requestId: string
): Promise<Response | null> {
  if (!url.pathname.startsWith('/api/v1/radar/crawl/')) return null;

  if (!env.RADAR_CRAWLER) {
    return withSecurityHeaders(
      new Response(JSON.stringify({ error: 'radar crawler not configured' }), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      })
    );
  }

  const authz = request.headers.get('authorization') ?? '';
  const rawKey = /^Bearer\s+(\S+)/i.exec(authz)?.[1] ?? request.headers.get('x-api-key') ?? '';
  if (!rawKey || !env.BRIEFINGS_DB) {
    return withSecurityHeaders(
      new Response(JSON.stringify({ error: 'api key required' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      })
    );
  }
  const user = await validateRawKey(env.BRIEFINGS_DB, rawKey);
  if (!user || user.role !== 'admin') {
    return withSecurityHeaders(
      new Response(JSON.stringify({ error: 'admin api key required' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      })
    );
  }

  const crawlId = url.pathname.split('/api/v1/radar/crawl/')[1]?.split('/')[0];
  if (!crawlId) {
    return withSecurityHeaders(
      new Response(JSON.stringify({ error: 'missing crawl id' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      })
    );
  }

  const subPath = url.pathname.replace(`/api/v1/radar/crawl/${crawlId}`, '') || '/';
  const doUrl = new URL(subPath + url.search, request.url);
  const doRequest = new Request(doUrl, request);
  const doId = env.RADAR_CRAWLER.idFromName(crawlId);
  let doRes: Response;
  try {
    doRes = await env.RADAR_CRAWLER.get(doId).fetch(doRequest);
  } catch (err) {
    console.error('RADAR_CRAWLER fetch failed', err);
    return withSecurityHeaders(new Response('Crawler unavailable', { status: 503 }));
  }
  const h = new Headers(doRes.headers);
  h.set('x-request-id', requestId);
  return withSecurityHeaders(new Response(doRes.body, { status: doRes.status, headers: h }));
}
