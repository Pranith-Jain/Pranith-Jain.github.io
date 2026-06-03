import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { authenticate } from '../../src/lib/auth';
import type { Env } from '../../src/env';

// Covers the external-read API-key gate added in d9a366c (which shipped without
// tests). The gate: external GET/HEAD need a key, UNLESS same-origin (website),
// OPTIONS preflight, or the OPEN_PUBLIC_READS valve.
function appWith(env: Partial<Env>) {
  const app = new Hono<{ Bindings: Env }>();
  app.use('*', authenticate('external-only'));
  app.all('/x', (c) => c.text('ok'));
  return (init: RequestInit & { method?: string } = {}) =>
    app.fetch(new Request('https://api.test/x', { method: init.method ?? 'GET', headers: init.headers }), env as Env);
}

describe('external-read auth gate (authenticate "external-only")', () => {
  it('401s an external GET with no key and the valve off', async () => {
    const res = await appWith({})({});
    expect(res.status).toBe(401);
  });

  it('allows an external GET when OPEN_PUBLIC_READS=true (emergency valve)', async () => {
    const res = await appWith({ OPEN_PUBLIC_READS: 'true' })({});
    expect(res.status).toBe(200);
  });

  it('allows a same-origin GET (website) with no key', async () => {
    const res = await appWith({ SITE_URL: 'https://site.test' })({
      headers: { origin: 'https://site.test' },
    });
    expect(res.status).toBe(200);
  });

  it('always allows OPTIONS preflight (no credentials)', async () => {
    const res = await appWith({})({ method: 'OPTIONS' });
    expect(res.status).toBe(200);
  });
});
