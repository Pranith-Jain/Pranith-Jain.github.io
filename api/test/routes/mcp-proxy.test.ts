/**
 * Tests for the MCP proxy CORS behaviour (/api/v1/mcp/proxy).
 *
 * Regression: the handler builds its own `Response`, which discards the
 * headers set by the global `cors()` middleware, and used to echo the caller's
 * `Origin` back verbatim alongside `access-control-allow-credentials: true` —
 * the reflect-and-allow pattern. The origin is now resolved against the
 * canonical allowlist (getAllowedOrigins) and the credentials header is gone.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../src/env';
import { mcpProxyHandler, mcpProxyOptions } from '../../src/routes/mcp-proxy';

const SITE_URL = 'https://pranithjain.qzz.io';
// Must be >= 8 printable-ASCII chars or the handler rejects it before CORS.
const VALID_KEY = 'upstream-test-key-0123456789';

function setup() {
  const app = new Hono<{ Bindings: Env }>();
  app.post('/api/v1/mcp/proxy', mcpProxyHandler);
  app.options('/api/v1/mcp/proxy', mcpProxyOptions);
  return app;
}

function env(): Env {
  return { SITE_URL } as unknown as Env;
}

async function post(app: Hono<{ Bindings: Env }>, origin: string | null, body: unknown) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (origin !== null) headers.origin = origin;
  return app.request('/api/v1/mcp/proxy', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    // `Sec-Fetch-Site` is what the global auth middleware keys the
    // same-origin exemption on; this test exercises the CORS layer only.
    env: env(),
  } as never);
}

describe('mcp-proxy CORS', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } }))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not reflect an unknown Origin', async () => {
    const res = await post(setup(), 'https://evil.example', { method: 'tools/list', apiKey: VALID_KEY });
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('never sets access-control-allow-credentials', async () => {
    const res = await post(setup(), SITE_URL, { method: 'tools/list', apiKey: VALID_KEY });
    expect(res.headers.get('access-control-allow-credentials')).toBeNull();
  });

  it('echoes the Origin only when it is on the allowlist', async () => {
    const res = await post(setup(), SITE_URL, { method: 'tools/list', apiKey: VALID_KEY });
    expect(res.headers.get('access-control-allow-origin')).toBe(SITE_URL);
    expect(res.headers.get('vary')).toContain('Origin');
  });

  it('omits the allow-origin header for a same-origin (no Origin) request', async () => {
    const res = await post(setup(), null, { method: 'tools/list', apiKey: VALID_KEY });
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
    expect(res.status).toBe(200);
  });

  it('applies the same allowlist to the preflight', async () => {
    const app = setup();
    const bad = await app.request('/api/v1/mcp/proxy', {
      method: 'OPTIONS',
      headers: { origin: 'https://evil.example' },
      env: env(),
    } as never);
    expect(bad.headers.get('access-control-allow-origin')).toBeNull();

    const good = await app.request('/api/v1/mcp/proxy', {
      method: 'OPTIONS',
      headers: { origin: SITE_URL },
      env: env(),
    } as never);
    expect(good.status).toBe(204);
    expect(good.headers.get('access-control-allow-origin')).toBe(SITE_URL);
  });
});
