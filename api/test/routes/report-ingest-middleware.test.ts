// api/test/routes/report-ingest-middleware.test.ts
// Mounts the REAL looseValidation + admin gate exactly as api/src/index.ts wires
// them (mini-app pattern, mirroring report.test.ts — avoids the full app's
// separate API-key gate). Proves:
//   1. the looseValidation 256KB body cap does NOT 413 a multipart upload,
//   2. the handler's own 10MB cap still applies,
//   3. the admin gate rejects an unauthenticated request.
import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { looseValidation } from '../../src/lib/loose-validate';
import { requireAdminMiddleware } from '../../src/lib/admin-auth';
import { reportIngestHandler } from '../../src/routes/report-ingest';

const ADMIN = 'sekret';

function app() {
  const a = new Hono<any>();
  a.use('/api/v1/*', looseValidation());
  a.use('/api/v1/report', requireAdminMiddleware);
  a.use('/api/v1/report/*', requireAdminMiddleware);
  a.post('/api/v1/report/ingest', reportIngestHandler);
  return a;
}

const env = (): any => ({ ADMIN_TOKEN: ADMIN, AI: { run: vi.fn() } });

function send(bytes: Uint8Array, type: string, name: string, auth = true) {
  const fd = new FormData();
  fd.set('file', new File([bytes], name, { type }));
  return app().request(
    '/api/v1/report/ingest',
    { method: 'POST', headers: auth ? { Authorization: `Bearer ${ADMIN}` } : {}, body: fd },
    env()
  );
}

describe('report/ingest middleware', () => {
  it('401s without an admin token (report prefix is admin-gated)', async () => {
    const res = await send(new TextEncoder().encode('hi'), 'text/plain', 'a.txt', false);
    expect(res.status).toBe(401);
  });

  it('does not 413 a >256KB multipart text upload (looseValidation multipart exemption)', async () => {
    // Benign text → no IOCs extracted → enrichment fan-out is a no-op (fast, no network).
    const text = new TextEncoder().encode('lorem ipsum dolor sit amet\n'.repeat(12_000)); // ~324KB > 256KB
    const res = await send(text, 'text/plain', 'big.txt');
    expect(res.status).not.toBe(413);
  });

  it('still 413s a >10MB upload via the handler cap', async () => {
    const big = new Uint8Array(11 * 1024 * 1024);
    const res = await send(big, 'text/plain', 'big.txt');
    expect(res.status).toBe(413);
  });
});
