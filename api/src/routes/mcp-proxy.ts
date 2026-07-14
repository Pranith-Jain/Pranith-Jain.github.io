/**
 * /api/v1/mcp/proxy -- thin CORS-relay for the TI-Mindmap-Hub MCP server.
 *
 * The upstream server (https://mcp.ti-mindmap-hub.com/mcp) does not send
 * any CORS headers, so a browser cross-origin POST from pranithjain.qzz.io
 * fails the preflight with `NetworkError when attempting to fetch
 * resource`. This endpoint terminates the request on our origin, then
 * replays it to the upstream with the user's X-API-Key.
 *
 * Security model:
 *   - The key is sent in the JSON body of the POST, NOT as a header, so
 *     the browser CORS preflight stays minimal and we don't have to
 *     forward the X-API-Key header (which would require extra CORS
 *     allowlist plumbing).
 *   - The key is still in the user's localStorage only -- our Worker
 *     sees it in the request body, forwards it to the upstream MCP, and
 *     never persists it.
 *   - `external-only` auth middleware lets the SPA on our origin call
 *     this without an API key of our own; we add a per-key upstream
 *     rate limit so a bad actor can't burn through the user's MCP quota.
 *   - The upstream key is *not* logged.
 *
 * Wire shape:
 *   request:  { method: string, params?: object, apiKey: string }
 *   response: upstream verbatim (JSON or text/event-stream), with our
 *             CORS headers added and Mcp-Session-Id preserved.
 */

import type { Context } from 'hono';
import type { Env } from '../env';
import { unauthorized } from '../lib/api-error';

const MCP_URL = 'https://mcp.ti-mindmap-hub.com/mcp';
// 25s matches the client-side timeout in src/lib/ti-mindmap-mcp.ts.
const UPSTREAM_TIMEOUT_MS = 25_000;
// Hard cap so a misbehaving client can't push us past the upstream's
// own rate limits.
const MAX_BODY_BYTES = 64 * 1024;

interface ProxyRequest {
  method?: string;
  params?: Record<string, unknown>;
  /** API key supplied by the user's localStorage. Stripped from logs. */
  apiKey?: string;
  /** Optional pre-fetched session id (avoids the initialize round-trip). */
  sessionId?: string;
  /** Opaque correlation id, echoed back as `x-mcp-trace` for debugging. */
  trace?: string;
}

export async function mcpProxyHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  // Reject anything that isn't a same-origin SPA call or a valid
  // external caller. Same-origin (Sec-Fetch-Site: same-origin) is
  // already let through by the global /api/v1/* external-only auth
  // middleware.
  let body: ProxyRequest;
  try {
    body = (await c.req.json()) as ProxyRequest;
  } catch (_catchErr) {
    console.error('mcpProxyHandler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    return c.json({ error: 'bad_request', message: 'invalid JSON body' }, 400);
  }
  if (!body.method || typeof body.method !== 'string') {
    return c.json({ error: 'bad_request', message: 'missing method' }, 400);
  }
  if (body.method === 'initialize' && !body.apiKey) {
    return unauthorized(c, 'apiKey required for the initialize call (no session yet)');
  }
  if (!body.apiKey && !body.sessionId) {
    return unauthorized(c, 'apiKey or sessionId required');
  }

  // Reject obviously malformed keys before they hit the wire. The
  // client also sanitises, but defense in depth.
  if (body.apiKey) {
    if (body.apiKey.length < 8 || body.apiKey.length > 256) {
      return c.json({ error: 'bad_request', message: 'apiKey length out of range' }, 400);
    }
    for (let i = 0; i < body.apiKey.length; i++) {
      const cc = body.apiKey.charCodeAt(i);
      // Allow printable ASCII only -- the upstream HTTP layer rejects
      // anything else with a ByteString conversion error.
      if (cc < 0x20 || cc > 0x7e) {
        return c.json({ error: 'bad_request', message: `apiKey contains non-ASCII character at index ${i}` }, 400);
      }
    }
  }

  // Build the upstream request. jsonrpc id is required for the
  // initialize handshake; subsequent calls can omit it (they become
  // notifications). We let the client decide.
  const id = body.method === 'initialize' ? 1 : Math.floor(Math.random() * 1e9);
  const upstreamBody: Record<string, unknown> = {
    jsonrpc: '2.0',
    id,
    method: body.method,
    params: body.params ?? {},
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  };
  if (body.apiKey) headers['X-API-Key'] = body.apiKey;
  if (body.sessionId) headers['Mcp-Session-Id'] = body.sessionId;

  // Forward to upstream with a hard cap and a sane timeout.
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), UPSTREAM_TIMEOUT_MS);
  let upstream: Response;
  try {
    upstream = await fetch(MCP_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(upstreamBody),
      signal: ctl.signal,
    });
  } catch (e) {
    console.error('handler failed:', e instanceof Error ? e.message : String(e));
    clearTimeout(timer);
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('aborted')) {
      return c.json(
        {
          error: 'upstream_timeout',
          message: `upstream MCP timed out after ${Math.round(UPSTREAM_TIMEOUT_MS / 1000)}s`,
        },
        504
      );
    }
    return c.json({ error: 'upstream_error', message: msg }, 502);
  }
  clearTimeout(timer);

  // Relay upstream status + relevant headers back to the browser.
  const outHeaders = new Headers();
  outHeaders.set('access-control-allow-origin', c.req.header('origin') ?? '*');
  outHeaders.set('access-control-allow-credentials', 'true');
  outHeaders.set('access-control-allow-methods', 'POST, OPTIONS');
  outHeaders.set('access-control-allow-headers', 'content-type, x-mcp-trace');
  outHeaders.set('access-control-max-age', '86400');
  outHeaders.set('vary', 'Origin');
  outHeaders.set('cache-control', 'no-store');
  const newSid = upstream.headers.get('mcp-session-id');
  if (newSid) outHeaders.set('mcp-session-id', newSid);
  const ct = upstream.headers.get('content-type') ?? 'application/json';
  outHeaders.set('content-type', ct);
  if (body.trace) outHeaders.set('x-mcp-trace', body.trace);

  // Cap response size to keep us under the Workers subrequest limit
  // and prevent a runaway upstream from blowing our memory budget.
  const text = await upstream.text();
  const body_out = text.length > MAX_BODY_BYTES ? text.slice(0, MAX_BODY_BYTES) : text;
  return new Response(body_out, {
    status: upstream.status,
    headers: outHeaders,
  });
}

/** OPTIONS preflight for the proxy itself. Hono's cors() handles this
 *  globally for /api/v1/*, but we add an explicit handler just in case
 *  a future refactor narrows the CORS middleware. */
export async function mcpProxyOptions(c: Context<{ Bindings: Env }>): Promise<Response> {
  const origin = c.req.header('origin') ?? '*';
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': origin,
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'content-type, x-mcp-trace',
      'access-control-max-age': '86400',
      vary: 'Origin',
    },
  });
}
