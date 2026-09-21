/**
 * Tests for the CAR + CAPEC routes (/api/v1/car*, /api/v1/capec*).
 *
 * The routes read static manifests through env.ASSETS; stubbed here
 * with in-memory maps. Run from the repo root with the api workers pool
 * (sandbox disabled), e.g. the api-tests-unsandboxed loop in docs/loops/.
 * CI skips test/routes/.
 */
import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../src/env';
import { carRouter } from '../../src/routes/car-edge-tools';
import { capecRouter } from '../../src/routes/capec-edge-tools';

function makeAssets() {
  const data = new Map<string, unknown>();

  data.set('/data/car/index.json', {
    source: 'github.com/mitre-attack/car',
    license: 'Apache-2.0',
    replicatedAt: '2026-09-21',
    count: 2,
    techniqueCount: 2,
    entries: [
      {
        slug: 'car-2013-01-002',
        carId: 'CAR-2013-01-002',
        title: 'Autorun Differences',
        description: 'Running Autoruns periodically makes monitoring possible.',
        domain: 'Analytic, Host',
        platforms: ['Windows'],
        analyticTypes: ['TTP'],
        techniques: [{ technique: 'T1543', tactics: ['TA0003'], subtechniques: [], coverage: 'Moderate' }],
        techniqueIds: ['T1543'],
        d3fend: [{ id: 'D3-SICA', label: 'System Init Config Analysis' }],
        implementations: ['pseudocode'],
        references: [],
        url: 'https://car.mitre.org/analytics/CAR-2013-01-002',
      },
      {
        slug: 'car-2019-04-002',
        carId: 'CAR-2019-04-002',
        title: 'Test Example',
        description: 'Network-based analytic example.',
        domain: 'Analytic, Network',
        platforms: ['Linux'],
        analyticTypes: ['TTP'],
        techniques: [{ technique: 'T1048', tactics: ['TA0010'], subtechniques: [], coverage: 'Partial' }],
        techniqueIds: ['T1048'],
        d3fend: [],
        implementations: ['Splunk'],
        references: [],
        url: 'https://car.mitre.org/analytics/CAR-2019-04-002',
      },
    ],
  });

  data.set('/data/capec/index.json', {
    source: 'github.com/mitre/cti (CAPEC STIX 2.0)',
    license: 'upstream-collection',
    replicatedAt: '2026-09-21',
    count: 2,
    byAbstraction: { Standard: 2 },
    byStatus: { Draft: 1, Stable: 1 },
    entries: [
      {
        slug: 'capec-87',
        capecId: 'CAPEC-87',
        name: 'Forceful Browsing',
        abstraction: 'Standard',
        status: 'Draft',
        likelihood: 'High',
        severity: 'High',
        domains: ['Software'],
        description: 'An attacker employs forceful browsing.',
        prerequisites: '',
        cweIds: ['CWE-425'],
        attackIds: [],
        url: 'https://capec.mitre.org/data/definitions/87.html',
      },
      {
        slug: 'capec-125',
        capecId: 'CAPEC-125',
        name: 'Flooding',
        abstraction: 'Standard',
        status: 'Stable',
        likelihood: 'High',
        severity: 'Medium',
        domains: ['Software'],
        description: 'An attacker floods a target.',
        prerequisites: '',
        cweIds: ['CWE-400'],
        attackIds: ['T1498'],
        url: 'https://capec.mitre.org/data/definitions/125.html',
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

describe('car routes', () => {
  function setup() {
    const app = new Hono<{ Bindings: Env }>();
    app.route('/api/v1', carRouter);
    return app;
  }

  it('stats returns totals + technique coverage', async () => {
    const r = await setup().request('/api/v1/car/stats', {}, makeEnv(), mockCtx());
    expect(r.status).toBe(200);
    const body = (await r.json()) as { total: number; techniqueCount: number };
    expect(body.total).toBe(2);
    expect(body.techniqueCount).toBe(2);
  });

  it('list filters by technique and keyword', async () => {
    const app = setup();
    const env = makeEnv();
    const r1 = await app.request('/api/v1/car?technique=t1543', {}, env, mockCtx());
    const b1 = (await r1.json()) as { analytics: { slug: string }[] };
    expect(b1.analytics.map((a) => a.slug)).toEqual(['car-2013-01-002']);

    const r2 = await app.request('/api/v1/car?q=splunk', {}, env, mockCtx());
    const b2 = (await r2.json()) as { analytics: { slug: string }[] };
    expect(b2.analytics.map((a) => a.slug)).toEqual(['car-2019-04-002']);
  });

  it('get returns a single analytic, 404 for unknown slug', async () => {
    const app = setup();
    const env = makeEnv();
    const r1 = await app.request('/api/v1/car/car-2013-01-002', {}, env, mockCtx());
    expect(r1.status).toBe(200);
    const r2 = await app.request('/api/v1/car/nope', {}, env, mockCtx());
    expect(r2.status).toBe(404);
  });
});

describe('capec routes', () => {
  function setup() {
    const app = new Hono<{ Bindings: Env }>();
    app.route('/api/v1', capecRouter);
    return app;
  }

  it('stats returns totals by abstraction/status', async () => {
    const r = await setup().request('/api/v1/capec/stats', {}, makeEnv(), mockCtx());
    expect(r.status).toBe(200);
    const body = (await r.json()) as { total: number; byStatus: Record<string, number> };
    expect(body.total).toBe(2);
    expect(body.byStatus).toEqual({ Draft: 1, Stable: 1 });
  });

  it('list filters by cwe, technique, and keyword', async () => {
    const app = setup();
    const env = makeEnv();
    const r1 = await app.request('/api/v1/capec?cwe=CWE-400', {}, env, mockCtx());
    const b1 = (await r1.json()) as { patterns: { slug: string }[] };
    expect(b1.patterns.map((p) => p.slug)).toEqual(['capec-125']);

    const r2 = await app.request('/api/v1/capec?technique=T1498', {}, env, mockCtx());
    const b2 = (await r2.json()) as { patterns: { slug: string }[] };
    expect(b2.patterns.map((p) => p.slug)).toEqual(['capec-125']);

    const r3 = await app.request('/api/v1/capec?q=forceful', {}, env, mockCtx());
    const b3 = (await r3.json()) as { patterns: { slug: string }[] };
    expect(b3.patterns.map((p) => p.slug)).toEqual(['capec-87']);
  });

  it('get returns a single pattern, 404 for unknown slug', async () => {
    const app = setup();
    const env = makeEnv();
    const r1 = await app.request('/api/v1/capec/capec-87', {}, env, mockCtx());
    expect(r1.status).toBe(200);
    const b1 = (await r1.json()) as { name: string };
    expect(b1.name).toBe('Forceful Browsing');
    const r2 = await app.request('/api/v1/capec/nope', {}, env, mockCtx());
    expect(r2.status).toBe(404);
  });
});
