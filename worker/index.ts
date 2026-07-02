import apiApp from '../api/src/index';
import { LiveFeedDO } from './durable-objects/live-feed';
import { CronLockDO } from './durable-objects/cron-lock';
import { ReportBuilderDO } from './durable-objects/report-builder';
import { InvestigatorAgentDO } from './durable-objects/investigator-agent';
import { RadarCrawlerDO } from './durable-objects/radar-crawler';
import { GlobalPulseDO } from './durable-objects/global-pulse';
import { generateNonce, withSecurityHeaders } from './csp';
import { fetchPrerenderedOrShell } from './router';
import { handleOgImage } from './og-route';
import { handleBlogImage } from './blog-image-route';
import { handleScheduled } from './scheduled';
import { handleQueue } from './queue-consumer';
import { logStartupValidation } from './bindings';
import { handleWebSocketUpgrade } from './ws-router';
import { handleMcp } from './mcp-handler';
import { DfirMcpServer } from './mcp-server';
import { handleRadarCrawl } from './radar-handler';
import { handleArgusDashboard, handleArgusApi } from './argus-proxy';
import type { Env } from './env';

export { LiveFeedDO, DfirMcpServer, CronLockDO, ReportBuilderDO, InvestigatorAgentDO, RadarCrawlerDO, GlobalPulseDO };
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

    // Cold-start binding validation.
    logStartupValidation(env as unknown as Record<string, unknown>);

    // Honour an inbound x-request-id (operator curl) so a hand-driven
    // reproduction stays greppable through the entire request chain.
    const inboundRid = request.headers.get('x-request-id');
    const requestId = inboundRid && /^[a-zA-Z0-9_-]{8,128}$/.test(inboundRid) ? inboundRid : generateRequestId();

    // WebSocket upgrades — route to Durable Objects or API handler
    const wsRes = await handleWebSocketUpgrade(request, env, ctx, url, requestId);
    if (wsRes) return wsRes;

    // MCP server — DFIR & Threat Intel tools for AI agents
    const mcpRes = await handleMcp(request, env, ctx, url);
    if (mcpRes) return mcpRes;

    // Dynamic OG card PNGs (public, before /api/v1/* key-gate)
    if (url.pathname.startsWith('/api/v1/og-image/')) {
      const ogRes = await handleOgImage(request, env, url, ctx);
      const h = new Headers(ogRes.headers);
      h.set('x-request-id', requestId);
      return withSecurityHeaders(
        new Response(ogRes.body, { status: ogRes.status, statusText: ogRes.statusText, headers: h })
      );
    }

    // AI-generated blog illustrations (public, before /api/v1/* key-gate)
    if (url.pathname.startsWith('/api/v1/blog-image/')) {
      const imgRes = await handleBlogImage(url, env);
      return withSecurityHeaders(imgRes);
    }

    // Radar deep-crawl DO routes (admin-key required)
    const radarRes = await handleRadarCrawl(request, env, url, requestId);
    if (radarRes) return radarRes;

    // ARGUS dashboard proxy (/threatnexus/*)
    const argusDashRes = await handleArgusDashboard(request, url, requestId);
    if (argusDashRes) return argusDashRes;

    // ARGUS API proxy (/api/actors, /api/feed, etc.)
    const argusApiRes = await handleArgusApi(request, env, url, requestId);
    if (argusApiRes) return argusApiRes;

    // Forward /api/* and legacy /blog/rss.xml to the API app
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

    // SPA shell fallback — serve prerendered HTML or the shell for client routing
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
