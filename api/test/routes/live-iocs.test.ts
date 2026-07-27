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
    expect(ids).not.toContain('andreafortuna-defacements');
    expect(ids).not.toContain('mythreatintel');
  });
});
