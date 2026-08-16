/**
 * Tests for the dPhish phishing-feed routes
 * (/api/v1/threat-intel/dphish*).
 *
 * The routes read the dphish manifest through env.ASSETS; we stub it with
 * an in-memory map (same approach as worker/lib/threat-intel-manifest.test.ts).
 *
 * Run via: npx vitest run api/test/routes/dphish.test.ts
 */
import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../src/env';
import { threatIntelRouter } from '../../src/routes/threat-intel-edge-tools';

function makeAssets() {
  const data = new Map<string, unknown>();

  data.set('/data/threat-intel/dphish/index.json', {
    source: 'dphish.com',
    sourceUrl: 'https://dphish.com/feeds/',
    collectionId: '68f57461-5c20-451d-ab32-6357d1fbef0b',
    collectionUrl: 'https://tip.dphish.live/taxii2/root/collections/68f57461-5c20-451d-ab32-6357d1fbef0b/objects/',
    description: 'Phishing threat-intel feed — malicious domains, phishing URLs, sender IPs.',
    license: 'Public feed (no registration required)',
    syncedAt: '2026-08-15T00:00:00.000Z',
    counts: {
      indicators: 2,
      active: 2,
      revoked: 0,
      byCategory: { domain: 1, url: 1 },
    },
    indicators: [
      {
        slug: 'melbetegypt.com-1a2b3c',
        stixId: 'indicator--11111111-1111-4111-8111-111111111111',
        value: 'melbetegypt.com',
        category: 'domain',
        mainObservableType: 'Domain-Name',
        active: true,
        revoked: false,
        confidence: 100,
        score: 20,
        created: '2025-05-27T16:28:59.074Z',
        modified: '2025-05-27T16:28:59.074Z',
        validUntil: '2027-02-15T12:09:24.192Z',
        description: 'Credential-harvesting domain impersonating Melbet.',
        sizeBytes: 512,
      },
      {
        slug: 'https:__dtec.com.my_ash-7g8h9i',
        stixId: 'indicator--33333333-3333-4333-8333-333333333333',
        value: 'https://dtec.com.my/ash?email=brad@example.net',
        category: 'url',
        mainObservableType: 'Url',
        active: true,
        revoked: false,
        confidence: 100,
        score: 20,
        created: '2025-05-15T11:16:37.466Z',
        modified: '2025-06-16T13:54:27.452Z',
        validUntil: null,
        description: 'Phishing URL with email parameter.',
        sizeBytes: 900,
      },
    ],
  });

  data.set('/data/threat-intel/dphish/indicators/melbetegypt.com-1a2b3c.json', {
    slug: 'melbetegypt.com-1a2b3c',
    stixId: 'indicator--11111111-1111-4111-8111-111111111111',
    name: 'melbetegypt.com',
    value: 'melbetegypt.com',
    category: 'domain',
    mainObservableType: 'Domain-Name',
    active: true,
    revoked: false,
    confidence: 100,
    score: 20,
    created: '2025-05-27T16:28:59.074Z',
    modified: '2025-05-27T16:28:59.074Z',
    validFrom: '2025-05-27T16:28:59.000Z',
    validUntil: '2027-02-15T12:09:24.192Z',
    description: 'Credential-harvesting domain impersonating Melbet.',
    labels: ['phishing'],
    indicatorTypes: ['malicious-activity'],
    pattern: "[domain-name:value = 'melbetegypt.com']",
    patternType: 'stix',
    detection: false,
    observableValues: [{ type: 'Domain-Name', value: 'melbetegypt.com' }],
    sizeBytes: 512,
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

describe('dPhish routes', () => {
  it('GET /dphish returns index + counts + cache stats', async () => {
    const app = setup();
    const r = await app.request('/api/v1/threat-intel/dphish', {}, makeEnv());
    expect(r.status).toBe(200);
    const body = (await r.json()) as {
      source: string;
      collectionId: string;
      collectionUrl: string;
      counts: { indicators: number; active: number };
      stats: { indexLoaded: boolean };
      indicators: Array<{ slug: string; value: string; category: string }>;
    };
    expect(body.source).toBe('dphish.com');
    expect(body.collectionId).toBe('68f57461-5c20-451d-ab32-6357d1fbef0b');
    expect(body.collectionUrl).toBe(
      'https://tip.dphish.live/taxii2/root/collections/68f57461-5c20-451d-ab32-6357d1fbef0b/objects/'
    );
    expect(body.counts.indicators).toBe(2);
    expect(body.counts.active).toBe(2);
    expect(body.stats.indexLoaded).toBe(true);
    expect(body.indicators).toHaveLength(2);
    expect(body.indicators[0]!.value).toBe('melbetegypt.com');
    expect(body.indicators[0]!.category).toBe('domain');
  });

  it('GET /dphish/indicators lists with category filter + 404-safe params', async () => {
    const app = setup();
    const r = await app.request('/api/v1/threat-intel/dphish/indicators', {}, makeEnv());
    expect(r.status).toBe(200);
    expect(((await r.json()) as { total: number }).total).toBe(2);

    const byCat = await app.request('/api/v1/threat-intel/dphish/indicators?category=url', {}, makeEnv());
    const byCatBody = (await byCat.json()) as { total: number; returned: number; indicators: Array<{ value: string }> };
    expect(byCatBody.returned).toBe(1);
    expect(byCatBody.indicators[0]!.value).toContain('dtec.com.my');

    const keyword = await app.request('/api/v1/threat-intel/dphish/indicators?q=melbet', {}, makeEnv());
    expect(((await keyword.json()) as { returned: number }).returned).toBe(1);

    const limit = await app.request('/api/v1/threat-intel/dphish/indicators?limit=1', {}, makeEnv());
    expect(((await limit.json()) as { returned: number }).returned).toBe(1);
  });

  it('GET /dphish/indicators/:slug returns the full body; unknown slugs 404', async () => {
    const app = setup();
    const r = await app.request('/api/v1/threat-intel/dphish/indicators/melbetegypt.com-1a2b3c', {}, makeEnv());
    expect(r.status).toBe(200);
    const body = (await r.json()) as { pattern: string; indicatorTypes: string[]; labels: string[] };
    expect(body.pattern).toBe("[domain-name:value = 'melbetegypt.com']");
    expect(body.indicatorTypes).toEqual(['malicious-activity']);
    expect(body.labels).toEqual(['phishing']);

    const missing = await app.request('/api/v1/threat-intel/dphish/indicators/does-not-exist', {}, makeEnv());
    expect(missing.status).toBe(404);
  });
});
