import apiApp from '../api/src/index';
import { LiveFeedDO } from './durable-objects/live-feed';
import { CronLockDO } from './durable-objects/cron-lock';
import { ReportBuilderDO } from './durable-objects/report-builder';
import { InvestigatorAgentDO } from './durable-objects/investigator-agent';
import { RadarCrawlerDO } from './durable-objects/radar-crawler';
import { GlobalPulseDO } from './durable-objects/global-pulse';
import { DfirMcpServer } from './mcp-server';
import { generateNonce, withSecurityHeaders } from './csp';
import { fetchPrerenderedOrShell } from './router';
import { handleOgImage } from './og-route';
import { handleBlogImage } from './blog-image-route';
import { handleScheduled } from './scheduled';
import { handleQueue } from './queue-consumer';
import { logStartupValidation } from './bindings';
import { validateRawKey } from '../api/src/lib/auth';
import type { Env } from './env';

export { LiveFeedDO, DfirMcpServer, CronLockDO, ReportBuilderDO, InvestigatorAgentDO, RadarCrawlerDO, GlobalPulseDO };
export type { Env };

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

/** Origins permitted to open the live-feed WebSocket (same set the API trusts).
 *  Localhost origins removed — in production, a malicious local service on
 *  those ports could open WebSocket connections. The dev server uses the same
 *  origin via `wrangler dev`, so localhost is not needed. */
const WS_ALLOWED_ORIGINS_STATIC = new Set(['https://pranithjain.qzz.io']);

/** Shared WebSocket origin guard. Returns true if the origin is allowed. */
function isWsOriginAllowed(request: Request, env: Env): boolean {
  const wsOrigin = request.headers.get('origin') ?? '';
  const wsAllowed = new Set(WS_ALLOWED_ORIGINS_STATIC);
  if (env.SITE_URL) wsAllowed.add(env.SITE_URL.replace(/\/$/, ''));
  return wsAllowed.has(wsOrigin);
}

/**
 * Generate a request ID for distributed tracing.
 * 128-bit random → hex (32 chars). Included in response headers and
 * structured logs so operators can correlate frontend errors with
 * backend traces via `x-request-id`.
 */
function generateRequestId(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return Array.from(b, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Cold-start binding validation. Logs a structured warning if any
    // critical binding (D1, KV, ASSETS) is missing in the deployed env —
    // the operator sees "deploy failed silently" symptoms as 503s on
    // the routes that depend on the missing binding, and this log
    // names the binding explicitly. Memoized internally so warm
    // requests are a no-op.
    logStartupValidation(env as unknown as Record<string, unknown>);

    // Honour an inbound x-request-id (operator curl) so a hand-driven
    // reproduction stays greppable through the entire request chain.
    // Falls back to a fresh 128-bit hex string per request. The api
    // app's own request-id middleware respects the same value.
    const inboundRid = request.headers.get('x-request-id');
    const requestId = inboundRid && /^[a-zA-Z0-9_-]{8,128}$/.test(inboundRid) ? inboundRid : generateRequestId();

    // WebSocket upgrade — route to the LiveFeed Durable Object
    if (url.pathname.startsWith('/api/v1/ws/live-feed') && request.headers.get('upgrade') === 'websocket') {
      if (!isWsOriginAllowed(request, env)) return new Response('forbidden origin', { status: 403 });
      if (!env.LIVE_FEED_DO) return new Response('WebSocket not configured', { status: 503 });
      const doId = env.LIVE_FEED_DO.idFromName('global');
      try {
        return await env.LIVE_FEED_DO.get(doId).fetch(request);
      } catch (err) {
        console.error('LIVE_FEED_DO fetch failed', err);
        return new Response('WebSocket unavailable', { status: 503 });
      }
    }

    // WebSocket upgrade — route to the InvestigatorAgent Durable Object
    if (url.pathname.startsWith('/api/v1/ws/agent/') && request.headers.get('upgrade') === 'websocket') {
      if (!isWsOriginAllowed(request, env)) return new Response('forbidden origin', { status: 403 });
      if (!env.INVESTIGATOR_AGENT) return new Response('Agent not configured', { status: 503 });
      // Extract the investigation ID from /api/v1/ws/agent/:id
      const agentId = url.pathname.split('/api/v1/ws/agent/')[1]?.split('/')[0];
      if (!agentId) return new Response('missing agent id', { status: 400 });
      const doId = env.INVESTIGATOR_AGENT.idFromName(agentId);
      try {
        return await env.INVESTIGATOR_AGENT.get(doId).fetch(request);
      } catch (err) {
        console.error('INVESTIGATOR_AGENT fetch failed', err);
        return new Response('Agent unavailable', { status: 503 });
      }
    }

    // WebSocket upgrade — route to the ReportBuilder Durable Object
    if (url.pathname.startsWith('/api/v1/ws/report/') && request.headers.get('upgrade') === 'websocket') {
      if (!isWsOriginAllowed(request, env)) return new Response('forbidden origin', { status: 403 });
      if (!env.REPORT_BUILDER) return new Response('Report builder not configured', { status: 503 });
      const reportId = url.pathname.split('/api/v1/ws/report/')[1]?.split('/')[0];
      if (!reportId) return new Response('missing report id', { status: 400 });
      const doId = env.REPORT_BUILDER.idFromName('global');
      try {
        return await env.REPORT_BUILDER.get(doId).fetch(request);
      } catch (err) {
        console.error('REPORT_BUILDER fetch failed', err);
        return new Response('Report builder unavailable', { status: 503 });
      }
    }

    // WebSocket upgrade — route to chat sessions
    if (url.pathname.startsWith('/api/v1/ws/chat/') && request.headers.get('upgrade') === 'websocket') {
      if (!isWsOriginAllowed(request, env)) return new Response('forbidden origin', { status: 403 });
      // Chat WS is handled inline in the api app via a dedicated handler
      // Forward to api app which has the chat WS logic
      const apiRes = await apiApp.fetch(request, env as Env, ctx);
      const h = new Headers(apiRes.headers);
      h.set('x-request-id', requestId);
      return new Response(apiRes.body, { status: apiRes.status, statusText: apiRes.statusText, headers: h });
    }

    // WebSocket upgrade — route to GlobalPulse Durable Object
    if (url.pathname === '/api/v1/ws/global-pulse' && request.headers.get('upgrade') === 'websocket') {
      if (!isWsOriginAllowed(request, env)) return new Response('forbidden origin', { status: 403 });
      if (!env.GLOBAL_PULSE_DO) return new Response('WebSocket not configured', { status: 503 });
      const doId = env.GLOBAL_PULSE_DO.idFromName('global');
      try {
        return await env.GLOBAL_PULSE_DO.get(doId).fetch(request);
      } catch (err) {
        console.error('GLOBAL_PULSE_DO fetch failed', err);
        return new Response('WebSocket unavailable', { status: 503 });
      }
    }

    // MCP server — DFIR & Threat Intel tools for AI agents. Wrap the response so
    // it carries the same security headers (CSP/HSTS/nosniff/…) as every other
    // surface instead of bypassing withSecurityHeaders.
    if (url.pathname.startsWith('/api/mcp')) {
      // Require a VALID API key to open an MCP session. Tools already key-gate
      // their downstream /api/v1 calls, but a presence-only check let a junk key
      // enumerate the tool list and spin up a DfirMcpServer Durable Object per
      // session (resource-exhaustion / enumeration). Validate against D1 here so
      // an unauthenticated caller can't open a session at all. CORS preflight
      // (OPTIONS) carries no credentials and must pass.
      if (request.method !== 'OPTIONS') {
        const authz = request.headers.get('authorization') ?? '';
        const rawKey = /^Bearer\s+(\S+)/i.exec(authz)?.[1] ?? request.headers.get('x-api-key') ?? '';
        const valid = env.BRIEFINGS_DB ? await validateRawKey(env.BRIEFINGS_DB, rawKey) : null;
        if (!valid) {
          return withSecurityHeaders(
            new Response(JSON.stringify({ error: 'valid api key required for MCP' }), {
              status: 401,
              headers: { 'content-type': 'application/json', 'www-authenticate': 'Bearer' },
            })
          );
        }
      }
      // SSE transport for clients that use GET to establish a connection
      // (VS Code, Cursor, MCP Inspector). Also handles POST messages to
      // the session-specific /api/mcp/sse/message?sessionId=... endpoint.
      // Streamable-http transport for /api/mcp (POST and GET-with-session).
      const isSse = url.pathname.startsWith('/api/mcp/sse');
      const mcpRes = isSse
        ? await DfirMcpServer.serveSSE('/api/mcp/sse', { binding: 'DFIR_MCP' }).fetch(request, env, ctx)
        : await DfirMcpServer.serve('/api/mcp', { binding: 'DFIR_MCP' }).fetch(request, env, ctx);
      return withSecurityHeaders(mcpRes);
    }

    // Dynamic OG card PNGs. Handled here, BEFORE the api-app forward, so the
    // anonymous crawler fetch bypasses the /api/v1/* key-gate. Never throws —
    // falls back to a static card on any data/render miss.
    if (url.pathname.startsWith('/api/v1/og-image/')) {
      const ogRes = await handleOgImage(request, env, url, ctx);
      const h = new Headers(ogRes.headers);
      h.set('x-request-id', requestId);
      return withSecurityHeaders(
        new Response(ogRes.body, { status: ogRes.status, statusText: ogRes.statusText, headers: h })
      );
    }

    // AI-generated blog illustrations. Public + before the /api/v1/* key-gate,
    // like the OG card route. Served from KV; falls through to 404 on a miss.
    if (url.pathname.startsWith('/api/v1/blog-image/')) {
      const imgRes = await handleBlogImage(url, env);
      return withSecurityHeaders(imgRes);
    }

    // Radar deep-crawl DO routes — require a valid API key (admin role).
    // These routes bypass the apiApp middleware chain, so auth must be
    // enforced here at the Worker level.
    if (url.pathname.startsWith('/api/v1/radar/crawl/')) {
      if (!env.RADAR_CRAWLER) {
        return withSecurityHeaders(
          new Response(JSON.stringify({ error: 'radar crawler not configured' }), {
            status: 503,
            headers: { 'content-type': 'application/json' },
          })
        );
      }
      // Authenticate: require a valid admin API key.
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

    // ── ARGUS dashboard proxy ─────────────────────────────────────────
    // Serves the full ARGUS threat-intel dashboard at /threatnexus from
    // the standalone deployment at argus-threat-intel.pages.dev.
    if (url.pathname === '/threatnexus' || url.pathname.startsWith('/threatnexus/')) {
      const subPath = url.pathname.replace(/^\/threatnexus\/?/, '/') || '/';
      return proxyToOrigin(request, ARGUS_ORIGIN, subPath + url.search, requestId);
    }

    // ── ARGUS API proxy ───────────────────────────────────────────────
    // ARGUS-specific API paths not handled by the portfolio's apiApp.
    // Require a valid API key — these routes bypass the apiApp middleware.
    if (ARGUS_API_PATHS.some((p) => url.pathname.startsWith(p))) {
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
      if (!user) {
        return withSecurityHeaders(
          new Response(JSON.stringify({ error: 'invalid api key' }), {
            status: 403,
            headers: { 'content-type': 'application/json' },
          })
        );
      }
      return proxyToOrigin(request, ARGUS_ORIGIN, url.pathname + url.search, requestId);
    }

    // Forward to the api app for the explicit /api/* prefix AND for the
    // legacy /blog/rss.xml route
    if (url.pathname.startsWith('/api/') || url.pathname === '/blog/rss.xml') {
      try {
        const apiRes = await apiApp.fetch(request, env as Env, ctx);
        const h = new Headers(apiRes.headers);
        h.set('x-request-id', requestId);
        return withSecurityHeaders(
          new Response(apiRes.body, {
            status: apiRes.status,
            statusText: apiRes.statusText,
            headers: h,
          })
        );
      } catch (err) {
        console.error('apiApp.fetch failed', err);
        return new Response('internal error', { status: 500 });
      }
    }

    // Generate a fresh nonce per HTML response
    const nonce = generateNonce();
    let html: Response;
    try {
      html = await fetchPrerenderedOrShell(request, env, ctx, url, nonce);
    } catch (err) {
      console.error('fetchPrerenderedOrShell failed', err);
      return new Response('internal error', { status: 500 });
    }
    const h = new Headers(html.headers);
    h.set('x-request-id', requestId);
    return withSecurityHeaders(
      new Response(html.body, {
        status: html.status,
        statusText: html.statusText,
        headers: h,
      }),
      nonce
    );
  },

  scheduled: handleScheduled,

  queue: handleQueue,
};
