/**
 * Tests for the ransomware-groups directory routes
 * (/api/v1/ransomware-groups*).
 *
 * The routes read the static manifest through env.ASSETS; stubbed here
 * with an in-memory map. Run from the repo root with the api workers pool
 * (sandbox disabled), e.g. the api-tests-unsandboxed loop in docs/loops/.
 * CI skips test/routes/.
 */
import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../src/env';
import { ransomwareGroupsRouter } from '../../src/routes/ransomware-groups';

const NOW = Date.now();
const isoDaysAgo = (n: number) => new Date(NOW - n * 24 * 3600 * 1000).toISOString();

function makeAssets() {
  const data = new Map<string, unknown>();

  data.set('/data/ransomware-groups/index.json', {
    source: 'test',
    sourceUrl: 'https://example.invalid/',
    license: 'test',
    syncedAt: null,
    builtAt: new Date().toISOString(),
    counts: { groups: 2, sites_up: 1, active_week: 2, profiled: 1, with_activity: 2 },
    groups: [
      {
        slug: 'akira',
        name: 'akira',
        victims_7d: 5,
        victims_total: 100,
        last_seen: isoDaysAgo(1),
        origins: ['ransomlook'],
        online: false,
        mirrors: 1,
        up_mirrors: 0,
        has_profile: true,
        blurb: 'Double extortion.',
        shard: 0,
      },
      {
        slug: 'clop',
        name: 'clop',
        victims_7d: 9,
        victims_total: 400,
        last_seen: isoDaysAgo(0),
        origins: ['ransomlook'],
        online: true,
        mirrors: 2,
        up_mirrors: 2,
        has_profile: false,
        blurb: 'MOVEit crew.',
      },
    ],
    recent: ['clop', 'akira'],
  });

  const akiraBody = {
    slug: 'akira',
    name: 'akira',
    victims_7d: 5,
    victims_total: 100,
    last_seen: isoDaysAgo(1),
    origins: ['ransomlook'],
    online: false,
    mirrors: 1,
    up_mirrors: 0,
    has_profile: true,
    blurb: 'Double extortion.',
    meta: 'Akira meta (abridged)',
    meta_source: 'Ransomlook group profile (abridged, screen bytes omitted)',
    mirrors_detail: [{ fqdn: 'akiraxyz.onion', title: null, available: false, updated: isoDaysAgo(1), version: 3 }],
    victims_sample: [
      {
        victim: 'Example Corp',
        discovered: isoDaysAgo(1),
        origin: 'ransomlook',
        source_url: 'https://example.invalid/',
      },
    ],
    source_urls: { ransomlook: 'https://example.invalid/akira', ransomware_live: 'https://example.invalid/' },
  };
  data.set('/data/ransomware-groups/groups/shard-0000.json', { akira: akiraBody });

  return {
    fetch: vi.fn(async (req: Request) => {
      const path = new URL(req.url).pathname;
      const hit = data.get(path);
      if (!hit) return new Response('not found', { status: 404 });
      return new Response(JSON.stringify(hit), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }),
  } as unknown as Fetcher;
}

function makeEnv(): Env {
  return { ASSETS: makeAssets() } as Env;
}

function setup() {
  const app = new Hono<{ Bindings: Env }>();
  app.route('/api/v1', ransomwareGroupsRouter);
  return app;
}

describe('ransomware-groups routes', () => {
  it('GET / returns headline counts + recent slugs', async () => {
    const r = await setup().request('/api/v1/ransomware-groups/', {}, makeEnv());
    expect(r.status).toBe(200);
    const body = (await r.json()) as {
      counts: { groups: number; sites_up: number; active_week: number };
      recent: string[];
    };
    expect(body.counts.groups).toBe(2);
    expect(body.counts.sites_up).toBe(1);
    expect(body.recent).toEqual(['clop', 'akira']);
  });

  it('GET /groups filters by status + search', async () => {
    const app = setup();
    const env = makeEnv();
    const online = (await (await app.request('/api/v1/ransomware-groups/groups?status=online', {}, env)).json()) as {
      groups: { slug: string }[];
    };
    expect(online.groups.map((g) => g.slug)).toEqual(['clop']);
    const q = (await (await app.request('/api/v1/ransomware-groups/groups?q=moveit', {}, env)).json()) as {
      groups: { slug: string }[];
    };
    expect(q.groups.map((g) => g.slug)).toEqual(['clop']);
  });

  it('GET /groups/:slug returns the shipped body', async () => {
    const r = await setup().request('/api/v1/ransomware-groups/groups/akira', {}, makeEnv());
    expect(r.status).toBe(200);
    const body = (await r.json()) as { meta: string; mirrors_detail: unknown[] };
    expect(body.meta).toContain('abridged');
    expect(body.mirrors_detail).toHaveLength(1);
  });

  it('GET /groups/:slug synthesises a body for rows without a body file', async () => {
    const r = await setup().request('/api/v1/ransomware-groups/groups/clop', {}, makeEnv());
    expect(r.status).toBe(200);
    const body = (await r.json()) as { slug: string; meta: null; victims_sample: unknown[] };
    expect(body.slug).toBe('clop');
    expect(body.meta).toBeNull();
    expect(body.victims_sample).toEqual([]);
  });

  it('GET /groups/:slug 404s unknown slugs', async () => {
    const r = await setup().request('/api/v1/ransomware-groups/groups/nope', {}, makeEnv());
    expect(r.status).toBe(404);
  });

  it('GET /stats returns counts', async () => {
    const r = await setup().request('/api/v1/ransomware-groups/stats', {}, makeEnv());
    expect(r.status).toBe(200);
    const body = (await r.json()) as { counts: { groups: number } };
    expect(body.counts.groups).toBe(2);
  });
});
