import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { authenticate, valveOpenUntilMs } from '../../src/lib/auth';
import { signFeedToken } from '../../src/lib/feed-token';
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

  it('keeps reads gated for legacy bare OPEN_PUBLIC_READS=true (fail closed)', async () => {
    const res = await appWith({ OPEN_PUBLIC_READS: 'true' })({});
    expect(res.status).toBe(401);
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

  // Fix A: same-origin GET fetches omit Origin and may have Referer stripped;
  // Sec-Fetch-Site is the robust signal the browser always sends.
  it('exempts a same-origin GET via Sec-Fetch-Site with NO Origin/Referer', async () => {
    const res = await appWith({})({ headers: { 'sec-fetch-site': 'same-origin' } });
    expect(res.status).toBe(200);
  });

  it('does NOT exempt same-site (single-origin SPA only reports same-origin)', async () => {
    const res = await appWith({})({ headers: { 'sec-fetch-site': 'same-site' } });
    expect(res.status).toBe(401);
  });

  it('401s a cross-site GET (Sec-Fetch-Site: cross-site, no key, valve off)', async () => {
    const res = await appWith({})({ headers: { 'sec-fetch-site': 'cross-site' } });
    expect(res.status).toBe(401);
  });

  it('ignores Sec-Fetch-Site when a foreign Origin is also present', async () => {
    const res = await appWith({})({
      headers: { 'sec-fetch-site': 'same-origin', origin: 'https://evil.example' },
    });
    expect(res.status).toBe(401);
  });

  it('401s a Sec-Fetch-Site: none navigation with no key', async () => {
    const res = await appWith({})({ headers: { 'sec-fetch-site': 'none' } });
    expect(res.status).toBe(401);
  });
});

// Fix B: the valve expires deterministically across isolates (no per-isolate timer).
describe('OPEN_PUBLIC_READS valve expiry', () => {
  it('opens reads while a future ISO/epoch-ms expiry has not passed', async () => {
    const futureIso = new Date(Date.now() + 60_000).toISOString();
    expect((await appWith({ OPEN_PUBLIC_READS: futureIso })({})).status).toBe(200);
    const futureMs = String(Date.now() + 60_000);
    expect((await appWith({ OPEN_PUBLIC_READS: futureMs })({})).status).toBe(200);
  });

  it('keeps reads gated once the expiry has passed', async () => {
    const pastIso = new Date(Date.now() - 60_000).toISOString();
    expect((await appWith({ OPEN_PUBLIC_READS: pastIso })({})).status).toBe(401);
  });

  it('treats blank/garbage values as closed', async () => {
    expect((await appWith({ OPEN_PUBLIC_READS: '' })({})).status).toBe(401);
    expect((await appWith({ OPEN_PUBLIC_READS: 'maybe' })({})).status).toBe(401);
  });

  it('valveOpenUntilMs parses the supported forms', () => {
    expect(valveOpenUntilMs(undefined)).toBeNull();
    expect(valveOpenUntilMs('')).toBeNull();
    expect(valveOpenUntilMs('nope')).toBeNull();
    expect(valveOpenUntilMs('true')).toBeNull();
    expect(valveOpenUntilMs('TRUE')).toBeNull();
    expect(valveOpenUntilMs('1893456000000')).toBe(1893456000000);
    expect(valveOpenUntilMs('2030-01-01T00:00:00Z')).toBe(Date.parse('2030-01-01T00:00:00Z'));
  });
});

// Feed-token gate, end to end through the middleware.
//
// /api/v1/cve-digest/rss shipped in #266 and was NOT in EXEMPT_PATHS, so a
// real reader (Feedly, Inoreader — no Sec-Fetch-Site, no Origin, no API key)
// got a 401 and the "Subscribe as RSS" button was decorative. The alternatives
// were "make it public" (EXEMPT_PATHS, enumerable by anyone) or "a signed
// path-scoped token in ?key=". These tests pin the security half of that
// choice, which is easy to regress by accident: a token that unlocks one feed
// must not unlock anything else.
describe('feed-token auth gate', () => {
  const SECRET = 'gate-test-secret';
  const RSS = '/api/v1/cve-digest/rss';

  function feedApp(env: Partial<Env>) {
    const app = new Hono<{ Bindings: Env }>();
    app.use('*', authenticate('external-only'));
    app.get(RSS, (c) => c.text('feed'));
    app.get('/api/v1/cve-digest', (c) => c.text('json'));
    app.get('/api/v1/cve-digest/csv', (c) => c.text('csv'));
    return (path: string) => app.fetch(new Request(`https://api.test${path}`), env as Env);
  }

  it('401s a reader with no token, and 200s the same request with one', async () => {
    const call = feedApp({ FEED_TOKEN_SECRET: SECRET });
    const token = await signFeedToken(RSS, SECRET);
    expect((await call(RSS)).status).toBe(401);
    expect((await call(`${RSS}?key=${encodeURIComponent(token)}`)).status).toBe(200);
  });

  it('401s a wrong, truncated or absent-signature token', async () => {
    const call = feedApp({ FEED_TOKEN_SECRET: SECRET });
    const token = await signFeedToken(RSS, SECRET);
    for (const bad of ['nope', token.slice(0, -4), `${token}x`, '0.0', token.replace(/\..*$/, '.')]) {
      expect((await call(`${RSS}?key=${encodeURIComponent(bad)}`)).status, bad).toBe(401);
    }
  });

  it('does NOT let a valid feed token unlock the JSON or CSV siblings', async () => {
    const call = feedApp({ FEED_TOKEN_SECRET: SECRET });
    const token = await signFeedToken(RSS, SECRET);
    // This is the regression that matters: the bulk-pull surfaces stay
    // key-gated, so a token pasted into a reader cannot become a data export.
    expect((await call(`/api/v1/cve-digest?key=${encodeURIComponent(token)}`)).status).toBe(401);
    expect((await call(`/api/v1/cve-digest/csv?key=${encodeURIComponent(token)}`)).status).toBe(401);
  });

  it('401s the feed when no secret is configured (fails closed, not open)', async () => {
    const call = feedApp({});
    const token = await signFeedToken(RSS, SECRET);
    expect((await call(`${RSS}?key=${encodeURIComponent(token)}`)).status).toBe(401);
  });

  it('accepts the token via `token=` as well as `key=`', async () => {
    const call = feedApp({ FEED_TOKEN_SECRET: SECRET });
    const token = await signFeedToken(RSS, SECRET);
    expect((await call(`${RSS}?token=${encodeURIComponent(token)}`)).status).toBe(200);
  });

  it('rejects a token signed with a different secret', async () => {
    const call = feedApp({ FEED_TOKEN_SECRET: 'other-secret' });
    const token = await signFeedToken(RSS, SECRET);
    expect((await call(`${RSS}?key=${encodeURIComponent(token)}`)).status).toBe(401);
  });
});
