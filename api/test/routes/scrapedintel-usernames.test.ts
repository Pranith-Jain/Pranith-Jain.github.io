import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { scrapedintelUsernamesHandler } from '../../src/routes/scrapedintel-usernames';
import {
  budgetWindowCacheKey,
  lastGoodKey,
  SCRAPEDINTEL_SOURCE_URL,
  type ScrapedIntelSearchResponse,
} from '../../src/lib/scrapedintel';

function app() {
  const a = new Hono<any>();
  a.get('/api/v1/scrapedintel-usernames', scrapedintelUsernamesHandler);
  return a;
}

// Minimal in-memory KV for last-good assertions
function memKV(seed: Record<string, string> = {}): any {
  const m = new Map(Object.entries(seed));
  return {
    get: async (k: string) => m.get(k) ?? null,
    put: async (k: string, v: string) => void m.set(k, v),
    delete: async (k: string) => void m.delete(k),
    _m: m,
  };
}

// Mock Cache-API for budget window
function mockCache(seed: Record<string, string> = {}): Cache & { _store: Map<string, string> } {
  const store = new Map(Object.entries(seed));
  return {
    _store: store,
    match: async (req: Request | string) => {
      const key = typeof req === 'string' ? req : req.url;
      const val = store.get(key);
      if (val === undefined) return undefined;
      return new Response(val);
    },
    put: async (req: Request | string, res: Response) => {
      const key = typeof req === 'string' ? req : req.url;
      const body = await res.text();
      store.set(key, body);
    },
    delete: async (req: Request | string) => {
      const key = typeof req === 'string' ? req : req.url;
      store.delete(key);
    },
    add: async () => {},
    addAll: async () => {},
  } as unknown as Cache & { _store: Map<string, string> };
}

const env = (kv: any = memKV()): any => ({ KV_CACHE: kv });

function upstream(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** Seed the mock cache so the egress budget is exhausted regardless of minute boundary. */
function budgetExhausted(): Cache & { _store: Map<string, string> } {
  const now = Date.now();
  return mockCache({
    [budgetWindowCacheKey(now).url]: '9',
    [budgetWindowCacheKey(now + 60_000).url]: '9',
  });
}

let fakeCache: ReturnType<typeof mockCache>;

beforeEach(() => {
  fakeCache = mockCache();
  vi.stubGlobal('caches', { default: fakeCache });
});

afterEach(() => vi.restoreAllMocks());

describe('scrapedintel-usernames route', () => {
  it('400 when the query is shorter than 2 chars', async () => {
    const r = await app().request('/api/v1/scrapedintel-usernames?q=a', {}, env());
    expect(r.status).toBe(400);
  });

  it('400 when the query is longer than 80 chars', async () => {
    const r = await app().request(`/api/v1/scrapedintel-usernames?q=${'x'.repeat(81)}`, {}, env());
    expect(r.status).toBe(400);
  });

  it('200 with grouped results on upstream success, calling the upstream once', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      upstream({
        query: 'lockbit',
        found: true,
        count: 2,
        results: [
          { username: 'LockBitSupp', forum: 'Xss', logo: '/static/logos/xss_usernames.png' },
          { username: 'lockbitsupp', forum: 'Exploit', logo: '/static/logos/exploit_usernames.png' },
        ],
      })
    );
    const r = await app().request('/api/v1/scrapedintel-usernames?q=lockbit', {}, env());
    expect(r.status).toBe(200);
    const body = (await r.json()) as ScrapedIntelSearchResponse;
    expect(body.found).toBe(true);
    expect(body.total_matches).toBe(1);
    expect(body.results[0]!.username).toBe('LockBitSupp');
    expect(body.results[0]!.forum_count).toBe(2);
    expect(body.source_url).toBe(SCRAPEDINTEL_SOURCE_URL);
    const calledUrl = String(fetchMock.mock.calls[0]![0]);
    expect(calledUrl.startsWith(`${SCRAPEDINTEL_SOURCE_URL}/api/search?q=`)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('200 + empty results when upstream reports found:false', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      upstream({ query: 'ghostxyz', found: false, count: 0, results: [] })
    );
    const r = await app().request('/api/v1/scrapedintel-usernames?q=ghostxyz', {}, env());
    expect(r.status).toBe(200);
    const body = (await r.json()) as ScrapedIntelSearchResponse;
    expect(body.found).toBe(false);
    expect(body.total_matches).toBe(0);
    expect(body.results).toEqual([]);
  });

  it('serves KV last-good (stale) when over the egress budget — no upstream call', async () => {
    const seeded: ScrapedIntelSearchResponse = {
      query: 'staleguy',
      generated_at: '2026-06-01T00:00:00.000Z',
      found: true,
      total_matches: 1,
      truncated: false,
      results: [{ username: 'StaleGuy', forum_count: 1, forums: [{ forum: 'Xss' }] }],
      source: 'threatactorusernames.com',
      source_url: SCRAPEDINTEL_SOURCE_URL,
    };
    // Seed the mock cache with budget exhaustion
    const exhausted = budgetExhausted();
    vi.stubGlobal('caches', { default: exhausted });
    // Seed KV with last-good
    const kv = memKV({ [lastGoodKey('staleguy')]: JSON.stringify(seeded) });
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const r = await app().request('/api/v1/scrapedintel-usernames?q=staleguy', {}, env(kv));
    expect(r.status).toBe(200);
    const body = (await r.json()) as ScrapedIntelSearchResponse;
    expect(body.stale).toBe(true);
    expect(body.results[0]!.username).toBe('StaleGuy');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('429 rate_limited when over budget with no last-good — no upstream call', async () => {
    const exhausted = budgetExhausted();
    vi.stubGlobal('caches', { default: exhausted });
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const r = await app().request('/api/v1/scrapedintel-usernames?q=busyguy', {}, env());
    expect(r.status).toBe(429);
    const body = (await r.json()) as ScrapedIntelSearchResponse;
    expect(body.rate_limited).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('502 when upstream errors and there is no last-good', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(upstream({ error: 'boom' }, 500));
    const r = await app().request('/api/v1/scrapedintel-usernames?q=errguy', {}, env());
    expect(r.status).toBe(502);
  });
});
