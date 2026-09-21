/**
 * Tests for the CTI Bookmarks routes (/api/v1/cti-bookmarks*).
 *
 * The routes read the static manifest through env.ASSETS; stubbed here
 * with an in-memory map. Run from the repo root with the api workers pool
 * (sandbox disabled), e.g. the api-tests-unsandboxed loop in docs/loops/.
 * CI skips test/routes/.
 */
import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../src/env';
import { ctiBookmarksRouter } from '../../src/routes/cti-bookmarks-edge-tools';

function makeAssets() {
  const data = new Map<string, unknown>();

  data.set('/data/cti-bookmarks/index.json', {
    source: 'github.com/Chick3nHawk01/Open_Source-CTI-Tooling',
    license: 'upstream-collection',
    replicatedAt: '2026-09-21',
    count: 4,
    levels: ['Operational', 'Tactical'],
    categories: [
      { level: 'Operational', category: 'IoC Feeds & Sharing', count: 2 },
      { level: 'Tactical', category: 'TTP & Technique References', count: 2 },
    ],
    statusCounts: { live: 2, reference: 1, missing: 1 },
    entries: [
      {
        slug: 'threatfox',
        name: 'ThreatFox',
        url: 'https://threatfox.abuse.ch/',
        host: 'threatfox.abuse.ch',
        level: 'Operational',
        category: 'IoC Feeds & Sharing',
        description: 'Community IoC Exchange',
        status: 'live',
        platformRef: 'threatfox',
        tags: ['operational', 'ioc'],
      },
      {
        slug: 'firehol',
        name: 'FireHOL',
        url: 'http://iplists.firehol.org/',
        host: 'iplists.firehol.org',
        level: 'Operational',
        category: 'IoC Feeds & Sharing',
        description: 'Collection of IoC Lists',
        status: 'missing',
        platformRef: null,
        tags: ['operational', 'ioc'],
      },
      {
        slug: 'lolbas',
        name: 'LOLBAS',
        url: 'https://lolbas-project.github.io/',
        host: 'lolbas-project.github.io',
        level: 'Tactical',
        category: 'TTP & Technique References',
        description: 'Living Off The Land Windows Binaries',
        status: 'live',
        platformRef: 'lolbas',
        tags: ['tactical', 'ttp'],
      },
      {
        slug: 'malapi-io',
        name: 'MalAPI.io',
        url: 'https://malapi.io/',
        host: 'malapi.io',
        level: 'Tactical',
        category: 'TTP & Technique References',
        description: 'Windows APIs used by attackers',
        status: 'reference',
        platformRef: null,
        tags: ['tactical', 'ttp'],
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
  app.route('/api/v1', ctiBookmarksRouter);
  return app;
}

function mockCtx() {
  return { waitUntil: (_p: Promise<unknown>) => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;
}

function makeEnv(): Env {
  return { ASSETS: makeAssets() } as Env;
}

describe('cti-bookmarks routes', () => {
  it('stats returns totals + gap counts', async () => {
    const r = await setup().request('/api/v1/cti-bookmarks/stats', {}, makeEnv(), mockCtx());
    expect(r.status).toBe(200);
    const body = (await r.json()) as {
      total: number;
      levels: string[];
      statusCounts: { live: number; reference: number; missing: number };
    };
    expect(body.total).toBe(4);
    expect(body.levels).toEqual(expect.arrayContaining(['Operational', 'Tactical']));
    expect(body.statusCounts.live + body.statusCounts.reference + body.statusCounts.missing).toBe(body.total);
  });

  it('list filters by status and keyword', async () => {
    const app = setup();
    const env = makeEnv();
    const r1 = await app.request('/api/v1/cti-bookmarks?status=missing', {}, env, mockCtx());
    expect(r1.status).toBe(200);
    const b1 = (await r1.json()) as { bookmarks: { slug: string; status: string }[] };
    expect(b1.bookmarks.map((b) => b.slug)).toEqual(['firehol']);

    const r2 = await app.request('/api/v1/cti-bookmarks?q=lolbas', {}, env, mockCtx());
    const b2 = (await r2.json()) as { bookmarks: { slug: string }[] };
    expect(b2.bookmarks.map((b) => b.slug)).toEqual(['lolbas']);
  });

  it('get returns a single bookmark, 404 for unknown slug', async () => {
    const app = setup();
    const env = makeEnv();
    const r1 = await app.request('/api/v1/cti-bookmarks/malapi-io', {}, env, mockCtx());
    expect(r1.status).toBe(200);
    const b1 = (await r1.json()) as { slug: string; status: string };
    expect(b1.slug).toBe('malapi-io');

    const r2 = await app.request('/api/v1/cti-bookmarks/no-such-slug', {}, env, mockCtx());
    expect(r2.status).toBe(404);
  });

  it('categories returns the bookmark folders', async () => {
    const r = await setup().request('/api/v1/cti-bookmarks/categories', {}, makeEnv(), mockCtx());
    expect(r.status).toBe(200);
    const body = (await r.json()) as { categories: { category: string }[] };
    expect(body.categories.map((c) => c.category)).toEqual(
      expect.arrayContaining(['IoC Feeds & Sharing', 'TTP & Technique References'])
    );
  });
});
