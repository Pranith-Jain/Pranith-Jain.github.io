import apiApp from '../api/src/index';
import { LiveFeedDO } from './durable-objects/live-feed';
import { DfirMcpServer } from './mcp-server';
import { generateNonce, withSecurityHeaders } from './csp';
import { fetchPrerenderedOrShell } from './router';
import { handleScheduled } from './scheduled';
import type { Env } from './env';

export { LiveFeedDO, DfirMcpServer };
export type { Env };

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

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
      return withSecurityHeaders(apiRes);
    }

    // Generate a fresh nonce per HTML response
    const nonce = generateNonce();
    const html = await fetchPrerenderedOrShell(request, env, ctx, url, nonce);
    return withSecurityHeaders(html, nonce);
  },

  scheduled: handleScheduled,
};
