import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../src/env';
import {
  taxiiDiscoveryHandler,
  taxiiCollectionsHandler,
  taxiiCollectionHandler,
  taxiiObjectsHandler,
} from '../../src/routes/taxii';

const TAXII_CT = 'application/vnd.oasis.taxii+json; version=2.1';

const IOC_ROWS = [
  {
    indicator: '8.8.8.8',
    indicator_type: 'ipv4',
    first_seen: '2026-01-01T00:00:00Z',
    last_seen: '2026-01-02T00:00:00Z',
    peak_score: 80,
    tags: '["c2"]',
  },
  {
    indicator: 'evil.example.com',
    indicator_type: 'domain',
    first_seen: '2026-06-01T00:00:00Z',
    last_seen: '2026-06-02T00:00:00Z',
    peak_score: 50,
    tags: '[]',
  },
  {
    indicator: 'phish@example.com',
    indicator_type: 'email',
    first_seen: '2026-07-01T00:00:00Z',
    last_seen: '2026-07-02T00:00:00Z',
    peak_score: 60,
    tags: '["phish"]',
  },
  {
    indicator: 'carrier-pigeon',
    indicator_type: 'carrier-pigeon',
    first_seen: '2026-07-15T00:00:00Z',
    last_seen: '2026-07-16T00:00:00Z',
    peak_score: 10,
    tags: '[]',
  },
  {
    indicator: '1.2.3.4',
    indicator_type: 'ipv4',
    first_seen: '2026-08-01T00:00:00Z',
    last_seen: '2026-08-02T00:00:00Z',
    peak_score: 90,
    tags: '["c2"]',
  },
];

// SQL-aware mock D1: honors the ioc_lifecycle window/added_after/LIMIT/OFFSET
// the builders actually emit; graph_nodes and briefings read empty.
function mockDb() {
  return {
    prepare: (sql: string) => ({
      bind: (...args: unknown[]) => ({
        all: async () => {
          if (sql.includes('ioc_lifecycle')) {
            let rows = [...IOC_ROWS];
            if (sql.includes('first_seen > ?')) {
              const cutoff = String(args[0]);
              rows = rows.filter((r) => r.first_seen > cutoff);
            }
            const nums = args.filter((a) => typeof a === 'number') as number[];
            const limit = nums[nums.length - 2] ?? 100;
            const offset = nums[nums.length - 1] ?? 0;
            return { results: rows.slice(offset, offset + limit) };
          }
          return { results: [] };
        },
        first: async () => null,
        run: async () => ({}),
      }),
    }),
  };
}

function makeApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.get('/api/taxii2/', taxiiDiscoveryHandler);
  app.get('/api/taxii2/collections/', taxiiCollectionsHandler);
  app.get('/api/taxii2/collections/:id/', taxiiCollectionHandler);
  app.get('/api/taxii2/collections/:id/objects/', taxiiObjectsHandler);
  return app;
}

const ENV = {
  BRIEFINGS_DB: mockDb(),
  SITE_URL: 'https://example.test',
} as unknown as Env;

async function get(path: string) {
  const res = await makeApp().request(path, {}, ENV);
  const body = (await res.json()) as Record<string, any>;
  return { res, body };
}

describe('taxii discovery', () => {
  it('advertises absolute api_roots', async () => {
    const { res, body } = await get('/api/taxii2/');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('vnd.oasis.taxii');
    expect(body.api_roots).toEqual(['https://example.test/api/taxii2/']);
    expect(body.default).toBe('https://example.test/api/taxii2/collections/');
  });
});

describe('taxii objects envelope', () => {
  it('returns a TAXII envelope (not a bundle) with producer + marking', async () => {
    const { res, body } = await get('/api/taxii2/collections/iocs/objects/?limit=50');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('vnd.oasis.taxii');
    expect(body.type).toBe('envelope');
    expect(body.id).toMatch(/^envelope--[0-9a-f-]{36}$/);
    expect(body.more).toBe(false);
    expect(body.next).toBeUndefined();
    const types = body.objects.map((o: any) => o.type);
    expect(types).toContain('identity');
    expect(types).toContain('marking-definition');
    const ind = body.objects.find((o: any) => o.type === 'indicator');
    expect(ind.created_by_ref).toBeDefined();
    expect(ind.object_marking_refs).toHaveLength(1);
  });

  it('pages with more/next cursors', async () => {
    const first = await get('/api/taxii2/collections/iocs/objects/?limit=2');
    expect(first.body.more).toBe(true);
    expect(first.body.next).toBe('2');
    // 2 indicators + producer identity + marking.
    expect(first.body.objects.filter((o: any) => o.type === 'indicator')).toHaveLength(2);

    const second = await get('/api/taxii2/collections/iocs/objects/?limit=2&next=2');
    expect(second.body.more).toBe(false);
    expect(second.body.next).toBeUndefined();
    expect(second.body.objects.filter((o: any) => o.type === 'indicator')).toHaveLength(2);
  });

  it('skips indicator types with no valid STIX pattern and omits empty labels', async () => {
    const { body } = await get('/api/taxii2/collections/iocs/objects/?limit=50');
    const names = body.objects.map((o: any) => o.name);
    expect(names).not.toContain('carrier-pigeon');
    expect(names).toContain('phish@example.com');
    const email = body.objects.find((o: any) => o.name === 'phish@example.com');
    expect(email.pattern).toBe(`[email-addr:value = 'phish@example.com']`);
    const untagged = body.objects.find((o: any) => o.name === 'evil.example.com');
    expect(untagged).toBeDefined();
    expect('labels' in untagged).toBe(false);
    const tagged = body.objects.find((o: any) => o.name === '8.8.8.8');
    expect(tagged.labels).toEqual(['c2']);
  });

  it('honors added_after incrementally', async () => {
    const { body } = await get('/api/taxii2/collections/iocs/objects/?added_after=2026-07-01T00:00:00Z');
    const names = body.objects.filter((o: any) => o.type === 'indicator').map((o: any) => o.name);
    expect(names).toEqual(['1.2.3.4']);
  });

  it('gates match[type] at the collection level', async () => {
    const { body } = await get('/api/taxii2/collections/iocs/objects/?match[type]=malware');
    expect(body.objects.filter((o: any) => o.type === 'indicator')).toHaveLength(0);
    expect(body.more).toBe(false);
  });

  it('supports match[id] without paging', async () => {
    const all = await get('/api/taxii2/collections/iocs/objects/?limit=50');
    const target = all.body.objects.find((o: any) => o.type === 'indicator');
    const { body } = await get(`/api/taxii2/collections/iocs/objects/?match[id]=${encodeURIComponent(target.id)}`);
    expect(body.objects.filter((o: any) => o.type === 'indicator')).toHaveLength(1);
    expect(body.more).toBe(false);
  });

  it('accepts match[version] (single-version store behaves as all)', async () => {
    const { res } = await get('/api/taxii2/collections/iocs/objects/?match[version]=last');
    expect(res.status).toBe(200);
  });

  it('400s on invalid limit/next/added_after', async () => {
    for (const qs of ['limit=0', 'limit=501', 'limit=abc', 'next=-1', 'next=abc', 'added_after=not-a-date']) {
      const { res, body } = await get(`/api/taxii2/collections/iocs/objects/?${qs}`);
      expect(res.status).toBe(400);
      expect(body.title).toBe('Bad Request');
      expect(res.headers.get('content-type')).toContain('vnd.oasis.taxii');
    }
  });

  it('404s unknown collections with the TAXII media type', async () => {
    const { res } = await get('/api/taxii2/collections/nope/objects/');
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('vnd.oasis.taxii');
  });
});
