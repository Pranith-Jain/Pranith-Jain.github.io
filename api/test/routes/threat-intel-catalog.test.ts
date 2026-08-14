/**
 * Tests for the Threaticon extended-catalog routes
 * (/api/v1/threat-intel/threaticon/catalog* and /indicators).
 *
 * The routes read the catalog manifest through env.ASSETS; we stub it with
 * an in-memory map (same approach as worker/lib/threat-intel-manifest.test.ts).
 *
 * Run via: npx vitest run api/test/routes/threat-intel-catalog.test.ts
 */
import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../src/env';
import { threatIntelRouter } from '../../src/routes/threat-intel-edge-tools';

function makeAssets() {
  const data = new Map<string, unknown>();

  data.set('/data/threat-intel/threaticon-catalog/index.json', {
    source: 'threaticon.com',
    url: 'https://threaticon.com/',
    description: 'Extended threaticon public-preview catalog',
    builtAt: '2026-08-14T00:00:00Z',
    counts: { tools: 1, campaigns: 1, vulnerabilities: 1, indicators: 3 },
    sections: {
      tools: {
        syncedAt: '2026-08-14T00:00:00Z',
        detailCount: 1,
        items: [{ id: 7, name: 'Cobalt Strike', tlp: 'amber', status: 'Active', category: 'C2', confidence: 90 }],
      },
      campaigns: {
        syncedAt: '2026-08-14T00:00:00Z',
        detailCount: 0,
        items: [{ id: 11, name: 'Operation Cloud Hood', tlp: 'white', status: 'Active', confidence: 80 }],
      },
      vulnerabilities: {
        syncedAt: '2026-08-14T00:00:00Z',
        detailCount: 0,
        items: [],
      },
      indicators: {
        syncedAt: '2026-08-14T00:00:00Z',
        detailCount: 0,
        types: {
          'ipv4-address': { count: 2, chunks: 1 },
          domain: { count: 150_000, chunks: 3 },
        },
      },
    },
  });

  data.set('/data/threat-intel/threaticon-catalog/tools/7.json', {
    id: 7,
    name: 'Cobalt Strike',
    tlp: 'amber',
    status: 'Active',
    category: 'C2',
    confidence: 90,
    aliases: ['CS'],
    description: 'Commercial C2 framework.',
    sourceUrl: 'https://threaticon.com/tools/7',
  });

  data.set('/data/threat-intel/threaticon-catalog/indicators/ipv4-address.json', [
    { value: '1.2.3.4', tlp: 'red', confidence: 80, added: '2026-08-14' },
    { value: '5.6.7.8', tlp: 'amber', confidence: 60, added: '2026-08-14' },
  ]);

  data.set('/data/threat-intel/threaticon-catalog/indicators/domain.1.json', [
    { value: 'evil.example', tlp: 'red', confidence: 90, added: '2026-08-14' },
  ]);

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
  app.route('/api/v1', threatIntelRouter);
  return app;
}

describe('Threaticon catalog routes', () => {
  it('GET /catalog returns counts + section overview', async () => {
    const app = setup();
    const r = await app.request('/api/v1/threat-intel/threaticon/catalog', {}, makeEnv());
    expect(r.status).toBe(200);
    const body = (await r.json()) as { counts: Record<string, number>; sections: Record<string, unknown> };
    expect(body.counts.tools).toBe(1);
    expect(body.counts.indicators).toBe(3);
    expect(body.sections.tools).toEqual({ syncedAt: '2026-08-14T00:00:00Z', detailCount: 1 });
  });

  it('GET /catalog/:section lists items with keyword filter + rejects unknown sections', async () => {
    const app = setup();
    const r = await app.request('/api/v1/threat-intel/threaticon/catalog/tools?limit=10', {}, makeEnv());
    expect(r.status).toBe(200);
    const body = (await r.json()) as { section: string; total: number; items: Array<{ id: number; name: string }> };
    expect(body.section).toBe('tools');
    expect(body.total).toBe(1);
    expect(body.items[0]!.name).toBe('Cobalt Strike');

    const q = await app.request('/api/v1/threat-intel/threaticon/catalog/tools?q=cobalt&limit=10', {}, makeEnv());
    expect(((await q.json()) as { items: unknown[] }).items).toHaveLength(1);

    const bad = await app.request('/api/v1/threat-intel/threaticon/catalog/nonsense', {}, makeEnv());
    expect(bad.status).toBe(400);
  });

  it('GET /catalog/:section/:id returns a full body; unknown ids 404', async () => {
    const app = setup();
    const r = await app.request('/api/v1/threat-intel/threaticon/catalog/tools/7', {}, makeEnv());
    expect(r.status).toBe(200);
    const body = (await r.json()) as { name: string; aliases: string[]; sourceUrl: string };
    expect(body.name).toBe('Cobalt Strike');
    expect(body.aliases).toEqual(['CS']);
    expect(body.sourceUrl).toBe('https://threaticon.com/tools/7');

    const missing = await app.request('/api/v1/threat-intel/threaticon/catalog/tools/999', {}, makeEnv());
    expect(missing.status).toBe(404);
  });

  it('GET /indicators lists types without ?type and records with chunked type', async () => {
    const app = setup();
    const r = await app.request('/api/v1/threat-intel/threaticon/indicators', {}, makeEnv());
    expect(r.status).toBe(200);
    const meta = (await r.json()) as { total: number; types: Record<string, { count: number; chunks: number }> };
    expect(meta.total).toBe(3);
    expect(meta.types.domain).toEqual({ count: 150_000, chunks: 3 });

    const recs = await app.request(
      '/api/v1/threat-intel/threaticon/indicators?type=ipv4-address&chunk=0&limit=10',
      {},
      makeEnv()
    );
    expect(recs.status).toBe(200);
    const list = (await recs.json()) as { type: string; indicators: Array<{ value: string; tlp: string }> };
    expect(list.type).toBe('ipv4-address');
    expect(list.indicators[0]!.value).toBe('1.2.3.4');
    expect(list.indicators[0]!.tlp).toBe('red');

    const chunked = await app.request(
      '/api/v1/threat-intel/threaticon/indicators?type=domain&chunk=1&min_confidence=80',
      {},
      makeEnv()
    );
    const chunkedBody = (await chunked.json()) as { indicators: Array<{ value: string }> };
    expect(chunkedBody.indicators.map((i) => i.value)).toEqual(['evil.example']);

    const unknown = await app.request('/api/v1/threat-intel/threaticon/indicators?type=no-such-type', {}, makeEnv());
    expect(unknown.status).toBe(404);
  });
});
