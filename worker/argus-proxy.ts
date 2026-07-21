/**
 * ARGUS threat-intel dashboard proxy.
 * Serves the ARGUS dashboard at /threatnexus and proxies /api/* paths
 * to the standalone ARGUS deployment.
 */

import { withSecurityHeaders } from './csp';
import { validateRawKey } from '../api/src/lib/auth';
import type { Env } from './env';

const ARGUS_ORIGIN = 'https://argus-threat-intel.pj-6a7.workers.dev';

const ARGUS_API_PATHS = ['/api/actors', '/api/feed', '/api/stats', '/api/health', '/api/stix/bundle'];

const PROXY_ALLOW_HEADERS = new Set([
  'accept',
  'accept-encoding',
  'accept-language',
  'content-type',
  'user-agent',
  'authorization',
  'x-api-key',
  'if-none-match',
  'if-modified-since',
]);

async function proxyToOrigin(request: Request, origin: string, subPath: string, requestId: string): Promise<Response> {
  try {
    const targetUrl = `${origin}${subPath}`;
    const filteredHeaders = new Headers();
    for (const [key, value] of request.headers) {
      if (PROXY_ALLOW_HEADERS.has(key.toLowerCase())) {
        filteredHeaders.set(key, value);
      }
    }
    const proxyReq = new Request(targetUrl, {
      method: request.method,
      headers: filteredHeaders,
      body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
      redirect: 'manual',
    });
    const res = await fetch(proxyReq);
    const h = new Headers(res.headers);
    h.set('x-request-id', requestId);
    const ct = h.get('content-type') ?? '';
    if (ct.includes('text/html')) {
      let html = await res.text();
      html = html.replace(
        /(href|src)="\/(assets\/|favicon\.svg|og-image\.svg|robots\.txt|sitemap\.xml|humans\.txt|llms\.txt)/g,
        '$1="/threatnexus/$2'
      );
      html = html.replace(/https:\/\/argus\.pranithjain\.qzz\.io\//g, 'https://pranithjain.qzz.io/threatnexus/');
      return new Response(html, { status: res.status, headers: h });
    }
    return new Response(res.body, { status: res.status, headers: h });
  } catch (err) {
    console.error(`proxyToOrigin failed: ${origin}${subPath}`, err);
    return new Response('origin unreachable', { status: 502 });
  }
}

/** Handle ARGUS dashboard routes (/threatnexus/*). Returns Response or null if not a match. */
export async function handleArgusDashboard(request: Request, url: URL, requestId: string): Promise<Response | null> {
  if (url.pathname !== '/threatnexus' && !url.pathname.startsWith('/threatnexus/')) return null;
  const subPath = url.pathname.replace(/^\/threatnexus\/?/, '/') || '/';
  return proxyToOrigin(request, ARGUS_ORIGIN, subPath + url.search, requestId);
}

/** Handle ARGUS API proxy routes. Returns Response or null if not a match. */
export async function handleArgusApi(
  request: Request,
  env: Env,
  url: URL,
  requestId: string
): Promise<Response | null> {
  if (!ARGUS_API_PATHS.some((p) => url.pathname.startsWith(p))) return null;

  const authz = request.headers.get('authorization') ?? '';
  const rawKey = /^Bearer\s+(\S+)/i.exec(authz)?.[1] ?? request.headers.get('x-api-key') ?? '';
  if (!rawKey || !env.BRIEFINGS_DB) {
    return withSecurityHeaders(
      new Response(JSON.stringify({ error: 'api key required' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
      undefined,
      url.origin
    );
  }
  const user = await validateRawKey(env.BRIEFINGS_DB, rawKey);
  if (!user) {
    return withSecurityHeaders(
      new Response(JSON.stringify({ error: 'invalid api key' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      }),
      undefined,
      url.origin
    );
  }
  return proxyToOrigin(request, ARGUS_ORIGIN, url.pathname + url.search, requestId);
}
