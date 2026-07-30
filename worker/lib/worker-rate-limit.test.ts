/**
 * Tests for the worker-level Cache-API rate limiter (worker/lib/worker-rate-limit.ts).
 * Run via: npx vitest run worker/lib/worker-rate-limit.test.ts
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { workerRateLimit, rateLimitResponse, callerIp, type WorkerRateLimitResult } from './worker-rate-limit';

function makeFakeCache(): Cache & { _store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    _store: store,
    match: async (req: Request | string) => {
      const key = typeof req === 'string' ? req : req.url;
      const val = store.get(key);
      return val === undefined ? undefined : new Response(val);
    },
    put: async (req: Request | string, res: Response) => {
      const key = typeof req === 'string' ? req : req.url;
      store.set(key, await res.text());
    },
    delete: async (req: Request | string) => {
      const key = typeof req === 'string' ? req : req.url;
      store.delete(key);
    },
    add: async () => {},
    addAll: async () => {},
  } as unknown as Cache & { _store: Map<string, string> };
}

// workerRateLimit writes its counter with a fire-and-forget put; flush a
// macrotask so the pending put settles before the next read observes it.
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('workerRateLimit', () => {
  const NOW = 1_700_000_000_000;

  beforeEach(() => {
    vi.stubGlobal('caches', { default: makeFakeCache() });
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('allows calls up to the limit and reports remaining', async () => {
    for (let i = 1; i <= 5; i++) {
      const r = await workerRateLimit('mcp', 'key-a', 5);
      await flush();
      expect(r.allowed).toBe(true);
      expect(r.limit).toBe(5);
      expect(r.remaining).toBe(5 - i);
    }
  });

  it('blocks the call once the limit is exceeded', async () => {
    for (let i = 0; i < 5; i++) {
      await workerRateLimit('mcp', 'key-a', 5);
      await flush();
    }
    const blocked = await workerRateLimit('mcp', 'key-a', 5);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it('isolates counters by identifier', async () => {
    for (let i = 0; i < 5; i++) {
      await workerRateLimit('mcp', 'key-a', 5);
      await flush();
    }
    const other = await workerRateLimit('mcp', 'key-b', 5);
    expect(other.allowed).toBe(true);
    expect(other.remaining).toBe(4);
  });

  it('isolates counters by namespace', async () => {
    for (let i = 0; i < 5; i++) {
      await workerRateLimit('og', 'ip-1', 5);
      await flush();
    }
    const other = await workerRateLimit('argus-rss', 'ip-1', 5);
    expect(other.allowed).toBe(true);
    expect(other.remaining).toBe(4);
  });

  it('resets the count when the window rolls over', async () => {
    for (let i = 0; i < 5; i++) {
      await workerRateLimit('mcp', 'key-a', 5);
      await flush();
    }
    expect((await workerRateLimit('mcp', 'key-a', 5)).allowed).toBe(false);
    // Advance past the 60s window boundary into a fresh bucket.
    vi.spyOn(Date, 'now').mockReturnValue(NOW + 61_000);
    const after = await workerRateLimit('mcp', 'key-a', 5);
    expect(after.allowed).toBe(true);
    expect(after.remaining).toBe(4);
  });

  it('fails open when the Cache API throws', async () => {
    vi.stubGlobal('caches', {
      default: {
        match: async () => {
          throw new Error('cache down');
        },
        put: async () => {},
      },
    });
    const r = await workerRateLimit('mcp', 'key-a', 5);
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(5);
  });

  it('reports a resetSeconds within the current window', async () => {
    const r = await workerRateLimit('mcp', 'key-a', 5);
    expect(r.resetSeconds).toBeGreaterThanOrEqual(1);
    expect(r.resetSeconds).toBeLessThanOrEqual(60);
  });
});

describe('rateLimitResponse', () => {
  it('builds a 429 with standard rate-limit headers', async () => {
    const result: WorkerRateLimitResult = { allowed: false, remaining: 0, limit: 10, resetSeconds: 42 };
    const res = rateLimitResponse(result);
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('42');
    expect(res.headers.get('x-ratelimit-limit')).toBe('10');
    expect(res.headers.get('x-ratelimit-remaining')).toBe('0');
    expect(res.headers.get('x-ratelimit-reset')).toBe('42');
    const body = (await res.json()) as { error: string; retry_after: number };
    expect(body.error).toBe('rate limit exceeded');
    expect(body.retry_after).toBe(42);
  });
});

describe('callerIp', () => {
  it('returns the cf-connecting-ip header when present', () => {
    const req = new Request('https://x.test/', { headers: { 'cf-connecting-ip': '1.2.3.4' } });
    expect(callerIp(req)).toBe('1.2.3.4');
  });

  it('falls back to "anon" when the header is absent', () => {
    expect(callerIp(new Request('https://x.test/'))).toBe('anon');
  });
});
