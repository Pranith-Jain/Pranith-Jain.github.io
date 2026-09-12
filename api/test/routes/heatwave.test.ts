/**
 * Tests for the Heatwave lookup route (/api/v1/heatwave/lookup).
 * Upstream HTML is mocked; the Cache API comes from the workers pool.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../src/env';
import { heatwaveLookupHandler } from '../../src/routes/heatwave';

const LISTED_HTML = `
<html><body><main>
<p>Check domain Enter a domain. Do not enter a URL, email address, or IP address.</p>
<h2>Listed Warming listed.example Synthetic reputation warming observed</h2>
<p>Classification Warming Observation age &lt; 7 days since first observation Listing score 71 / 100</p>
<p>First observed 2026-09-12 Last observed 2026-09-12 Listed since 2026-09-12</p>
<p>DNS answer listed.example.bl.validity.tools → 127.0.71.2</p>
</main></body></html>`;

const CLEAN_HTML = `
<html><body><main>
<p>Do not enter a URL, email address, or IP address.</p>
<h2>Not currently listed safe.example This domain is not on the Heatwave Domain Blocklist.</h2>
</main></body></html>`;

function setup() {
  const app = new Hono<{ Bindings: Env }>();
  app.get('/api/v1/heatwave/lookup', heatwaveLookupHandler);
  return app;
}

/**
 * `app.request()` builds a context with NO ExecutionContext (accessing
 * `c.executionCtx` throws), so pass an explicit mock — the handler's
 * bare `waitUntil` calls match every other route (prod always has one).
 */
function mockCtx() {
  return { waitUntil: (_p: Promise<unknown>) => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;
}

function req(app: ReturnType<typeof setup>, path: string, env: Env) {
  return app.request(path, {}, env, mockCtx());
}

function makeEnv(): Env {
  return {} as Env;
}

beforeEach(() => vi.restoreAllMocks());

describe('heatwave lookup route', () => {
  it('returns a graded listing for a warming domain', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(LISTED_HTML, { status: 200 }));
    const r = await req(setup(), '/api/v1/heatwave/lookup?domain=listed.example', makeEnv());
    expect(r.status).toBe(200);
    const body = (await r.json()) as {
      domain: string;
      listed: boolean;
      status: string;
      stage: number;
      verdict: string;
      score: number;
      source_url: string;
    };
    expect(body.domain).toBe('listed.example');
    expect(body.listed).toBe(true);
    expect(body.status).toBe('warming');
    expect(body.stage).toBe(2);
    expect(body.verdict).toBe('suspicious');
    expect(body.source_url).toContain('lookup.validity.tools');
  });

  it('returns unknown (not clean) for an unlisted domain', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(CLEAN_HTML, { status: 200 }));
    const r = await req(setup(), '/api/v1/heatwave/lookup?domain=safe.example', makeEnv());
    expect(r.status).toBe(200);
    const body = (await r.json()) as { listed: boolean; verdict: string; score: number };
    expect(body.listed).toBe(false);
    expect(body.verdict).toBe('unknown');
    expect(body.score).toBe(0);
  });

  it('rejects IPs and non-domains with 400 (URLs/emails normalize to domains)', async () => {
    const app = setup();
    const env = makeEnv();
    for (const bad of ['1.2.3.4', '', 'not a domain', 'com']) {
      const r = await app.request(`/api/v1/heatwave/lookup?domain=${encodeURIComponent(bad)}`, {}, env, mockCtx());
      expect(r.status).toBe(400);
    }
  });

  it('502s when upstream fails with no cache to fall back on', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('boom'));
    const r = await req(setup(), '/api/v1/heatwave/lookup?domain=flaky.example', makeEnv());
    expect(r.status).toBe(502);
  });
});
