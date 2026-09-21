/**
 * Tests for the VERIS + Engage routes (/api/v1/veris*, /api/v1/engage*).
 *
 * The routes read static manifests through env.ASSETS; stubbed here
 * with in-memory maps. Run from the repo root with the api workers pool
 * (sandbox disabled). CI skips test/routes/.
 */
import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../src/env';
import { verisRouter } from '../../src/routes/veris-edge-tools';
import { engageRouter } from '../../src/routes/engage-edge-tools';

function makeAssets() {
  const data = new Map<string, unknown>();

  data.set('/data/veris/index.json', {
    source: 'github.com/vz-risk/VERIS',
    license: 'CC BY-SA 4.0',
    replicatedAt: '2026-09-21',
    count: 2,
    sections: [{ section: 'action', fieldCount: 1, valueCount: 2 }],
    entries: [
      {
        slug: 'action-hacking-variety',
        path: 'action.hacking.variety',
        section: 'action',
        category: 'hacking',
        field: 'variety',
        values: [
          { value: 'Backdoor', label: 'Creates a backdoor.' },
          { value: 'Brute force', label: 'Password guessing.' },
        ],
      },
      {
        slug: 'actor-external-motive',
        path: 'actor.external.motive',
        section: 'actor',
        category: 'external',
        field: 'motive',
        values: [{ value: 'Espionage', label: '' }],
      },
    ],
  });

  data.set('/data/engage/index.json', {
    source: 'engage.mitre.org (MITRE Engage)',
    license: 'upstream-collection',
    replicatedAt: '2026-09-21',
    count: 2,
    phases: ['Engage', 'Prepare'],
    goals: [
      { name: 'Collect', phase: 'Engage', topGoal: 'Expose' },
      { name: 'Prepare', phase: 'Prepare', topGoal: 'Prepare' },
    ],
    approaches: [
      {
        slug: 'lures',
        name: 'Lures',
        goal: 'Detect',
        phase: 'Engage',
        topGoal: 'Expose',
        url: 'https://engage.mitre.org/matrix/',
      },
      {
        slug: 'threat-model',
        name: 'Threat Model',
        goal: 'Prepare',
        phase: 'Prepare',
        topGoal: 'Prepare',
        url: 'https://engage.mitre.org/matrix/',
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

describe('veris routes', () => {
  function setup() {
    const app = new Hono<{ Bindings: Env }>();
    app.route('/api/v1', verisRouter);
    return app;
  }

  it('stats returns totals + sections', async () => {
    const r = await setup().request('/api/v1/veris/stats', {}, makeEnv(), mockCtx());
    expect(r.status).toBe(200);
    const body = (await r.json()) as { total: number; license: string };
    expect(body.total).toBe(2);
    expect(body.license).toContain('CC BY-SA');
  });

  it('list filters by section and keyword', async () => {
    const app = setup();
    const env = makeEnv();
    const r1 = await app.request('/api/v1/veris?section=actor', {}, env, mockCtx());
    const b1 = (await r1.json()) as { fields: { slug: string }[] };
    expect(b1.fields.map((f) => f.slug)).toEqual(['actor-external-motive']);

    const r2 = await app.request('/api/v1/veris?q=backdoor', {}, env, mockCtx());
    const b2 = (await r2.json()) as { fields: { slug: string }[] };
    expect(b2.fields.map((f) => f.slug)).toEqual(['action-hacking-variety']);
  });

  it('get returns a single field, 404 for unknown slug', async () => {
    const app = setup();
    const env = makeEnv();
    const r1 = await app.request('/api/v1/veris/action-hacking-variety', {}, env, mockCtx());
    expect(r1.status).toBe(200);
    const b1 = (await r1.json()) as { values: unknown[] };
    expect(b1.values).toHaveLength(2);
    const r2 = await app.request('/api/v1/veris/nope', {}, env, mockCtx());
    expect(r2.status).toBe(404);
  });
});

describe('engage routes', () => {
  function setup() {
    const app = new Hono<{ Bindings: Env }>();
    app.route('/api/v1', engageRouter);
    return app;
  }

  it('stats returns totals + phases/goals', async () => {
    const r = await setup().request('/api/v1/engage/stats', {}, makeEnv(), mockCtx());
    expect(r.status).toBe(200);
    const body = (await r.json()) as { total: number; phases: string[] };
    expect(body.total).toBe(2);
    expect(body.phases).toEqual(expect.arrayContaining(['Engage', 'Prepare']));
  });

  it('list filters by goal, phase, and keyword', async () => {
    const app = setup();
    const env = makeEnv();
    const r1 = await app.request('/api/v1/engage?goal=expose', {}, env, mockCtx());
    const b1 = (await r1.json()) as { approaches: { slug: string }[] };
    expect(b1.approaches.map((a) => a.slug)).toEqual(['lures']);

    const r2 = await app.request('/api/v1/engage?phase=prepare', {}, env, mockCtx());
    const b2 = (await r2.json()) as { approaches: { slug: string }[] };
    expect(b2.approaches.map((a) => a.slug)).toEqual(['threat-model']);
  });

  it('get returns a single approach, 404 for unknown slug', async () => {
    const app = setup();
    const env = makeEnv();
    const r1 = await app.request('/api/v1/engage/lures', {}, env, mockCtx());
    expect(r1.status).toBe(200);
    const r2 = await app.request('/api/v1/engage/nope', {}, env, mockCtx());
    expect(r2.status).toBe(404);
  });
});
