/**
 * Tests for /api/v1/sample/scan — the free "lite 0x12" hash fan-out.
 *
 * Mocks every upstream provider via globalThis.fetch and asserts:
 *   - input validation (missing / malformed hash → 400)
 *   - hash-type detection (MD5 / SHA-1 / SHA-256 round-trip)
 *   - the SSE stream shape: `meta` first, ≥1 `result`, terminal `done`
 *   - the terminal `done` event carries the public-sandbox deep links
 *   - GET ?hash= alias works the same as POST JSON
 *
 * Provider responses are shaped to be benign (low score, verdict clean)
 * so the assertions can focus on plumbing rather than scoring math — the
 * scoring module has its own dedicated tests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { sampleScanHandler, detectHashType } from '../../src/routes/sample-scan';
import { publicSandboxesFor } from '../../src/lib/sample-scan';

function app() {
  const a = new Hono<any>();
  a.post('/api/v1/sample/scan', sampleScanHandler);
  a.get('/api/v1/sample/scan', sampleScanHandler);
  return a;
}

// Minimal env stub — the real /api/v1/* stack reads API keys from here.
// All values are empty strings / undefined; the route's `buildProviderEnv`
// handles missing secrets by emitting degraded (but still 200) results.
const TEST_ENV: Record<string, unknown> = {};

beforeEach(() => {
  vi.restoreAllMocks();
});

const KNOWN_GOOD_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'; // empty file
const KNOWN_GOOD_SHA1 = 'da39a3ee5e6b4b0d3255bfef95601890afd80709';
const KNOWN_GOOD_MD5 = 'd41d8cd98f00b204e9800998ecf8427e';

describe('detectHashType', () => {
  it('recognises MD5 (32 hex)', () => {
    expect(detectHashType(KNOWN_GOOD_MD5)).toBe('md5');
  });
  it('recognises SHA-1 (40 hex)', () => {
    expect(detectHashType(KNOWN_GOOD_SHA1)).toBe('sha1');
  });
  it('recognises SHA-256 (64 hex)', () => {
    expect(detectHashType(KNOWN_GOOD_SHA256)).toBe('sha256');
  });
  it('rejects non-hex input', () => {
    expect(detectHashType('not-a-hash')).toBeNull();
    expect(detectHashType('zz39a3ee5e6b4b0d3255bfef95601890afd80709')).toBeNull();
  });
  it('rejects wrong length', () => {
    expect(detectHashType('abc123')).toBeNull();
    expect(detectHashType('a'.repeat(33))).toBeNull();
    expect(detectHashType('a'.repeat(63))).toBeNull();
  });
  it('normalises to lowercase', () => {
    expect(detectHashType(KNOWN_GOOD_SHA256.toUpperCase())).toBe('sha256');
  });
  it('trims whitespace', () => {
    expect(detectHashType(`  ${KNOWN_GOOD_SHA256}  `)).toBe('sha256');
  });
});

describe('publicSandboxesFor', () => {
  it('returns deep links for all engines that build a URL', () => {
    const out = publicSandboxesFor(KNOWN_GOOD_SHA256, 'sha256');
    expect(out.length).toBeGreaterThanOrEqual(8);
    expect(out.every((s) => typeof s.build?.(KNOWN_GOOD_SHA256, 'sha256') === 'string')).toBe(true);
  });
  it('returns no entries for an empty hash', () => {
    expect(publicSandboxesFor('', 'sha256')).toEqual([]);
  });
  it('flags engines that need a free community key', () => {
    const out = publicSandboxesFor(KNOWN_GOOD_SHA256, 'sha256');
    const flagged = out.filter((s) => s.requiresKey);
    expect(flagged.length).toBeGreaterThanOrEqual(2);
  });
});

describe('POST /api/v1/sample/scan — input validation', () => {
  it('rejects a missing hash', async () => {
    const r = await app().request(
      '/api/v1/sample/scan',
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) },
      TEST_ENV
    );
    expect(r.status).toBe(400);
  });

  it('rejects a malformed hash (not hex / wrong length)', async () => {
    const r = await app().request(
      '/api/v1/sample/scan',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ hash: 'not-a-hash' }),
      },
      TEST_ENV
    );
    expect(r.status).toBe(400);
  });

  it('rejects invalid JSON', async () => {
    const r = await app().request(
      '/api/v1/sample/scan',
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'this is not json' },
      TEST_ENV
    );
    expect(r.status).toBe(400);
  });

  it('GET without a hash returns 400', async () => {
    const r = await app().request('/api/v1/sample/scan', {}, TEST_ENV);
    expect(r.status).toBe(400);
  });

  it('GET with a malformed hash returns 400', async () => {
    const r = await app().request('/api/v1/sample/scan?hash=lol', {}, TEST_ENV);
    expect(r.status).toBe(400);
  });
});

describe('POST /api/v1/sample/scan — SSE stream', () => {
  it('streams meta+result+done for a valid SHA-256', async () => {
    // Every upstream provider returns a benign empty result.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200, headers: { 'content-type': 'application/json' } })
    );

    const r = await app().request(
      '/api/v1/sample/scan',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ hash: KNOWN_GOOD_SHA256 }),
      },
      TEST_ENV
    );
    // DEBUG
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toContain('text/event-stream');

    const text = await r.text();
    expect(text).toMatch(/event: meta\b/);
    expect(text).toMatch(/event: result\b/);
    expect(text).toMatch(/event: done\b/);
  });

  it('accepts an MD5 and streams a complete SSE response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200, headers: { 'content-type': 'application/json' } })
    );
    const r = await app().request(
      '/api/v1/sample/scan',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ hash: KNOWN_GOOD_MD5 }),
      },
      TEST_ENV
    );
    expect(r.status).toBe(200);
    const text = await r.text();
    expect(text).toMatch(/event: meta\b/);
    expect(text).toMatch(/event: done\b/);
    // The meta payload should label this an md5 query.
    expect(text).toMatch(/"hash_type":"md5"/);
  });

  it('accepts a SHA-1 and streams a complete SSE response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200, headers: { 'content-type': 'application/json' } })
    );
    const r = await app().request(
      '/api/v1/sample/scan',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ hash: KNOWN_GOOD_SHA1 }),
      },
      TEST_ENV
    );
    expect(r.status).toBe(200);
    const text = await r.text();
    expect(text).toMatch(/event: meta\b/);
    expect(text).toMatch(/event: done\b/);
    expect(text).toMatch(/"hash_type":"sha1"/);
  });

  it('GET ?hash= alias works the same as POST JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200, headers: { 'content-type': 'application/json' } })
    );
    const r = await app().request(`/api/v1/sample/scan?hash=${KNOWN_GOOD_SHA256}`, {}, TEST_ENV);
    expect(r.status).toBe(200);
    const text = await r.text();
    expect(text).toMatch(/event: meta\b/);
    expect(text).toMatch(/event: done\b/);
  });

  it('done event carries the public-sandbox deep links (≥8 entries, all http URLs)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200, headers: { 'content-type': 'application/json' } })
    );
    const r = await app().request(
      '/api/v1/sample/scan',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ hash: KNOWN_GOOD_SHA256 }),
      },
      TEST_ENV
    );
    expect(r.status).toBe(200);
    const text = await r.text();
    // The done event payload is the last JSON object in the stream; the
    // public_sandboxes array should be a top-level key in it. We assert
    // the stream contains enough sandbox URLs to satisfy the contract.
    const urlCount = (text.match(/"url":\s*"https?:\/\/[^"]+"/g) ?? []).length;
    expect(urlCount).toBeGreaterThanOrEqual(8);
  });

  it('tolerates an individual provider error and still completes the stream', async () => {
    // Alternate 200/502 to exercise both happy-path and error-path code
    // branches. The handler must still emit a terminal `done`.
    let calls = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      calls += 1;
      if (calls % 2 === 0) {
        return new Response('upstream boom', { status: 502 });
      }
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const r = await app().request(
      '/api/v1/sample/scan',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ hash: KNOWN_GOOD_SHA256 }),
      },
      TEST_ENV
    );
    expect(r.status).toBe(200);
    const text = await r.text();
    // Even with mixed 200/502 upstream responses, the stream still
    // closes cleanly with `done`.
    expect(text).toMatch(/event: done\b/);
  });
});
