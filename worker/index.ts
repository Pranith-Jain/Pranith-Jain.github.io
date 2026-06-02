import apiApp from '../api/src/index';
import { LiveFeedDO } from './durable-objects/live-feed';
import { DfirMcpServer } from './mcp-server';
import { generateNonce, withSecurityHeaders } from './csp';
import { fetchPrerenderedOrShell } from './router';
import { handleScheduled } from './scheduled';
import { logStartupValidation } from './bindings';
import type { Env } from './env';

export { LiveFeedDO, DfirMcpServer };
export type { Env };

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
    logStartupValidation(env);

    // Honour an inbound x-request-id (operator curl) so a hand-driven
    // reproduction stays greppable through the entire request chain.
    // Falls back to a fresh 128-bit hex string per request. The api
    // app's own request-id middleware respects the same value.
    const inboundRid = request.headers.get('x-request-id');
    const requestId = inboundRid && /^[a-zA-Z0-9_-]{8,128}$/.test(inboundRid) ? inboundRid : generateRequestId();

    // WebSocket upgrade — route to the LiveFeed Durable Object
    if (url.pathname.startsWith('/api/v1/ws/live-feed') && request.headers.get('upgrade') === 'websocket') {
      const doId = env.LIVE_FEED_DO.idFromName('global');
      return env.LIVE_FEED_DO.get(doId).fetch(request);
    }

    // MCP server — DFIR & Threat Intel tools for AI agents
    if (url.pathname.startsWith('/api/mcp')) {
      return DfirMcpServer.serve('/api/mcp', { binding: 'DFIR_MCP' }).fetch(request, env, ctx);
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
};
