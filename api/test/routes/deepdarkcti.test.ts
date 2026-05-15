import { SELF } from 'cloudflare:test';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const FORUM_MD = [
  '|Name|Status|Description|',
  '|---|---|---|',
  '|[0x00sec](https://0x00sec.org/)|ONLINE|A forum|',
].join('\n');

describe('GET /api/v1/deepdarkcti', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Any deepdarkCTI raw URL → forum fixture; everything else → 404.
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const u = String(input instanceof Request ? (input as Request).url : input);
      if (u.includes('raw.githubusercontent.com/fastfire/deepdarkCTI')) {
        return new Response(FORUM_MD, { status: 200, headers: { 'content-type': 'text/plain' } });
      }
      return new Response('not found', { status: 404 });
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it('returns assembled response with per-file sources + categories', async () => {
    const res = await SELF.fetch('https://example.com/api/v1/deepdarkcti?cb=' + Date.now());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      sources: Array<{ source_file: string; ok: boolean; count: number }>;
      categories: Array<{ id: string; label: string; count: number }>;
      total: number;
      entries: Array<{ name: string; url: string; category: string }>;
    };
    expect(body.sources.length).toBe(18);
    expect(body.sources.every((s) => s.ok)).toBe(true);
    expect(body.total).toBeGreaterThan(0);
    expect(body.entries.some((e) => e.url === 'https://0x00sec.org/')).toBe(true);
    expect(body.categories.some((c) => c.label === 'Criminal Forums')).toBe(true);
  });

  it('isolates a failing file: ok:false for it, others still parse', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const u = String(input instanceof Request ? (input as Request).url : input);
      if (u.includes('/forum.md')) return new Response('boom', { status: 500 });
      if (u.includes('raw.githubusercontent.com/fastfire/deepdarkCTI')) {
        return new Response(FORUM_MD, { status: 200 });
      }
      return new Response('nf', { status: 404 });
    });
    const res = await SELF.fetch('https://example.com/api/v1/deepdarkcti?cb=' + Date.now());
    const body = (await res.json()) as { sources: Array<{ source_file: string; ok: boolean }> };
    const forum = body.sources.find((s) => s.source_file === 'forum.md');
    expect(forum!.ok).toBe(false);
    expect(body.sources.filter((s) => s.ok).length).toBeGreaterThan(0);
  });
});
