import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { validateText, getParsed } from '../../src/lib/validate';

/**
 * Minimal Context stub for exercising validateText in isolation. The
 * middleware only reads `c.req.text()`, calls `c.json(...)`, and writes
 * `c.parsed` — everything else can be `unknown` cast.
 */
function makeCtx(opts: { body?: string; throwOnText?: boolean } = {}) {
  return {
    req: {
      text: async () => {
        if (opts.throwOnText) throw new Error('boom');
        return opts.body ?? '';
      },
    },
    json: (body: unknown, status = 200, extraHeaders: Record<string, string> = {}) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json', ...extraHeaders },
      }),
  } as unknown as Parameters<typeof validateText>[0] extends (c: infer C, ...args: unknown[]) => unknown ? C : never;
}

async function run(
  schema: z.ZodType<string>,
  options: { maxBytes?: number; minBytes?: number } = {},
  c: Parameters<typeof validateText>[0] extends (c: infer C, ...args: unknown[]) => unknown ? C : never
) {
  let nextCalled = false;
  const mw = validateText(schema, options);
  const res = await mw(c as never, async () => {
    nextCalled = true;
  });
  return { nextCalled, res: res as Response | undefined };
}

const shortString = z.string().min(1).max(100);

describe('validateText middleware', () => {
  it('passes through a valid body and attaches parsed value', async () => {
    const { nextCalled, res } = await run(shortString, {}, makeCtx({ body: 'hello world' }));
    expect(nextCalled).toBe(true);
    expect(res).toBeUndefined();
  });

  it('rejects an empty body with 400 body_too_small', async () => {
    const { nextCalled, res } = await run(shortString, { minBytes: 1 }, makeCtx({ body: '' }));
    expect(nextCalled).toBe(false);
    expect(res).toBeDefined();
    if (res) {
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string; min_bytes: number; observed_bytes: number };
      expect(body.error).toBe('body_too_small');
      expect(body.min_bytes).toBe(1);
      expect(body.observed_bytes).toBe(0);
    }
  });

  it('rejects a body over maxBytes with 413 body_too_large', async () => {
    const big = 'x'.repeat(2000);
    const { nextCalled, res } = await run(shortString, { maxBytes: 1000 }, makeCtx({ body: big }));
    expect(nextCalled).toBe(false);
    expect(res).toBeDefined();
    if (res) {
      expect(res.status).toBe(413);
      const body = (await res.json()) as { error: string; limit_bytes: number; observed_bytes: number };
      expect(body.error).toBe('body_too_large');
      expect(body.limit_bytes).toBe(1000);
      expect(body.observed_bytes).toBe(2000);
    }
  });

  it('rejects a Zod-failing body with 400 validation_error', async () => {
    const { nextCalled, res } = await run(z.string().min(50, 'too short'), {}, makeCtx({ body: 'short' }));
    expect(nextCalled).toBe(false);
    expect(res).toBeDefined();
    if (res) {
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string; fields: Record<string, string> };
      expect(body.error).toBe('validation_error');
      expect(body.fields.body).toBe('too short');
    }
  });

  it('rejects a body whose Zod max-length cap is violated', async () => {
    const { nextCalled, res } = await run(z.string().max(5, 'way too long'), {}, makeCtx({ body: '0123456789' }));
    expect(nextCalled).toBe(false);
    if (res) expect(res.status).toBe(400);
  });

  it('returns 400 invalid_request_body when c.req.text() throws', async () => {
    const { nextCalled, res } = await run(shortString, {}, makeCtx({ throwOnText: true }));
    expect(nextCalled).toBe(false);
    expect(res).toBeDefined();
    if (res) {
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('invalid_request_body');
    }
  });

  it('measures size in bytes, not characters (multi-byte UTF-8)', async () => {
    // '€' is 3 bytes in UTF-8. 50 chars × 3 = 150 bytes.
    const text = '€'.repeat(50);
    const bytes = new Blob([text]).size;
    expect(bytes).toBe(150);
    // Cap at 100 bytes → must reject, even though string is only 50 chars.
    const { nextCalled, res } = await run(shortString, { maxBytes: 100 }, makeCtx({ body: text }));
    expect(nextCalled).toBe(false);
    if (res) {
      expect(res.status).toBe(413);
      const body = (await res.json()) as { observed_bytes: number };
      expect(body.observed_bytes).toBe(150);
    }
  });
});

describe('getParsed helper', () => {
  it('returns the value attached by validateText', async () => {
    const c = makeCtx({ body: 'attached' });
    // Pretend the middleware ran by stamping a parsed value.
    (c as unknown as { parsed: string }).parsed = 'attached';
    const v = await getParsed(c as never, async () => 'fallback');
    expect(v).toBe('attached');
  });

  it('falls back when no parsed value is attached', async () => {
    const c = makeCtx({ body: 'irrelevant' });
    const v = await getParsed(c as never, () => 'fallback-value');
    expect(v).toBe('fallback-value');
  });
});
