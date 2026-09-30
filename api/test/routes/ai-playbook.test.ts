/**
 * Tests for the AI Security Playbook routes (/api/v1/ai-playbook*).
 *
 * The routes read the static manifest through env.ASSETS; stubbed here with an
 * in-memory map. Run from the api directory with the workers pool and the
 * sandbox disabled, e.g. the api-tests-unsandboxed loop in docs/loops/.
 *
 * The load-bearing assertion is the LICENCE SCOPE test at the bottom: these
 * endpoints must never start serving upstream prose. aisecurity.zone declares no
 * reuse licence, so the contract is structure, identifiers and links only.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../src/env';
import { aiPlaybookRouter } from '../../src/routes/ai-playbook-edge-tools';
import { resetAiPlaybookCache } from '../../src/lib/ai-playbook-manifest';

const INDEX = {
  source: 'test',
  sourceUrl: 'https://aisecurity.zone/',
  author: 'Test',
  license: 'No reuse licence declared — structure only',
  licenseNote: 'no prose',
  replicatedAt: '2026-09-30T00:00:00.000Z',
  scope: 'structure-only',
  structureVerifiedAt: '2026-09-30T00:00:00.000Z',
  counts: { layers: 3, chapters: 5, riskIds: 4, owaspLlm: 2, agenticAsi: 2, cveRefs: 2 },
  layers: [
    { id: 'I', name: 'The model', slug: 'model', chapters: 2, summary: 's', url: 'u', riskIds: ['LLM01', 'LLM02'] },
    { id: 'II', name: 'The context window', slug: 'context', chapters: 2, summary: 's', url: 'u', riskIds: ['ASI01', 'ASI02'] },
    { id: 'III', name: 'The agent loop', slug: 'loop', chapters: 1, summary: 's', url: 'u', riskIds: [] },
  ],
  riskIds: [
    { id: 'LLM01', url: 'https://aisecurity.zone/reference/by-id/#LLM01', name: 'Prompt Injection', scheme: 'owasp-llm', layer: 'I', layerName: 'The model' },
    { id: 'LLM02', url: 'https://aisecurity.zone/reference/by-id/#LLM02', name: 'Excessive Agency', scheme: 'owasp-llm', layer: 'I', layerName: 'The model' },
    { id: 'ASI01', url: 'https://aisecurity.zone/reference/by-id/#ASI01', name: 'Agent Goal Hijack', scheme: 'agentic-asi', layer: 'II', layerName: 'The context window' },
    { id: 'ASI02', url: 'https://aisecurity.zone/reference/by-id/#ASI02', name: 'Tool Misuse', scheme: 'agentic-asi', layer: 'II', layerName: 'The context window' },
  ],
  cveRefs: ['CVE-2026-0001', 'CVE-2026-0002'],
};

const KEV = [
  {
    cveId: 'CVE-2026-0001',
    vendor: 'Acme',
    product: 'Widget',
    name: 'RCE',
    dateAdded: '2026-09-01',
    dueDate: '2026-09-20',
  },
];

function makeAssets(): Fetcher {
  const files: Record<string, unknown> = {
    '/data/ai-playbook/index.json': INDEX,
    '/data/threat-intel/cves/kev.json': KEV,
  };
  return {
    fetch: async (req: Request) => {
      const url = new URL(req.url);
      const data = files[url.pathname];
      if (data === undefined) return new Response(null, { status: 404 });
      return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
    },
  } as unknown as Fetcher;
}

function mockCtx() {
  return { waitUntil: (_p: Promise<unknown>) => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;
}

function makeEnv(withKev = true): Env {
  const files: Record<string, unknown> = {
    '/data/ai-playbook/index.json': INDEX,
    ...(withKev ? { '/data/threat-intel/cves/kev.json': KEV } : {}),
  };
  const assets = {
    fetch: async (req: Request) => {
      const url = new URL(req.url);
      const data = files[url.pathname];
      if (data === undefined) return new Response(null, { status: 404 });
      return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
    },
  } as unknown as Fetcher;
  return { ASSETS: assets } as Env;
}

// The manifest loader memoises the index for 10 minutes. Without this, an early
// success poisons the 'manifest is missing' case below and it silently passes.
beforeEach(() => {
  resetAiPlaybookCache();
});

function setup() {
  const app = new Hono<{ Bindings: Env }>();
  app.route('/api/v1', aiPlaybookRouter);
  return app;
}

describe('ai-playbook routes', () => {
  it('index returns counts and scope', async () => {
    const r = await setup().request('/api/v1/ai-playbook/', {}, makeEnv(), mockCtx());
    expect(r.status).toBe(200);
    const body = (await r.json()) as { counts: { layers: number }; scope: string };
    expect(body.counts.layers).toBe(3);
    expect(body.scope).toBe('structure-only');
  });

  it('lists layers', async () => {
    const r = await setup().request('/api/v1/ai-playbook/layers', {}, makeEnv(), mockCtx());
    expect(r.status).toBe(200);
    expect(((await r.json()) as { total: number }).total).toBe(3);
  });

  it('gets one layer and inlines its identifiers', async () => {
    const r = await setup().request('/api/v1/ai-playbook/layers/II', {}, makeEnv(), mockCtx());
    expect(r.status).toBe(200);
    const body = (await r.json()) as { id: string; riskIdsDetailed: { id: string }[] };
    expect(body.id).toBe('II');
    expect(body.riskIdsDetailed.map((x) => x.id)).toEqual(['ASI01', 'ASI02']);
  });

  it('resolves a layer by slug and 404s on nonsense', async () => {
    const ok = await setup().request('/api/v1/ai-playbook/layers/context', {}, makeEnv(), mockCtx());
    expect(ok.status).toBe(200);
    const bad = await setup().request('/api/v1/ai-playbook/layers/IX', {}, makeEnv(), mockCtx());
    expect(bad.status).toBe(404);
  });

  it('filters risk identifiers by scheme and layer', async () => {
    const app = setup();
    const byScheme = await app.request('/api/v1/ai-playbook/risk-ids?scheme=agentic-asi', {}, makeEnv(), mockCtx());
    expect(((await byScheme.json()) as { total: number }).total).toBe(2);
    const byLayer = await app.request('/api/v1/ai-playbook/risk-ids?layer=II', {}, makeEnv(), mockCtx());
    expect(((await byLayer.json()) as { total: number }).total).toBe(2);
  });

  it('rejects an unknown scheme with 400', async () => {
    const r = await setup().request('/api/v1/ai-playbook/risk-ids?scheme=bogus', {}, makeEnv(), mockCtx());
    expect(r.status).toBe(400);
  });

  it('searches by q and honours limit', async () => {
    const app = setup();
    const q = await app.request('/api/v1/ai-playbook/risk-ids?q=injection', {}, makeEnv(), mockCtx());
    expect(((await q.json()) as { total: number }).total).toBe(1);
    const lim = await app.request('/api/v1/ai-playbook/risk-ids?limit=1', {}, makeEnv(), mockCtx());
    expect(((await lim.json()) as { total: number }).total).toBe(1);
  });

  it('gets one identifier, case-insensitively, and 404s otherwise', async () => {
    const app = setup();
    const ok = await app.request('/api/v1/ai-playbook/risk-ids/llm01', {}, makeEnv(), mockCtx());
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { name: string }).name).toBe('Prompt Injection');
    const bad = await app.request('/api/v1/ai-playbook/risk-ids/LLM99', {}, makeEnv(), mockCtx());
    expect(bad.status).toBe(404);
  });

  it('enriches CVE references from the local KEV feed', async () => {
    const r = await setup().request('/api/v1/ai-playbook/cves', {}, makeEnv(), mockCtx());
    const body = (await r.json()) as { kevMatched: number; enrichmentSource: string; cves: { cveId: string; kev: boolean }[] };
    expect(body.kevMatched).toBe(1);
    expect(body.enrichmentSource).toMatch(/local/i);
    expect(body.cves.find((c) => c.cveId === 'CVE-2026-0001')?.kev).toBe(true);
  });

  it('filters to KEV-only when asked', async () => {
    const r = await setup().request('/api/v1/ai-playbook/cves?kev=true', {}, makeEnv(), mockCtx());
    const body = (await r.json()) as { total: number; cves: { kev: boolean }[] };
    expect(body.total).toBe(1);
    expect(body.cves.every((c) => c.kev)).toBe(true);
  });

  it('degrades gracefully when the KEV feed is absent', async () => {
    const r = await setup().request('/api/v1/ai-playbook/cves', {}, makeEnv(false), mockCtx());
    expect(r.status).toBe(200);
    const body = (await r.json()) as { kevMatched: number; cves: { kev: boolean }[] };
    expect(body.kevMatched).toBe(0);
    expect(body.cves.every((c) => !c.kev)).toBe(true);
  });

  it('stats includes kevMatched', async () => {
    const r = await setup().request('/api/v1/ai-playbook/stats', {}, makeEnv(), mockCtx());
    expect(((await r.json()) as { kevMatched: number }).kevMatched).toBe(1);
  });

  it('returns 500 with build guidance when the manifest is missing', async () => {
    const bad = new Hono<{ Bindings: Env }>();
    bad.route('/api/v1', aiPlaybookRouter);
    const empty = { ASSETS: { fetch: async () => new Response(null, { status: 404 }) } as unknown as Fetcher } as Env;
    const r = await bad.request('/api/v1/ai-playbook/', {}, empty, mockCtx());
    expect(r.status).toBe(500);
    expect((await r.text()).length).toBeGreaterThan(0);
  });
});

describe('ai-playbook licence scope (regression guard)', () => {
  it('no endpoint returns a prose body field', async () => {
    const app = setup();
    const paths = [
      '/api/v1/ai-playbook/',
      '/api/v1/ai-playbook/layers',
      '/api/v1/ai-playbook/risk-ids',
      '/api/v1/ai-playbook/cves',
      '/api/v1/ai-playbook/stats',
    ];
    // A chapter body would arrive under one of these keys. Upstream has no
    // reuse licence, so none of them may ever appear.
    const forbidden = ['body', 'content', 'markdown', 'text', 'html', 'chapterBody', 'prose'];
    for (const p of paths) {
      const raw = await (await app.request(p, {}, makeEnv(), mockCtx())).text();
      for (const key of forbidden) {
        expect(raw.includes(`"${key}"`)).toBe(false);
      }
    }
  });

  it('every identifier deep-links to the original', async () => {
    const r = await setup().request('/api/v1/ai-playbook/risk-ids', {}, makeEnv(), mockCtx());
    const body = (await r.json()) as { riskIds: { url: string }[] };
    for (const id of body.riskIds) expect(id.url).toMatch(/^https:\/\//);
  });
});