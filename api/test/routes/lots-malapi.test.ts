/**
 * Tests for the LOTS + MalAPI routes (/api/v1/lots*, /api/v1/malapi*).
 *
 * The routes read static manifests through env.ASSETS; stubbed here
 * with in-memory maps. Run from the repo root with the api workers pool
 * (sandbox disabled), e.g. the api-tests-unsandboxed loop in docs/loops/.
 * CI skips test/routes/.
 */
import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../src/env';
import { lotsRouter } from '../../src/routes/lots-edge-tools';
import { malapiRouter } from '../../src/routes/malapi-edge-tools';

function makeAssets() {
  const data = new Map<string, unknown>();

  data.set('/data/lots/index.json', {
    source: 'lots-project.com (mr.d0x)',
    license: 'upstream-collection',
    replicatedAt: '2026-09-21',
    count: 2,
    tags: ['C&C', 'Phishing'],
    tagCounts: { 'C&C': 1, Phishing: 1 },
    entries: [
      {
        slug: 'github-com',
        website: 'github.com',
        provider: 'Github',
        tags: ['Phishing'],
        description: 'Attackers can host malware on Github.com.',
        url: 'https://lots-project.com/site/6769746875622e636f6d',
      },
      {
        slug: 'discord-com',
        website: 'discord.com',
        provider: 'Discord',
        tags: ['C&C'],
        description: 'Attackers can utilize discord.com for C&C purposes.',
        url: 'https://lots-project.com/site/646973636f72642e636f6d',
      },
    ],
  });

  data.set('/data/malapi/index.json', {
    source: 'malapi.io (mr.d0x)',
    license: 'upstream-collection',
    replicatedAt: '2026-09-21',
    count: 2,
    categories: ['Enumeration', 'Injection'],
    entries: [
      {
        slug: 'process32first',
        name: 'Process32First',
        library: 'Kernel32.dll',
        categories: ['Enumeration'],
        associatedAttacks: ['Enumeration'],
        description: 'Process32First is used for enumeration purposes.',
        documentation: 'https://docs.microsoft.com/en-us/windows/win32/api/tlhelp32/nf-tlhelp32-process32first',
        url: 'https://malapi.io/winapi/Process32First',
      },
      {
        slug: 'createremotethread',
        name: 'CreateRemoteThread',
        library: 'Kernel32.dll',
        categories: ['Injection'],
        associatedAttacks: ['Injection'],
        description: 'CreateRemoteThread is used to create a thread in another process.',
        documentation: '',
        url: 'https://malapi.io/winapi/CreateRemoteThread',
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

function mockCtx() {
  return { waitUntil: (_p: Promise<unknown>) => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;
}

function makeEnv(): Env {
  return { ASSETS: makeAssets() } as Env;
}

describe('lots routes', () => {
  function setup() {
    const app = new Hono<{ Bindings: Env }>();
    app.route('/api/v1', lotsRouter);
    return app;
  }

  it('stats returns totals + tag counts', async () => {
    const r = await setup().request('/api/v1/lots/stats', {}, makeEnv(), mockCtx());
    expect(r.status).toBe(200);
    const body = (await r.json()) as { total: number; tags: string[] };
    expect(body.total).toBe(2);
    expect(body.tags).toEqual(expect.arrayContaining(['C&C', 'Phishing']));
  });

  it('list filters by tag and keyword', async () => {
    const app = setup();
    const env = makeEnv();
    const r1 = await app.request('/api/v1/lots?tag=C%26C', {}, env, mockCtx());
    const b1 = (await r1.json()) as { sites: { slug: string }[] };
    expect(b1.sites.map((s) => s.slug)).toEqual(['discord-com']);

    const r2 = await app.request('/api/v1/lots?q=malware', {}, env, mockCtx());
    const b2 = (await r2.json()) as { sites: { slug: string }[] };
    expect(b2.sites.map((s) => s.slug)).toEqual(['github-com']);
  });

  it('get returns a single site, 404 for unknown slug', async () => {
    const app = setup();
    const env = makeEnv();
    const r1 = await app.request('/api/v1/lots/github-com', {}, env, mockCtx());
    expect(r1.status).toBe(200);
    const r2 = await app.request('/api/v1/lots/nope', {}, env, mockCtx());
    expect(r2.status).toBe(404);
  });
});

describe('malapi routes', () => {
  function setup() {
    const app = new Hono<{ Bindings: Env }>();
    app.route('/api/v1', malapiRouter);
    return app;
  }

  it('stats returns totals + categories', async () => {
    const r = await setup().request('/api/v1/malapi/stats', {}, makeEnv(), mockCtx());
    expect(r.status).toBe(200);
    const body = (await r.json()) as { total: number; categories: string[] };
    expect(body.total).toBe(2);
    expect(body.categories).toEqual(expect.arrayContaining(['Enumeration', 'Injection']));
  });

  it('list filters by category and keyword', async () => {
    const app = setup();
    const env = makeEnv();
    const r1 = await app.request('/api/v1/malapi?category=Injection', {}, env, mockCtx());
    const b1 = (await r1.json()) as { apis: { slug: string }[] };
    expect(b1.apis.map((a) => a.slug)).toEqual(['createremotethread']);

    const r2 = await app.request('/api/v1/malapi?q=thread', {}, env, mockCtx());
    const b2 = (await r2.json()) as { apis: { slug: string }[] };
    expect(b2.apis.map((a) => a.slug)).toEqual(['createremotethread']);
  });

  it('get returns a single API, 404 for unknown slug', async () => {
    const app = setup();
    const env = makeEnv();
    const r1 = await app.request('/api/v1/malapi/process32first', {}, env, mockCtx());
    expect(r1.status).toBe(200);
    const b1 = (await r1.json()) as { library: string };
    expect(b1.library).toBe('Kernel32.dll');
    const r2 = await app.request('/api/v1/malapi/nope', {}, env, mockCtx());
    expect(r2.status).toBe(404);
  });
});
