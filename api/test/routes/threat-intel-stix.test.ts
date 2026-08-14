/**
 * Tests for the STIX 2.1 export route (/api/v1/threat-intel/export/stix).
 *
 * The route reads vertical manifests through env.ASSETS; we stub it with
 * an in-memory map (same approach as worker/lib/threat-intel-manifest.test.ts).
 *
 * Run via: npx vitest run api/test/routes/threat-intel-stix.test.ts
 */
import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../src/env';
import { threatIntelRouter } from '../../src/routes/threat-intel-edge-tools';

function makeAssets() {
  const data = new Map<string, unknown>();

  data.set('/data/threat-intel/threatcluster/entities/index.json', {
    source: 'threatcluster.io',
    url: 'https://threatcluster.io/feeds',
    description: 'derived entities',
    builtAt: '2026-08-13T00:00:00Z',
    counts: { actor: 1, group: 1, malware: 0, cve: 0, sector: 0 },
    entities: {
      actor: [
        {
          type: 'actor',
          slug: 'lazarus-group',
          name: 'Lazarus Group',
          aliases: ['Lazarus'],
          mentionCount: 3,
          firstSeen: '2026-08-12T07:00:00Z',
          lastSeen: '2026-08-13T04:00:00Z',
        },
      ],
      group: [
        {
          type: 'group',
          slug: 'clop',
          name: 'Clop',
          aliases: [],
          mentionCount: 1,
          firstSeen: '2026-08-12T00:00:00Z',
          lastSeen: '2026-08-12T00:00:00Z',
        },
      ],
      malware: [],
      cve: [],
      sector: [],
    },
  });

  data.set('/data/threat-intel/threatcluster/iocs.json', {
    source: 'threatcluster.io',
    url: 'https://threatcluster.io/feeds/iocs',
    description: 'high-confidence IOC blocklist',
    generatedAt: '2026-08-13T00:00:00Z',
    syncedAt: '2026-08-13T00:00:00Z',
    count: 1,
    iocs: [
      {
        type: 'domain',
        value: 'evil.example',
        confidence: 'high',
        reason: 'C2 domain',
        first_seen: '2026-08-01T00:00:00Z',
        last_seen: null,
        source_count: 2,
        sources: [{ source: 'test', url: 'https://example.com/ioc', pub_date: null }],
      },
    ],
  });

  data.set('/data/threat-intel/index.json', {
    source: 'test',
    license: 'MIT',
    replicatedAt: '2026-06-29',
    counts: { cves: 0, iocs: 0, sectors: 0, kevTotal: 0, lists: 0 },
    lastSyncedAt: '2026-06-29T00:00:00Z',
    cveIndex: [],
    iocIndex: [],
    sectorIndex: [],
    listIndex: [],
    kev: [],
  });

  data.set('/data/threat-intel/darknet/index.json', {
    source: 'darknetlist.is',
    url: 'https://darknetlist.is',
    description: 'Tor site directory',
    rebuiltAt: '2026-08-13T00:00:00Z',
    syncedAt: '2026-08-13T00:00:00Z',
    counts: { categories: 1, sites: 1, up: 1, down: 0, recommended: 0, onion: 1 },
    categories: [{ id: 'markets', title: 'Markets', description: '', siteCount: 1, mirrorCount: 1, upCount: 1 }],
    sites: [
      {
        slug: 'example-market',
        name: 'Example Market',
        dwdId: 'dwd-1',
        category: 'markets',
        status: 'up',
        upMirrors: 1,
        totalMirrors: 1,
        recommended: false,
        isOnion: true,
        url: null,
        onion: 'abc.onion',
      },
    ],
  });

  data.set('/data/threat-intel/threaticon/index.json', {
    source: 'threaticon.com',
    url: 'https://threaticon.com',
    description: 'STIX 2.1 actor catalog',
    syncedAt: '2026-08-13T00:00:00Z',
    builtAt: '2026-08-13T00:00:00Z',
    counts: {
      actors: 1,
      actorsWithProfiles: 1,
      malwareFamilies: 0,
      malwareCategories: 0,
      techniques: 0,
      tactics: 0,
      originCountries: 1,
      targetedCountries: 0,
      sectors: 0,
    },
    tactics: {},
    actors: [
      {
        slug: 'lazarus-group',
        id: 319,
        name: 'Lazarus Group',
        mitreId: 'G0032',
        status: 'Active',
        tlp: 'amber',
        confidence: 85,
        types: ['Nation-State'],
        originCode: 'KP',
        countryOfOrigin: 'North Korea (KP)',
        techniquesCount: 0,
        toolsCount: 0,
        targetedCountriesCount: 0,
        tagsCount: 0,
        added: '2026-05-02',
      },
    ],
  });

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

describe('STIX 2.1 export route', () => {
  it('returns a valid STIX bundle with identity + marking + mapped objects', async () => {
    const app = setup();
    const r = await app.request('/api/v1/threat-intel/export/stix', {}, makeEnv());
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toContain('application/json');
    const bundle = (await r.json()) as {
      type: string;
      spec_version: string;
      objects: Array<{ type: string; id: string }>;
    };
    expect(bundle.type).toBe('bundle');
    expect(bundle.spec_version).toBe('2.1');
    const types = bundle.objects.map((o) => o.type);
    expect(types).toContain('identity');
    expect(types).toContain('marking-definition');
    expect(types).toContain('threat-actor');
    expect(types).toContain('intrusion-set');
    expect(types).toContain('infrastructure');
    expect(types).toContain('indicator');
    expect(bundle.objects.filter((o) => o.type === 'threat-actor').length).toBeGreaterThanOrEqual(2);
  });

  it('honors include=darknet,threaticon (subset of sources)', async () => {
    const app = setup();
    const r = await app.request('/api/v1/threat-intel/export/stix?include=darknet,threaticon&max=50', {}, makeEnv());
    expect(r.status).toBe(200);
    const bundle = (await r.json()) as { objects: Array<{ type: string }> };
    const types = bundle.objects.map((o) => o.type);
    expect(types).toContain('infrastructure');
    expect(types).toContain('threat-actor');
    expect(types).not.toContain('indicator');
  });

  it('supports download=1 (content-disposition attachment)', async () => {
    const app = setup();
    const r = await app.request('/api/v1/threat-intel/export/stix?include=darknet&download=1', {}, makeEnv());
    expect(r.status).toBe(200);
    expect(r.headers.get('content-disposition')).toContain('attachment');
  });

  it('deterministic ids: same include + same data yields same object ids', async () => {
    const app = setup();
    const r1 = await app.request('/api/v1/threat-intel/export/stix?include=darknet,threaticon', {}, makeEnv());
    const r2 = await app.request('/api/v1/threat-intel/export/stix?include=darknet,threaticon', {}, makeEnv());
    const b1 = (await r1.json()) as { objects: Array<{ type: string; id: string }> };
    const b2 = (await r2.json()) as { objects: Array<{ type: string; id: string }> };
    expect(b1.objects.map((o) => o.id)).toEqual(b2.objects.map((o) => o.id));
  });
});
