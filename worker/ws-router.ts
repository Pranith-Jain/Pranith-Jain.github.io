/**
 * WebSocket upgrade routing — dispatches /api/v1/ws/* connections to the
 * appropriate Durable Object or API handler.
 */

import apiApp from '../api/src/index';
import type { Env } from './env';

/** Static allow-list of WebSocket origins, allocated once at module scope. */
const WS_ALLOWED_ORIGINS_STATIC = new Set(['https://pranithjain.qzz.io']);

/** Shared WebSocket origin guard. Returns true if the origin is allowed. */
export function isWsOriginAllowed(request: Request, env: Env): boolean {
  const wsOrigin = request.headers.get('origin') ?? '';
  if (WS_ALLOWED_ORIGINS_STATIC.has(wsOrigin)) return true;
  if (env.SITE_URL && env.SITE_URL.replace(/\/$/, '') === wsOrigin) return true;
  return false;
}

export async function handleWebSocketUpgrade(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  url: URL,
  requestId: string
): Promise<Response | null> {
  if (request.headers.get('upgrade') !== 'websocket') return null;

  // LiveFeed DO
  if (url.pathname.startsWith('/api/v1/ws/live-feed')) {
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

  // InvestigatorAgent DO
  if (url.pathname.startsWith('/api/v1/ws/agent/')) {
    if (!isWsOriginAllowed(request, env)) return new Response('forbidden origin', { status: 403 });
    if (!env.INVESTIGATOR_AGENT) return new Response('Agent not configured', { status: 503 });
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

  // ReportBuilder DO
  if (url.pathname.startsWith('/api/v1/ws/report/')) {
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

  // Chat WS — forwarded to apiApp (logic lives in the API layer)
  if (url.pathname.startsWith('/api/v1/ws/chat/')) {
    if (!isWsOriginAllowed(request, env)) return new Response('forbidden origin', { status: 403 });
    const apiRes = await apiApp.fetch(request, env as Env, ctx);
    const h = new Headers(apiRes.headers);
    h.set('x-request-id', requestId);
    return new Response(apiRes.body, { status: apiRes.status, statusText: apiRes.statusText, headers: h });
  }

  // GlobalPulse DO
  if (url.pathname === '/api/v1/ws/global-pulse') {
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

  return null;
}
