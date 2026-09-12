/**
 * Tests for the unified exposure search (/api/v1/exposure/check).
 * Seeds the ransomware edge cache, stubs ASSETS (manifests absent →
 * providers degrade), mocks Heatwave upstream HTML.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../src/env';
import { exposureCheckHandler } from '../../src/routes/exposure-check';
import { RANSOMWARE_RECENT_CACHE_KEY } from '../../src/routes/ransomware-recent';

const NOT_LISTED_HTML = `<html><body><main>
<p>Do not enter a URL, email address, or IP address.</p>
<h2>Not currently listed exposed.example This domain is not on the Heatwave Domain Blocklist.</h2>
</main></body></html>`;

function setup() {
  const app = new Hono<{ Bindings: Env }>();
  app.get('/api/v1/exposure/check', exposureCheckHandler);
  return app;
}

function makeEnv(): Env {
  const assets = {
    fetch: async () => new Response('not found', { status: 404 }),
  } as unknown as Fetcher;
  return { ASSETS: assets } as Env;
}

function mockCtx() {
  return { waitUntil: (_p: Promise<unknown>) => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;
}

function req(app: ReturnType<typeof setup>, path: string, env: Env) {
  return app.request(path, {}, env, mockCtx());
}

beforeEach(() => vi.restoreAllMocks());

describe('exposure check route', () => {
  it('merges a ransomware hit into a critical verdict', async () => {
    const cache = (caches as unknown as { default: Cache }).default;
    await cache.put(
      new Request(RANSOMWARE_RECENT_CACHE_KEY),
      new Response(
        JSON.stringify({ victims: [{ victim: 'Kelmarsh Logistics', group: 'lockbit', discovered: '2026-09-01' }] }),
        {
          status: 200,
          headers: { 'cache-control': 'public, max-age=3600' },
        }
      )
    );
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(NOT_LISTED_HTML, { status: 200 }));

    const r = await req(setup(), '/api/v1/exposure/check?domain=kelmarsh.co', makeEnv());
    expect(r.status).toBe(200);
    const body = (await r.json()) as {
      domain: string;
      verdict: string;
      sections: {
        ransomware: { status: string; hits: { victim: string }[] };
        heatwave: { status: string; listed: boolean };
      };
    };
    expect(body.domain).toBe('kelmarsh.co');
    expect(body.verdict).toBe('critical');
    expect(body.sections.ransomware.hits).toHaveLength(1);
    expect(body.sections.heatwave.listed).toBe(false);
  });

  it('reports unknown (never clean) when nothing matches', async () => {
    const cache = (caches as unknown as { default: Cache }).default;
    await cache.put(
      new Request(RANSOMWARE_RECENT_CACHE_KEY),
      new Response(JSON.stringify({ victims: [{ victim: 'Someone Else', group: 'x', discovered: '2026-09-01' }] }), {
        status: 200,
        headers: { 'cache-control': 'public, max-age=3600' },
      })
    );
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(NOT_LISTED_HTML, { status: 200 }));

    const r = await req(setup(), '/api/v1/exposure/check?domain=quiet.example', makeEnv());
    expect(r.status).toBe(200);
    const body = (await r.json()) as { verdict: string; notes: string[] };
    expect(body.verdict).toBe('unknown');
    expect(body.notes.join(' ')).toContain('clean bill');
  });

  it('rejects non-domains with 400', async () => {
    const app = setup();
    const env = makeEnv();
    for (const bad of ['1.2.3.4', '', 'not a domain']) {
      const r = await app.request(`/api/v1/exposure/check?domain=${encodeURIComponent(bad)}`, {}, env, mockCtx());
      expect(r.status).toBe(400);
    }
  });
});
