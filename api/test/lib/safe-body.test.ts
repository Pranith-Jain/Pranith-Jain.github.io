import { describe, it, expect } from 'vitest';
import { safeJsonBody } from '../../src/lib/safe-body';

// Minimal Context stub — safeJsonBody only touches c.req.text() and c.json().
function makeCtx(rawBody: string): {
  req: { text: () => Promise<string> };
  json: (body: unknown, status?: number, headers?: Record<string, string>) => Response;
} {
  return {
    req: { text: async () => rawBody },
    json: (body, status = 200, headers = {}) =>
      new Response(JSON.stringify(body), { status, headers: { ...headers, 'content-type': 'application/json' } }),
  };
}

describe('safeJsonBody', () => {
  it('returns the typed value for a valid small payload', async () => {
    const c = makeCtx(JSON.stringify({ slug: 'x', body: 'hello' }));
    const r = await safeJsonBody<{ slug: string; body: string }>(c as never, { maxBytes: 1024 });
    expect('value' in r).toBe(true);
    if ('value' in r) expect(r.value.slug).toBe('x');
  });

  it('rejects bodies over maxBytes with 413', async () => {
    const big = 'x'.repeat(5_000);
    const c = makeCtx(JSON.stringify({ data: big }));
    const r = await safeJsonBody(c as never, { maxBytes: 1024 });
    expect('error' in r).toBe(true);
    if ('error' in r) {
      expect(r.error.status).toBe(413);
      const body = (await r.error.json()) as { error: string; limit_bytes: number };
      expect(body.error).toBe('body too large');
      expect(body.limit_bytes).toBe(1024);
    }
  });

  it('rejects invalid JSON with 400', async () => {
    const c = makeCtx('{not json');
    const r = await safeJsonBody(c as never, { maxBytes: 1024 });
    expect('error' in r).toBe(true);
    if ('error' in r) expect(r.error.status).toBe(400);
  });

  it('rejects JSON deeper than maxDepth with 400', async () => {
    // Build a nested object 15 levels deep.
    let nested: unknown = 'leaf';
    for (let i = 0; i < 15; i += 1) nested = { n: nested };
    const c = makeCtx(JSON.stringify(nested));
    const r = await safeJsonBody(c as never, { maxBytes: 4096, maxDepth: 5 });
    expect('error' in r).toBe(true);
    if ('error' in r) {
      expect(r.error.status).toBe(400);
      const body = (await r.error.json()) as { error: string; max_depth: number };
      expect(body.error).toMatch(/deeply nested/);
      expect(body.max_depth).toBe(5);
    }
  });

  it('accepts JSON exactly at maxDepth', async () => {
    let nested: unknown = 'leaf';
    for (let i = 0; i < 5; i += 1) nested = { n: nested };
    const c = makeCtx(JSON.stringify(nested));
    const r = await safeJsonBody(c as never, { maxBytes: 4096, maxDepth: 5 });
    expect('value' in r).toBe(true);
  });

  it('handles arrays in the depth check', async () => {
    const arr = [[[[['deep']]]]];
    const c = makeCtx(JSON.stringify(arr));
    const r = await safeJsonBody(c as never, { maxBytes: 1024, maxDepth: 3 });
    expect('error' in r).toBe(true);
  });
});
