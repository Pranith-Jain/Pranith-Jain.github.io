import apiApp from '../api/src/index';
import { LiveFeedDO } from './durable-objects/live-feed';
import { DfirMcpServer } from './mcp-server';
import { generateNonce, withSecurityHeaders } from './csp';
import { fetchPrerenderedOrShell } from './router';
import { handleScheduled } from './scheduled';
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
    const requestId = generateRequestId();

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
      return withSecurityHeaders(new Response(apiRes.body, {
        status: apiRes.status,
        statusText: apiRes.statusText,
        headers: h,
      }));
    }

    // Generate a fresh nonce per HTML response
    const nonce = generateNonce();
    const html = await fetchPrerenderedOrShell(request, env, ctx, url, nonce);
    const h = new Headers(html.headers);
    h.set('x-request-id', requestId);
    return withSecurityHeaders(new Response(html.body, {
      status: html.status,
      statusText: html.statusText,
      headers: h,
    }), nonce);
  },

  scheduled: handleScheduled,
};
