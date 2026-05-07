import { SELF } from 'cloudflare:test';
import { describe, it, expect, vi, beforeEach } from 'vitest';

beforeEach(() => vi.restoreAllMocks());

describe('GET /api/v1/feeds/proxy', () => {
  it('rejects missing url', async () => {
    const r = await SELF.fetch('https://x/api/v1/feeds/proxy');
    expect(r.status).toBe(400);
  });

  it('rejects host not in allow-list', async () => {
    const r = await SELF.fetch(
      'https://x/api/v1/feeds/proxy?url=' + encodeURIComponent('https://evil.example.com/feed.xml')
    );
    expect(r.status).toBe(403);
  });

  it('proxies allowed host', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, _init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
      // Only intercept upstream calls, not internal SELF.fetch routing
      if (url.includes('cisa.gov')) {
        return new Response('<rss><channel><title>x</title></channel></rss>', {
          status: 200,
          headers: { 'content-type': 'application/xml' },
        });
      }
      // Fall through for other calls
      return fetch(input, _init);
    });
    const r = await SELF.fetch(
      'https://x/api/v1/feeds/proxy?url=' + encodeURIComponent('https://www.cisa.gov/feed.xml')
    );
    expect(r.status).toBe(200);
    expect(await r.text()).toContain('<title>x</title>');
  });

  it('returns 502 on upstream error', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, _init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
      if (url.includes('cisa.gov')) {
        return new Response('boom', { status: 503 });
      }
      return fetch(input, _init);
    });
    const r = await SELF.fetch(
      'https://x/api/v1/feeds/proxy?url=' + encodeURIComponent('https://www.cisa.gov/feed.xml')
    );
    expect(r.status).toBe(502);
  });

  it('returns 502 when upstream issues a redirect', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(null, { status: 302, headers: { location: 'https://evil.example/' } })
    );
    const r = await SELF.fetch(
      'https://x/api/v1/feeds/proxy?url=' + encodeURIComponent('https://www.cisa.gov/feed.xml')
    );
    expect(r.status).toBe(502);
  });
});
