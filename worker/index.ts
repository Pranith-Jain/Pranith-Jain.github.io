import apiApp from '../api/src/index';
import { LiveFeedDO } from './durable-objects/live-feed';
import { CronLockDO } from './durable-objects/cron-lock';
import { ReportBuilderDO } from './durable-objects/report-builder';
import { InvestigatorAgentDO } from './durable-objects/investigator-agent';
import { RadarCrawlerDO } from './durable-objects/radar-crawler';
import { DfirMcpServer } from './mcp-server';
import { generateNonce, withSecurityHeaders } from './csp';
import { fetchPrerenderedOrShell } from './router';
import { handleOgImage } from './og-route';
import { handleScheduled } from './scheduled';
import { handleQueue } from './queue-consumer';
import { logStartupValidation } from './bindings';
import { validateRawKey } from '../api/src/lib/auth';
import type { Env } from './env';

export { LiveFeedDO, DfirMcpServer, CronLockDO, ReportBuilderDO, InvestigatorAgentDO, RadarCrawlerDO };
export type { Env };

/** Origins permitted to open the live-feed WebSocket (same set the API trusts). */
const WS_ALLOWED_ORIGINS_STATIC = new Set([
  'https://pranithjain.qzz.io',
  'http://localhost:5173',
  'http://localhost:8787',
]);

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
      // Reject cross-origin / origin-less upgrades. The live-feed DO is a single
      // global instance with a small connection cap, so an unauthenticated
      // cross-origin or scripted client could otherwise hold every slot (global
      // DoS). Browsers always send Origin on a WS handshake; accept only ours.
      const wsOrigin = request.headers.get('origin') ?? '';
      const wsAllowed = new Set(WS_ALLOWED_ORIGINS_STATIC);
      if (env.SITE_URL) wsAllowed.add(env.SITE_URL.replace(/\/$/, ''));
      if (!wsAllowed.has(wsOrigin)) {
        return new Response('forbidden origin', { status: 403 });
      }
      if (!env.LIVE_FEED_DO) return new Response('WebSocket not configured', { status: 503 });
      const doId = env.LIVE_FEED_DO.idFromName('global');
      return env.LIVE_FEED_DO.get(doId).fetch(request);
    }

    // WebSocket upgrade — route to the InvestigatorAgent Durable Object
    if (url.pathname.startsWith('/api/v1/ws/agent/') && request.headers.get('upgrade') === 'websocket') {
      const wsOrigin = request.headers.get('origin') ?? '';
      const wsAllowed = new Set(WS_ALLOWED_ORIGINS_STATIC);
      if (env.SITE_URL) wsAllowed.add(env.SITE_URL.replace(/\/$/, ''));
      if (!wsAllowed.has(wsOrigin)) {
        return new Response('forbidden origin', { status: 403 });
      }
      if (!env.INVESTIGATOR_AGENT) return new Response('Agent not configured', { status: 503 });
      // Extract the investigation ID from /api/v1/ws/agent/:id
      const agentId = url.pathname.split('/api/v1/ws/agent/')[1]?.split('/')[0];
      if (!agentId) return new Response('missing agent id', { status: 400 });
      const doId = env.INVESTIGATOR_AGENT.idFromName(agentId);
      return env.INVESTIGATOR_AGENT.get(doId).fetch(request);
    }

    // WebSocket upgrade — route to the ReportBuilder Durable Object
    if (url.pathname.startsWith('/api/v1/ws/report/') && request.headers.get('upgrade') === 'websocket') {
      const wsOrigin = request.headers.get('origin') ?? '';
      const wsAllowed = new Set(WS_ALLOWED_ORIGINS_STATIC);
      if (env.SITE_URL) wsAllowed.add(env.SITE_URL.replace(/\/$/, ''));
      if (!wsAllowed.has(wsOrigin)) {
        return new Response('forbidden origin', { status: 403 });
      }
      if (!env.REPORT_BUILDER) return new Response('Report builder not configured', { status: 503 });
      const reportId = url.pathname.split('/api/v1/ws/report/')[1]?.split('/')[0];
      if (!reportId) return new Response('missing report id', { status: 400 });
      const doId = env.REPORT_BUILDER.idFromName('global');
      return env.REPORT_BUILDER.get(doId).fetch(request);
    }

    // WebSocket upgrade — route to chat sessions
    if (url.pathname.startsWith('/api/v1/ws/chat/') && request.headers.get('upgrade') === 'websocket') {
      const wsOrigin = request.headers.get('origin') ?? '';
      const wsAllowed = new Set(WS_ALLOWED_ORIGINS_STATIC);
      if (env.SITE_URL) wsAllowed.add(env.SITE_URL.replace(/\/$/, ''));
      if (!wsAllowed.has(wsOrigin)) {
        return new Response('forbidden origin', { status: 403 });
      }
      // Chat WS is handled inline in the api app via a dedicated handler
      // Forward to api app which has the chat WS logic
      const apiRes = await apiApp.fetch(request, env as never, ctx);
      const h = new Headers(apiRes.headers);
      h.set('x-request-id', requestId);
      return new Response(apiRes.body, { status: apiRes.status, statusText: apiRes.statusText, headers: h });
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
      const mcpRes = await DfirMcpServer.serve('/api/mcp', { binding: 'DFIR_MCP' }).fetch(request, env, ctx);
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

    // Radar deep-crawl DO routes
    if (url.pathname.startsWith('/api/v1/radar/crawl/')) {
      if (!env.RADAR_CRAWLER) {
        return withSecurityHeaders(
          new Response(JSON.stringify({ error: 'radar crawler not configured' }), {
            status: 503,
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
      const doRes = await env.RADAR_CRAWLER.get(doId).fetch(doRequest);
      const h = new Headers(doRes.headers);
      h.set('x-request-id', requestId);
      return withSecurityHeaders(new Response(doRes.body, { status: doRes.status, headers: h }));
    }

    // Forward to the api app for the explicit /api/* prefix AND for the
    // legacy /blog/rss.xml route
    if (url.pathname.startsWith('/api/') || url.pathname === '/blog/rss.xml') {
      const apiRes = await apiApp.fetch(request, env as never, ctx);
      const h = new Headers(apiRes.headers);
      h.set('x-request-id', requestId);
      return withSecurityHeaders(
        new Response(apiRes.body, {
          status: apiRes.status,
          statusText: apiRes.statusText,
          headers: h,
        })
      );
    }

    // Generate a fresh nonce per HTML response
    const nonce = generateNonce();
    const html = await fetchPrerenderedOrShell(request, env, ctx, url, nonce);
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
