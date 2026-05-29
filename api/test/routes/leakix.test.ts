import { SELF } from 'cloudflare:test';
import { describe, it, expect, vi, beforeEach } from 'vitest';

beforeEach(() => vi.restoreAllMocks());

describe('GET /api/v1/leakix/search', () => {
  it('rejects missing query', async () => {
    const r = await SELF.fetch('https://x/api/v1/leakix/search');
    expect(r.status).toBe(400);
    const body = (await r.json()) as Record<string, unknown>;
    expect(body.error).toContain('q parameter required');
  });

  it('rejects query exceeding 200 chars', async () => {
    const longQuery = 'a'.repeat(201);
    const r = await SELF.fetch(`https://x/api/v1/leakix/search?q=${longQuery}`);
    expect(r.status).toBe(400);
    const body = (await r.json()) as Record<string, unknown>;
    expect(body.error).toContain('q parameter required');
  });

  it('returns search results from LeakIX', { timeout: 15_000 }, async () => {
    const mockResults = [
      {
        ip: '192.168.1.1',
        port: 443,
        protocol: 'https',
        service: 'nginx',
        leak: {
          id: 'leak-123',
          leak_type: 'service',
          leak_data: 'example data',
          created_at: '2024-01-01T00:00:00Z',
        },
      },
    ];

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify(mockResults), { status: 200 }));

    const r = await SELF.fetch('https://x/api/v1/leakix/search?q=example.com');
    expect(r.status).toBe(200);
    const body = (await r.json()) as Record<string, unknown>;
    expect(body.count).toBe(1);
    expect(body.results).toBeDefined();
    expect(Array.isArray(body.results)).toBe(true);
    expect(body.generated_at).toBeDefined();
  });

  it('handles upstream errors gracefully', { timeout: 15_000 }, async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('Service Unavailable', { status: 503 }));

    const r = await SELF.fetch('https://x/api/v1/leakix/search?q=test.com');
    expect(r.status).toBe(502);
    const body = (await r.json()) as Record<string, unknown>;
    expect(body.error).toContain('LeakIX upstream');
  });

  it('handles network errors gracefully', { timeout: 15_000 }, async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'));

    const r = await SELF.fetch('https://x/api/v1/leakix/search?q=test.com');
    expect(r.status).toBe(502);
    const body = (await r.json()) as Record<string, unknown>;
    expect(body.error).toContain('LeakIX unreachable');
  });

  it('limits results to 50 items', { timeout: 15_000 }, async () => {
    // Create 100 mock results
    const mockResults = Array.from({ length: 100 }, (_, i) => ({
      ip: `192.168.1.${i}`,
      port: 443,
      protocol: 'https',
    }));

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify(mockResults), { status: 200 }));

    const r = await SELF.fetch('https://x/api/v1/leakix/search?q=example.com');
    expect(r.status).toBe(200);
    const body = (await r.json()) as Record<string, unknown>;
    expect(body.count).toBe(100);
    expect((body.results as unknown[]).length).toBe(50);
  });

  it('caches responses', { timeout: 15_000 }, async () => {
    const mockResults = [{ ip: '1.2.3.4', port: 80 }];

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(mockResults), { status: 200 }));

    // First request
    const r1 = await SELF.fetch('https://x/api/v1/leakix/search?q=cached.com');
    expect(r1.status).toBe(200);

    // Second request should use cache (fetch called once)
    const r2 = await SELF.fetch('https://x/api/v1/leakix/search?q=cached.com');
    expect(r2.status).toBe(200);

    // fetch should only be called once due to caching
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});
