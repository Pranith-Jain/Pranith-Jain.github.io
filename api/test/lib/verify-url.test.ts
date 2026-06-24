import { describe, it, expect } from 'vitest';
import { verifyUrl } from '../../src/lib/verify-url';

/** Minimal Response-like object exposing only the fields verifyUrl reads. */
function resp(
  status: number,
  opts: { body?: string; finalUrl?: string; redirected?: boolean; headers?: Record<string, string> } = {}
): Response {
  const h = new Map(Object.entries(opts.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: `S${status}`,
    url: opts.finalUrl ?? 'https://host.example/page',
    redirected: opts.redirected ?? false,
    headers: { get: (k: string) => h.get(k.toLowerCase()) ?? null },
    text: async () => opts.body ?? '',
  } as unknown as Response;
}

/** Build a fetch stub that dispatches on method, recording calls. */
function stubFetch(
  byMethod: (method: string, url: string, init?: RequestInit) => Response | Promise<Response> | Error
) {
  const calls: Array<{ method: string; url: string; init?: RequestInit }> = [];
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : ((input as Request).url ?? String(input));
    const method = (init?.method ?? 'GET').toUpperCase();
    calls.push({ method, url, init });
    const out = await byMethod(method, url, init);
    if (out instanceof Error) throw out;
    return out;
  }) as unknown as typeof fetch;
  return { fn, calls };
}

const noDoh = async () => null;

describe('verifyUrl — classification', () => {
  it('classifies a 2xx HEAD as ok', async () => {
    const { fn } = stubFetch((m) => (m === 'HEAD' ? resp(200) : resp(200)));
    const r = await verifyUrl('https://good.example/a', 3000, { fetchImpl: fn, dohResolve: noDoh });
    expect(r.linkStatus).toBe('ok');
  });

  it('classifies a 404 HEAD as broken', async () => {
    const { fn } = stubFetch(() => resp(404));
    const r = await verifyUrl('https://good.example/missing', 3000, { fetchImpl: fn, dohResolve: noDoh });
    expect(r.linkStatus).toBe('broken');
  });

  it('falls back to GET when HEAD is 403 (WAF blocks HEAD) and returns ok if GET is 200', async () => {
    const { fn, calls } = stubFetch((m) => (m === 'HEAD' ? resp(403) : resp(200)));
    const r = await verifyUrl('https://waf.example/article', 3000, { fetchImpl: fn, dohResolve: noDoh });
    expect(r.linkStatus).toBe('ok'); // the key false-positive fix
    expect(calls.map((c) => c.method)).toEqual(['HEAD', 'GET']);
  });

  it('returns broken when HEAD 405 then GET 404', async () => {
    const { fn } = stubFetch((m) => (m === 'HEAD' ? resp(405) : resp(404)));
    const r = await verifyUrl('https://x.example/gone', 3000, { fetchImpl: fn, dohResolve: noDoh });
    expect(r.linkStatus).toBe('broken');
  });

  it('treats 503 as unchecked (transient), NOT broken', async () => {
    const { fn } = stubFetch(() => resp(503));
    const r = await verifyUrl('https://x.example/down', 3000, { fetchImpl: fn, dohResolve: noDoh });
    expect(r.linkStatus).toBe('unchecked');
  });

  it('treats 429 as unchecked even after GET fallback', async () => {
    const { fn } = stubFetch(() => resp(429));
    const r = await verifyUrl('https://x.example/rl', 3000, { fetchImpl: fn, dohResolve: noDoh });
    expect(r.linkStatus).toBe('unchecked');
  });

  it('confirms a fabricated domain as broken when fetch throws and DoH says NXDOMAIN (Status 3)', async () => {
    const { fn } = stubFetch(() => new Error('getaddrinfo ENOTFOUND'));
    const r = await verifyUrl('https://totally-fake-host.example/x', 3000, {
      fetchImpl: fn,
      dohResolve: async () => 3,
    });
    expect(r.linkStatus).toBe('broken');
  });

  it('treats a thrown fetch with a resolvable host (DoH Status 0) as unchecked', async () => {
    const { fn } = stubFetch(() => new Error('connection timeout'));
    const r = await verifyUrl('https://real-but-slow.example/x', 3000, {
      fetchImpl: fn,
      dohResolve: async () => 0,
    });
    expect(r.linkStatus).toBe('unchecked');
  });

  it('detects a soft-404 (GET redirects to host root) as broken', async () => {
    const { fn } = stubFetch((m) =>
      m === 'HEAD' ? resp(405) : resp(200, { redirected: true, finalUrl: 'https://x.example/' })
    );
    const r = await verifyUrl('https://x.example/news/made-up-slug', 3000, { fetchImpl: fn, dohResolve: noDoh });
    expect(r.linkStatus).toBe('broken');
  });

  it('sends a browser-like User-Agent on the request', async () => {
    const { fn, calls } = stubFetch(() => resp(200));
    await verifyUrl('https://x.example/a', 3000, { fetchImpl: fn, dohResolve: noDoh });
    const ua = new Headers(calls[0]!.init!.headers).get('user-agent') ?? '';
    expect(ua).toMatch(/Mozilla\/5\.0/);
  });
});
