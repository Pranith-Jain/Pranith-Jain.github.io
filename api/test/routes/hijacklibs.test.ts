/**
 * Tests for the HijackLibs routes (/api/v1/hijacklibs*).
 *
 * The routes read the static manifest through env.ASSETS; stubbed here
 * with an in-memory map. Run from the repo root with the api workers pool
 * (sandbox disabled), e.g. the api-tests-unsandboxed loop in docs/loops/.
 * CI skips test/routes/.
 */
import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../src/env';
import { hijacklibsRouter } from '../../src/routes/hijacklibs-edge-tools';

function makeAssets() {
  const data = new Map<string, unknown>();

  data.set('/data/hijacklibs/index.json', {
    source: 'hijacklibs.net (Wietze Beukema)',
    license: 'upstream-collection',
    replicatedAt: '2026-09-21',
    count: 2,
    hijackTypes: ['Phantom', 'Sideloading'],
    typeCounts: { Phantom: 1, Sideloading: 1 },
    withCve: 1,
    entries: [
      {
        slug: 'test-dll',
        dll: 'test.dll',
        vendor: 'TestVendor',
        cve: 'CVE-2024-1234',
        hijackTypes: ['Sideloading'],
        executableCount: 1,
        executables: [{ path: '%PROGRAMFILES%\\Test\\app.exe', type: 'Sideloading' }],
        expectedLocations: [],
        resourceCount: 0,
        description: 'test.dll is a known DLL hijacking candidate.',
        url: 'https://hijacklibs.net/entries/test/test.html',
      },
      {
        slug: 'phantom-dll',
        dll: 'phantom.dll',
        vendor: 'OtherVendor',
        cve: null,
        hijackTypes: ['Phantom'],
        executableCount: 1,
        executables: [],
        expectedLocations: [],
        resourceCount: 0,
        description: 'phantom.dll is a known DLL hijacking candidate.',
        url: 'https://hijacklibs.net/entries/other/phantom.html',
      },
    ],
  });

  return {
    fetch: async (req: Request) => {
      const url = new URL(req.url);
      const body = data.get(url.pathname);
      if (body === undefined) return new Response(null, { status: 404 });
      return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
    },
  } as unknown as Fetcher;
}

function setup() {
  const app = new Hono<{ Bindings: Env }>();
  app.route('/api/v1', hijacklibsRouter);
  return app;
}

function mockCtx() {
  return { waitUntil: (_p: Promise<unknown>) => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;
}

function makeEnv(): Env {
  return { ASSETS: makeAssets() } as Env;
}

describe('hijacklibs routes', () => {
  it('stats returns totals + type counts', async () => {
    const r = await setup().request('/api/v1/hijacklibs/stats', {}, makeEnv(), mockCtx());
    expect(r.status).toBe(200);
    const body = (await r.json()) as { total: number; withCve: number; hijackTypes: string[] };
    expect(body.total).toBe(2);
    expect(body.withCve).toBe(1);
    expect(body.hijackTypes).toEqual(expect.arrayContaining(['Phantom', 'Sideloading']));
  });

  it('list filters by type, cve, and keyword', async () => {
    const app = setup();
    const env = makeEnv();
    const r1 = await app.request('/api/v1/hijacklibs?type=phantom', {}, env, mockCtx());
    const b1 = (await r1.json()) as { dlls: { slug: string }[] };
    expect(b1.dlls.map((d) => d.slug)).toEqual(['phantom-dll']);

    const r2 = await app.request('/api/v1/hijacklibs?cve=true', {}, env, mockCtx());
    const b2 = (await r2.json()) as { dlls: { slug: string }[] };
    expect(b2.dlls.map((d) => d.slug)).toEqual(['test-dll']);

    const r3 = await app.request('/api/v1/hijacklibs?q=othervendor', {}, env, mockCtx());
    const b3 = (await r3.json()) as { dlls: { slug: string }[] };
    expect(b3.dlls.map((d) => d.slug)).toEqual(['phantom-dll']);
  });

  it('get returns a single DLL, 404 for unknown slug', async () => {
    const app = setup();
    const env = makeEnv();
    const r1 = await app.request('/api/v1/hijacklibs/test-dll', {}, env, mockCtx());
    expect(r1.status).toBe(200);
    const b1 = (await r1.json()) as { cve: string };
    expect(b1.cve).toBe('CVE-2024-1234');
    const r2 = await app.request('/api/v1/hijacklibs/nope', {}, env, mockCtx());
    expect(r2.status).toBe(404);
  });
});
