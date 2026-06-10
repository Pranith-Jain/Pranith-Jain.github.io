// Proves the global looseValidation 256KB body cap EXEMPTS multipart uploads
// (so report/ingest can receive files) while still capping oversized
// non-multipart bodies. Mini-app pattern mirrors report.test.ts — isolates the
// middleware under test from the prod admin/key gates (which are covered
// elsewhere; report/ingest is admin-gated in prod by ADMIN_GATED_PREFIXES).
import { Hono } from 'hono';
import { describe, it, expect, vi } from 'vitest';
import { looseValidation } from '../../src/lib/loose-validate';
import { reportIngestHandler } from '../../src/routes/report-ingest';

function app() {
  const a = new Hono();
  a.use('/api/v1/*', looseValidation());
  a.post('/api/v1/report/ingest', reportIngestHandler);
  return a;
}

// Minimal env: no BRIEFINGS_DB (handler then skips executionCtx.waitUntil),
// AI mocked (not exercised by a text upload).
const env = (): any => ({ AI: { run: vi.fn() } });

function multipartReq(bytes: Uint8Array, type: string, name: string): Request {
  const fd = new FormData();
  fd.set('file', new File([bytes], name, { type }));
  return new Request('https://x/api/v1/report/ingest', { method: 'POST', body: fd });
}

describe('report/ingest — looseValidation multipart exemption', () => {
  it('does NOT 413 a >256KB multipart upload (exemption holds)', async () => {
    const text = new TextEncoder().encode('IOC 1.2.3.4\n'.repeat(40_000)); // ~480KB > 256KB
    const r = await app().request(multipartReq(text, 'text/plain', 'big.txt'), undefined, env());
    expect(r.status).not.toBe(413);
  });

  it('DOES 413 an oversized non-multipart body (cap is actually active)', async () => {
    const bigJson = JSON.stringify({ blob: 'a'.repeat(300 * 1024) }); // ~300KB JSON
    const r = await app().request(
      new Request('https://x/api/v1/report/ingest', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: bigJson,
      }),
      undefined,
      env()
    );
    expect(r.status).toBe(413);
  });
});
