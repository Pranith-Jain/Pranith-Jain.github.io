import { describe, it, expect, vi, afterEach } from 'vitest';
import { secretLeaksHandler } from '../../src/routes/secret-leaks';
import { virusheeRouter } from '../../src/routes/virushee';
import { mozillaTlsRouter } from '../../src/routes/mozilla-tls';

afterEach(() => vi.unstubAllGlobals());

/**
 * KV write-reduction audit pins (2026-10-02).
 *
 * These routes used to issue a KV write on every cold-miss build. The fixes:
 * secret-leaks gained a 24h TTL (was: permanent) + 6h debounce, and virushee
 * / mozilla-tls moved to L1-only Cache API (their upstreams are free and
 * keyless, so cross-colo reuse bought nothing). opencve / opensanctions /
 * hackertarget / cve-poc-map deliberately stay KV-backed — their metered API
 * keys make cross-colo reuse worth the write quota (see route comments).
 */

// ── fakes ────────────────────────────────────────────────────────────────

function memCache() {
  const m = new Map<string, Response>();
  return {
    match: async (req: RequestInfo | URL) => {
      const url = typeof req === 'string' ? req : (req as Request).url;
      return m.get(url);
    },
    put: async (req: RequestInfo | URL, res: Response) => {
      const url = typeof req === 'string' ? req : (req as Request).url;
      m.set(url, res);
    },
  };
}

function memKv() {
  const puts: Array<{ key: string; value: string; opts?: unknown }> = [];
  return {
    puts,
    get: async () => null,
    put: async (key: string, value: string, opts?: unknown) => {
      puts.push({ key, value, opts });
    },
    delete: async () => {},
  };
}

function ctx(env: Record<string, unknown>, pending: Promise<unknown>[]) {
  return {
    env,
    executionCtx: { waitUntil: (p: Promise<unknown>) => void pending.push(p) },
    req: { query: () => undefined, param: () => undefined },
    json: (body: unknown, status = 200, headers?: HeadersInit) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json', ...(headers as Record<string, string>) },
      }),
  } as never;
}

const ghItem = {
  name: 'aws_key.yml',
  path: 'config/aws_key.yml',
  html_url: 'https://github.com/acme/app/blob/main/config/aws_key.yml',
  repository: { owner: { login: 'acme' }, full_name: 'acme/app' },
};

// ── secret-leaks: TTL + debounce ─────────────────────────────────────────

describe('secretLeaksHandler KV discipline', () => {
  function stubGithub() {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ total_count: 1, incomplete_results: false, items: [ghItem] }), { status: 200 })
      )
    );
  }

  it('writes last-good with a 24h TTL (entries must expire, not accumulate)', async () => {
    stubGithub();
    vi.stubGlobal('caches', { default: memCache() });
    const kv = memKv();
    const pending: Promise<unknown>[] = [];
    const res = await secretLeaksHandler(ctx({ KV_CACHE: kv }, pending));
    await Promise.allSettled(pending);
    expect(res.status).toBe(200);
    expect(kv.puts).toHaveLength(1);
    expect(kv.puts[0]!.key).toBe('secret-leaks:lastgood/v2');
    expect(kv.puts[0]!.opts).toMatchObject({ expirationTtl: 24 * 60 * 60 });
  });

  it('skips the repeat write within the debounce window', async () => {
    stubGithub();
    // One shared cache across both calls so the debounce marker persists.
    vi.stubGlobal('caches', { default: memCache() });
    const kv = memKv();
    const env = { KV_CACHE: kv };
    const p1: Promise<unknown>[] = [];
    await secretLeaksHandler(ctx(env, p1));
    await Promise.allSettled(p1);
    expect(kv.puts).toHaveLength(1);
    // Second build with a cold edge cache but hot debounce marker.
    const p2: Promise<unknown>[] = [];
    await secretLeaksHandler(ctx(env, p2));
    await Promise.allSettled(p2);
    expect(kv.puts).toHaveLength(1);
  });
});

// ── virushee / mozilla-tls: L1-only, zero KV ─────────────────────────────

describe('virushee + mozilla-tls L1-only discipline', () => {
  const mockCtx = () =>
    ({ waitUntil: (_p: Promise<unknown>) => {}, passThroughOnException: () => {} }) as unknown as ExecutionContext;

  it('virushee performs zero KV writes on a miss-build', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ verdict: 'clean' }), { status: 200 }))
    );
    vi.stubGlobal('caches', { default: memCache() });
    const kv = memKv();
    const res = await virusheeRouter.request('/virushee/check?hash=abc123', {}, { KV_CACHE: kv }, mockCtx());
    expect(res.status).toBe(200);
    expect(kv.puts).toHaveLength(0);
    const body = (await res.json()) as { cached: boolean };
    expect(body.cached).toBe(false);
  });

  it('mozilla-tls performs zero KV writes on a miss-build', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ grade: 'A' }), { status: 200 }))
    );
    vi.stubGlobal('caches', { default: memCache() });
    const kv = memKv();
    const res = await mozillaTlsRouter.request('/mozilla-tls/scan?url=example.com', {}, { KV_CACHE: kv }, mockCtx());
    expect(res.status).toBe(200);
    expect(kv.puts).toHaveLength(0);
  });
});
