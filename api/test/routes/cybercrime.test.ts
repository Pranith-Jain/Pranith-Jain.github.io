import { SELF, env } from 'cloudflare:test';
import { describe, it, expect, vi } from 'vitest';

// Stub the AF fetcher so the test is deterministic and offline.
vi.mock('../../src/lib/andreafortuna-feeds', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/andreafortuna-feeds')>();
  return {
    ...actual,
    fetchAFDatamarkets: async () => [
      {
        title: 'DemonForums - Stub Item',
        url: 'https://demonforums.net/Thread-stub',
        source: 'andreafortuna-demonforums',
        category: 'underground-forums' as const,
        published: '2026-05-15T02:08:01.440Z',
        description: 'Underground forum thread',
        tags: ['demonforums', 'credentials', 'forum'],
      },
    ],
  };
});

describe('GET /api/v1/cyber-crime — Andrea Fortuna datamarkets', () => {
  it('includes the AF datamarkets source row in the response', async () => {
    const res = await SELF.fetch('https://example.com/api/v1/cyber-crime');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      sources: Array<{ label: string; category: string; ok: boolean; count: number }>;
      items: Array<{ url: string; source: string; category: string }>;
    };
    const afSource = body.sources.find((s) => s.label === 'AndreaFortuna Datamarkets');
    expect(afSource).toBeDefined();
    expect(afSource!.category).toBe('underground-forums');
    expect(afSource!.ok).toBe(true);
    expect(afSource!.count).toBeGreaterThanOrEqual(1);
  });

  it('includes the stubbed AF item in items[]', async () => {
    // Bust the previous test's cached response — KV/Cache-API persists across SELF.fetch.
    const res = await SELF.fetch('https://example.com/api/v1/cyber-crime?cb=' + Date.now());
    const body = (await res.json()) as {
      items: Array<{ url: string; source: string; category: string }>;
    };
    const stub = body.items.find((i) => i.url === 'https://demonforums.net/Thread-stub');
    expect(stub).toBeDefined();
    expect(stub!.source).toBe('andreafortuna-demonforums');
    expect(stub!.category).toBe('underground-forums');
  });
});
