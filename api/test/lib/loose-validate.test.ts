import { describe, it, expect } from 'vitest';
import { looseValidation } from '../../src/lib/loose-validate';

/**
 * Minimal Context stub for exercising looseValidation in isolation.
 * The middleware only reads `c.req.{url, method, header, text}` and
 * calls `c.json(...)`; everything else can be `unknown` cast.
 */
function makeCtx(
  opts: {
    method?: string;
    url?: string;
    body?: string;
    contentType?: string | null;
    contentLength?: string | null;
  } = {}
) {
  const headers = new Map<string, string>();
  if (opts.contentType !== undefined && opts.contentType !== null) {
    headers.set('content-type', opts.contentType);
  }
  if (opts.contentLength !== undefined && opts.contentLength !== null) {
    headers.set('content-length', opts.contentLength);
  }
  return {
    req: {
      url: opts.url ?? 'https://example.com/api/v1/foo',
      method: opts.method ?? 'GET',
      header: (name: string) => headers.get(name.toLowerCase()) ?? undefined,
      text: async () => opts.body ?? '',
    },
    json: (body: unknown, status = 200, extraHeaders: Record<string, string> = {}) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json', ...extraHeaders },
      }),
  } as unknown as Parameters<typeof looseValidation>[0] extends (c: infer C, ...args: unknown[]) => unknown ? C : never;
}

async function run(
  c: Parameters<typeof looseValidation>[0] extends (c: infer C, ...args: unknown[]) => unknown ? C : never
) {
  let nextCalled = false;
  const mw = looseValidation();
  const res = await mw(c as never, async () => {
    nextCalled = true;
  });
  return { nextCalled, res: res as Response | undefined };
}

describe('looseValidation middleware', () => {
  it('passes through a normal GET request', async () => {
    const { nextCalled, res } = await run(makeCtx({ url: 'https://example.com/api/v1/ioc/check?indicator=1.1.1.1' }));
    expect(nextCalled).toBe(true);
    expect(res).toBeUndefined();
  });

  it('passes through a normal JSON POST', async () => {
    const { nextCalled } = await run(
      makeCtx({
        method: 'POST',
        url: 'https://example.com/api/v1/x',
        contentType: 'application/json',
        body: JSON.stringify({ a: 1, b: 'two' }),
      })
    );
    expect(nextCalled).toBe(true);
  });

  it('rejects a request URL over 8 KB with 414', async () => {
    const longQs = 'q=' + 'x'.repeat(9000);
    const { nextCalled, res } = await run(makeCtx({ url: `https://example.com/api/v1/foo?${longQs}` }));
    expect(nextCalled).toBe(false);
    expect(res).toBeDefined();
    if (res) {
      expect(res.status).toBe(414);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('request_uri_too_long');
    }
  });

  it('rejects too many query params with 400', async () => {
    const params = Array.from({ length: 60 }, (_, i) => `k${i}=v`).join('&');
    const { nextCalled, res } = await run(makeCtx({ url: `https://example.com/api/v1/foo?${params}` }));
    expect(nextCalled).toBe(false);
    expect(res).toBeDefined();
    if (res) {
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string; limit: number; observed: number };
      expect(body.error).toBe('too_many_query_params');
      expect(body.limit).toBe(50);
      expect(body.observed).toBe(60);
    }
  });

  it('rejects an oversized query value with a validation_error 400', async () => {
    const big = 'x'.repeat(2000);
    const { nextCalled, res } = await run(makeCtx({ url: `https://example.com/api/v1/foo?q=${big}` }));
    expect(nextCalled).toBe(false);
    expect(res).toBeDefined();
    if (res) {
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string; fields: Record<string, string> };
      expect(body.error).toBe('validation_error');
      expect(body.fields.q).toMatch(/value too long/);
    }
  });

  it('rejects an oversized Content-Length on a POST with 413', async () => {
    const { nextCalled, res } = await run(
      makeCtx({
        method: 'POST',
        url: 'https://example.com/api/v1/x',
        contentType: 'application/json',
        contentLength: '1000000',
        body: '{}',
      })
    );
    expect(nextCalled).toBe(false);
    expect(res).toBeDefined();
    if (res) {
      expect(res.status).toBe(413);
      const body = (await res.json()) as { error: string; limit_bytes: number; observed_bytes: number };
      expect(body.error).toBe('body_too_large');
      expect(body.limit_bytes).toBe(256 * 1024);
      expect(body.observed_bytes).toBe(1_000_000);
    }
  });

  it('rejects a JSON body that exceeds the byte cap with 413', async () => {
    // Content-Length absent (or lying), body actually huge.
    const big = JSON.stringify({ blob: 'x'.repeat(300_000) });
    const { nextCalled, res } = await run(
      makeCtx({
        method: 'POST',
        url: 'https://example.com/api/v1/x',
        contentType: 'application/json',
        body: big,
      })
    );
    expect(nextCalled).toBe(false);
    expect(res).toBeDefined();
    if (res) expect(res.status).toBe(413);
  });

  it('rejects malformed JSON with 400', async () => {
    const { nextCalled, res } = await run(
      makeCtx({
        method: 'POST',
        url: 'https://example.com/api/v1/x',
        contentType: 'application/json',
        body: '{not valid',
      })
    );
    expect(nextCalled).toBe(false);
    expect(res).toBeDefined();
    if (res) {
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('invalid_json');
    }
  });

  it('rejects a JSON scalar (string) at the top level with 400', async () => {
    const { nextCalled, res } = await run(
      makeCtx({
        method: 'POST',
        url: 'https://example.com/api/v1/x',
        contentType: 'application/json',
        body: '"a string"',
      })
    );
    expect(nextCalled).toBe(false);
    expect(res).toBeDefined();
    if (res) {
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('json_must_be_object_or_array');
    }
  });

  it('rejects a JSON object deeper than maxDepth with 400', async () => {
    let nested: unknown = 'leaf';
    for (let i = 0; i < 15; i += 1) nested = { n: nested };
    const { nextCalled, res } = await run(
      makeCtx({
        method: 'POST',
        url: 'https://example.com/api/v1/x',
        contentType: 'application/json',
        body: JSON.stringify(nested),
      })
    );
    expect(nextCalled).toBe(false);
    expect(res).toBeDefined();
    if (res) {
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string; max_depth: number };
      expect(body.error).toBe('json_too_deep');
      expect(body.max_depth).toBe(10);
    }
  });

  it('accepts a JSON object exactly at maxDepth', async () => {
    let nested: unknown = 'leaf';
    for (let i = 0; i < 10; i += 1) nested = { n: nested };
    const { nextCalled } = await run(
      makeCtx({
        method: 'POST',
        url: 'https://example.com/api/v1/x',
        contentType: 'application/json',
        body: JSON.stringify(nested),
      })
    );
    expect(nextCalled).toBe(true);
  });

  it('respects a custom maxBodyBytes override', async () => {
    let nextCalled = false;
    const mw = looseValidation({ maxBodyBytes: 50 });
    const c = makeCtx({
      method: 'POST',
      url: 'https://example.com/api/v1/x',
      contentType: 'application/json',
      body: JSON.stringify({ blob: 'a'.repeat(100) }),
    });
    const res = (await mw(c as never, async () => {
      nextCalled = true;
    })) as Response;
    expect(nextCalled).toBe(false);
    expect(res.status).toBe(413);
    const body = (await res.json()) as { limit_bytes: number };
    expect(body.limit_bytes).toBe(50);
  });

  it('does not buffer the body for non-JSON content types like octet-stream', async () => {
    // Malware vault upload uses octet-stream; we want looseValidation
    // to defer to the per-route size cap and not interfere. With a
    // reasonable content-type and body, the request should pass through.
    const { nextCalled, res } = await run(
      makeCtx({
        method: 'POST',
        url: 'https://example.com/api/v1/malware-vault',
        contentType: 'application/octet-stream',
        body: 'binary-data',
      })
    );
    expect(nextCalled).toBe(true);
    expect(res).toBeUndefined();
  });

  it('still enforces the content-length cap on non-JSON bodies', async () => {
    // Even binary uploads must not be 50 MB — the cap is a worker
    // safety net independent of the route's own size check.
    const { nextCalled, res } = await run(
      makeCtx({
        method: 'POST',
        url: 'https://example.com/api/v1/malware-vault',
        contentType: 'application/octet-stream',
        contentLength: '1000000',
        body: '',
      })
    );
    expect(nextCalled).toBe(false);
    expect(res).toBeDefined();
    if (res) expect(res.status).toBe(413);
  });
});
