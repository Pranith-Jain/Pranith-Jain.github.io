// api/test/routes/report-ingest.test.ts
import { describe, it, expect, vi } from 'vitest';
import { reportIngestHandler } from '../../src/routes/report-ingest';

// Minimal Hono-like context stub. The handler only uses req.formData(), env, and json().
function ctx(form: FormData, env: Record<string, unknown> = {}) {
  return {
    req: { formData: async () => form },
    env: { AI: { run: vi.fn() }, ...env },
    executionCtx: { waitUntil: () => {} },
    json: (body: unknown, s = 200) => new Response(JSON.stringify(body), { status: s }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function fileForm(bytes: Uint8Array, type: string, name: string): FormData {
  const fd = new FormData();
  fd.set('file', new File([bytes], name, { type }));
  return fd;
}

describe('reportIngestHandler', () => {
  it('415s an unsupported file', async () => {
    const c = ctx(fileForm(new Uint8Array([0x50, 0x4b, 0x03, 0x04]), 'application/zip', 'a.zip'));
    const res = await reportIngestHandler(c);
    expect(res.status).toBe(415);
  });

  it('400s when no file field is present', async () => {
    const res = await reportIngestHandler(ctx(new FormData()));
    expect(res.status).toBe(400);
  });

  it('503s a PDF when no bridge is configured', async () => {
    const c = ctx(fileForm(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]), 'application/pdf', 'r.pdf'));
    const res = await reportIngestHandler(c);
    expect(res.status).toBe(503);
  });

  it('413s a file over the size cap', async () => {
    const big = new Uint8Array(11 * 1024 * 1024); // 11 MB
    const c = ctx(fileForm(big, 'text/plain', 'big.txt'));
    const res = await reportIngestHandler(c);
    expect(res.status).toBe(413);
  });
});
