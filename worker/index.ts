import apiApp from '../api/src/index';
import { LiveFeedDO } from './durable-objects/live-feed';
import { CronLockDO } from './durable-objects/cron-lock';
import { ReportBuilderDO } from './durable-objects/report-builder';
import { InvestigatorAgentDO } from './durable-objects/investigator-agent';
import { DfirMcpServer } from './mcp-server';
import { generateNonce, withSecurityHeaders } from './csp';
import { fetchPrerenderedOrShell } from './router';
import { handleScheduled } from './scheduled';
import { handleQueue } from './queue-consumer';
import { logStartupValidation } from './bindings';
import { validateRawKey } from '../api/src/lib/auth';
import type { Env } from './env';

export { LiveFeedDO, DfirMcpServer, CronLockDO, ReportBuilderDO, InvestigatorAgentDO };
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
