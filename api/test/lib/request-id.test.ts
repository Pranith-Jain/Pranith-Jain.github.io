import { describe, it, expect } from 'vitest';
import { requestId, getRequestId } from '../../src/lib/request-id';

/**
 * Minimal Hono-Context stub for exercising requestId in isolation.
 * The middleware only reads `c.req.header(name)`, `c.set(k, v)`, and
 * mutates `c.res.headers`; everything else can be `unknown` cast.
 */
function makeCtx(opts: { method?: string; url?: string; header?: string | null } = {}) {
  const headers = new Map<string, string>();
  if (opts.header) headers.set('x-request-id', opts.header);
  const resHeaders = new Map<string, string>();
  return {
    req: {
      url: opts.url ?? 'https://example.com/api/v1/foo',
      method: opts.method ?? 'GET',
      header: (name: string) => headers.get(name.toLowerCase()) ?? undefined,
    },
    res: {
      headers: {
        set: (k: string, v: string) => resHeaders.set(k.toLowerCase(), v),
        get: (k: string) => resHeaders.get(k.toLowerCase()),
      },
    },
    set: (k: 'requestId', v: string) => {
      if (k === 'requestId') {
        // No-op storage: getRequestId reads via c.get below.
        (ctx as unknown as Record<string, unknown>).requestId = v;
      }
    },
    get: (k: 'requestId') => (ctx as unknown as Record<string, unknown>)[k],
  } as unknown as Parameters<typeof requestId>[0];
}

type AnyCtx = Parameters<typeof requestId>[0];
let ctx: AnyCtx;

async function runMiddleware(mw: (c: any, next: () => Promise<void>) => Promise<unknown>, c: any) {
  let nextCalled = false;
  await mw(c, async () => {
    nextCalled = true;
  });
  return nextCalled;
}

describe('requestId middleware', () => {
  it('generates a 32-char hex id when no inbound header is present', async () => {
    ctx = makeCtx();
    const calledNext = await runMiddleware(requestId, ctx);
    expect(calledNext).toBe(true);
    const id = getRequestId(ctx);
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    // Header reflected on response.
    expect(ctx.res.headers.get('x-request-id')).toBe(id);
  });

  it('respects a valid inbound x-request-id', async () => {
    const inbound = 'caller-supplied-id-1234567890';
    ctx = makeCtx({ header: inbound });
    await runMiddleware(requestId, ctx);
    expect(getRequestId(ctx)).toBe(inbound);
    expect(ctx.res.headers.get('x-request-id')).toBe(inbound);
  });

  it('rejects malformed inbound ids and falls back to a fresh one', async () => {
    // 'bad id' contains a space and is too short; the regex /^[a-zA-Z0-9_-]{8,128}$/
    // requires no spaces and at least 8 chars.
    ctx = makeCtx({ header: 'bad id' });
    await runMiddleware(requestId, ctx);
    const id = getRequestId(ctx);
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(id).not.toBe('bad id');
  });

  it('generates distinct ids across two requests', async () => {
    ctx = makeCtx();
    await runMiddleware(requestId, ctx);
    const first = getRequestId(ctx);

    ctx = makeCtx();
    await runMiddleware(requestId, ctx);
    const second = getRequestId(ctx);

    expect(first).not.toBe(second);
  });
});
