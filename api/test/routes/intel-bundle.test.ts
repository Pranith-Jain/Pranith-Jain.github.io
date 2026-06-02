import { SELF, env as testEnv } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import { withTestApiKey } from '../test-helpers';

interface BundleResponse {
  bundle: { type: string; id: string; objects: Array<Record<string, unknown>> };
  view: { reportId: string; title: string; iocs: Array<{ type: string; value: string }>; tlp: string };
  cache: 'hit' | 'miss' | 'computed';
}

const APT28_BODY =
  'APT28 (Fancy Bear) was observed conducting spear-phishing using CVE-2024-21762 to deliver the CremShell malware. ' +
  'Indicators include diplo-service.com, update-service.info, and the hash 5d41402abc4b2a76b9719d911017c592.';

beforeAll(async () => {
  // Apply the migration directly to the test D1. The vitest-pool-workers
  // runtime exposes the same BRIEFINGS_DB binding we use in production.
  const db = (testEnv as unknown as { BRIEFINGS_DB?: D1Database }).BRIEFINGS_DB;
  if (!db) throw new Error('BRIEFINGS_DB not bound in test env');
  await db.exec(
    `CREATE TABLE IF NOT EXISTS intel_bundles (` +
      ` id TEXT PRIMARY KEY,` +
      ` source_id TEXT NOT NULL,` +
      ` item_ref TEXT NOT NULL,` +
      ` report_id TEXT NOT NULL,` +
      ` title TEXT NOT NULL,` +
      ` published_at TEXT,` +
      ` extracted_hash TEXT NOT NULL,` +
      ` bundle_json TEXT NOT NULL,` +
      ` view_json TEXT NOT NULL,` +
      ` created_at TEXT NOT NULL DEFAULT (datetime('now')),` +
      ` updated_at TEXT NOT NULL DEFAULT (datetime('now')),` +
      ` ioc_count INTEGER NOT NULL DEFAULT 0,` +
      ` actor_count INTEGER NOT NULL DEFAULT 0,` +
      ` malware_count INTEGER NOT NULL DEFAULT 0)`
  );
  await db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_intel_bundles_source_ref ON intel_bundles(source_id, item_ref)`);
});

describe('GET /api/v1/intel-bundle', () => {
  it('returns 400 when source or ref are missing', async () => {
    const res = await SELF.fetch('https://example.com/api/v1/intel-bundle');
    expect(res.status).toBe(400);
  });

  it('returns 404 cache_miss when no body/title provided and no D1 row exists', async () => {
    const url = new URL('https://example.com/api/v1/intel-bundle');
    url.searchParams.set('source', 'briefings');
    url.searchParams.set('ref', 'https://example.test/post/new');
    const res = await SELF.fetch(url.toString());
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe('cache_miss');
  });

  it(
    'computes + persists on miss when title+body supplied; second call serves from D1',
    { timeout: 20_000 },
    async () => {
      const url = new URL('https://example.com/api/v1/intel-bundle');
      url.searchParams.set('source', 'briefings');
      url.searchParams.set('ref', 'https://example.test/post/apt28-brief');
      url.searchParams.set('title', 'APT28 spear-phishing campaign');
      url.searchParams.set('body', APT28_BODY);

      const first = await SELF.fetch(url.toString());
      expect(first.status).toBe(200);
      const f = (await first.json()) as BundleResponse;
      expect(f.cache).toBe('miss');
      expect(f.bundle.type).toBe('bundle');
      expect(f.view.iocs.length).toBeGreaterThan(0);
      expect(f.view.title).toBe('APT28 spear-phishing campaign');

      // Give the waitUntil persist a tick to flush before the second call.
      await new Promise((r) => setTimeout(r, 50));
      const second = await SELF.fetch(url.toString());
      expect(second.status).toBe(200);
      const s = (await second.json()) as BundleResponse;
      expect(s.cache).toBe('hit');
      expect(s.bundle.id).toBe(f.bundle.id);
      expect(s.view.reportId).toBe(f.view.reportId);
    }
  );
});

describe('POST /api/v1/intel-bundle/build', () => {
  it('rejects invalid bodies', async () => {
    const f = await withTestApiKey();
    const res = await f('https://example.com/api/v1/intel-bundle/build', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'invalid', input: 'x' }),
    });
    expect(res.status).toBe(400);
  });

  it('builds from a free-text brief (text mode) with TLP:AMBER default', { timeout: 20_000 }, async () => {
    const f = await withTestApiKey();
    const res = await f('https://example.com/api/v1/intel-bundle/build', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'text', input: APT28_BODY, sourceName: 'unit42' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as BundleResponse;
    expect(body.view.tlp).toBe('AMBER');
    expect(body.view.iocs.length).toBeGreaterThan(0);
    expect(body.bundle.id).toMatch(/^bundle--[0-9a-f-]{36}$/);
  });

  it(
    'builds from a flat IoC list (iocs mode) — emits indicators even without prose context',
    { timeout: 20_000 },
    async () => {
      const input = '8.8.8.8\nbad.example\nhttps://evil.example/x\nd41d8cd98f00b204e9800998ecf8427e';
      const f = await withTestApiKey();
      const res = await f('https://example.com/api/v1/intel-bundle/build', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: 'iocs', input }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as BundleResponse;
      const indicators = body.bundle.objects.filter((o) => o.type === 'indicator');
      expect(indicators.length).toBeGreaterThanOrEqual(4);
    }
  );
});

describe('GET /api/v1/intel-bundle/:id/export.stix.json', () => {
  it('rejects bundle IDs that do not match the deterministic UUIDv5 shape', async () => {
    const res = await SELF.fetch('https://example.com/api/v1/intel-bundle/not-a-bundle-id/export.stix.json');
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe('invalid_bundle_id');
  });

  it('returns 404 when the bundle ID is well-formed but not persisted', async () => {
    const res = await SELF.fetch(
      'https://example.com/api/v1/intel-bundle/bundle--00000000-0000-0000-0000-000000000000/export.stix.json'
    );
    expect(res.status).toBe(404);
  });

  it(
    'serves the persisted STIX bundle with the correct media type + attachment header',
    { timeout: 20_000 },
    async () => {
      // First, persist a bundle via the build route so we have something to export.
      const f = await withTestApiKey();
      const buildRes = await f('https://example.com/api/v1/intel-bundle/build', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: 'text', input: APT28_BODY, sourceName: 'unit42-export' }),
      });
      expect(buildRes.status).toBe(200);
      const built = (await buildRes.json()) as BundleResponse;
      const id = built.bundle.id;

      // Give the persistence waitUntil a tick to flush.
      await new Promise((r) => setTimeout(r, 50));

      const res = await SELF.fetch(
        `https://example.com/api/v1/intel-bundle/${encodeURIComponent(id)}/export.stix.json`
      );
      expect(res.status).toBe(200);
      // Media type — strict STIX consumers sniff on this.
      const ct = res.headers.get('content-type') ?? '';
      expect(ct.startsWith('application/stix+json')).toBe(true);
      // Attachment header so browsers download as a file.
      expect(res.headers.get('content-disposition')).toContain(`filename="${id}.stix.json"`);
      // CORS for analyst tools — the CORS middleware echoes the configured
      // site URL (SITE_URL), not a literal `*`, so just verify the header
      // is set to a non-empty value.
      expect(res.headers.get('access-control-allow-origin')).toBeTruthy();
      // Body is the exact same bundle JSON.
      const body = (await res.json()) as { type: string; id: string };
      expect(body.type).toBe('bundle');
      expect(body.id).toBe(id);
    }
  );
});
