import { SELF } from 'cloudflare:test';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Stub all upstream fetches so the handler responds fast in the test env.
beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 502 }));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GET /api/v1/live-iocs', () => {
  it('returns 200 with a sources array', async () => {
    const res = await SELF.fetch('https://example.com/api/v1/live-iocs');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      sources: Array<{ id: string; ok: boolean; count: number }>;
      total: number;
    };
    expect(Array.isArray(body.sources)).toBe(true);
    expect(typeof body.total).toBe('number');
  });

  it('does not include removed sources (sslbl-c2, andreafortuna-defacements, mythreatintel)', async () => {
    const res = await SELF.fetch('https://example.com/api/v1/live-iocs?cb=' + Date.now());
    const body = (await res.json()) as {
      registered_sources: Array<{ id: string }>;
    };
    const ids = body.registered_sources.map((s) => s.id);
    expect(ids).not.toContain('sslbl-c2');
    expect(ids).not.toContain('andreafortuna-defendants');
    expect(ids).not.toContain('andreafortuna-defacements');
    expect(ids).not.toContain('mythreatintel');
  });

  it('does not include threatbase (upstream repo removed, 404 on every fetch)', async () => {
    // kalidada18/threatbase is gone; the fan-out entry, the debug-mirror
    // registry and the parser were all removed together. Leaving the entry in
    // would burn a subrequest per invocation on a guaranteed 404.
    const res = await SELF.fetch('https://example.com/api/v1/live-iocs?cb=' + Date.now());
    const body = (await res.json()) as { registered_sources: Array<{ id: string }> };
    expect(body.registered_sources.map((s) => s.id)).not.toContain('threatbase');
  });

  it('flags sources truncated at the per-feed cap, so "300" is not read as "small"', async () => {
    // The cap made a 170k-line feed and a 300-line feed render identically.
    // `capped` distinguishes them; without it the roster reads as mostly-dead.
    const res = await SELF.fetch('https://example.com/api/v1/live-iocs?cb=' + Date.now());
    const body = (await res.json()) as {
      registered_sources: Array<{ id: string; ok: boolean; count: number; capped?: boolean }>;
    };
    for (const s of body.registered_sources) {
      if (typeof s.capped !== 'undefined') {
        expect(typeof s.capped).toBe('boolean');
        // capped may only be true when the feed actually reached the cap
        if (s.capped) expect(s.count).toBeGreaterThanOrEqual(300);
      }
    }
  });
});
