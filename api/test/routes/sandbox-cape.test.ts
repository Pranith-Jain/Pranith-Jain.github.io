import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { capeSubmitHandler, capeTaskHandler, capeReportHandler, MAX_UPLOAD_BYTES } from '../../src/routes/sandbox-cape';
import { looseValidation } from '../../src/lib/loose-validate';

function app() {
  const a = new Hono<any>();
  a.post('/api/v1/cape/submit', capeSubmitHandler);
  a.get('/api/v1/cape/task/:id', capeTaskHandler);
  a.get('/api/v1/cape/report/:id', capeReportHandler);
  return a;
}

const configured = (): any => ({
  ADMIN_TOKEN: 'sekret',
  CAPE_BRIDGE_URL: 'https://cape.example.com',
  CAPE_BRIDGE_TOKEN: 'tok',
});
const unconfigured = (): any => ({ ADMIN_TOKEN: 'sekret' });

function fileForm(bytes: Uint8Array, name = 'evil.exe'): FormData {
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: 'application/octet-stream' }), name);
  return form;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/v1/cape/submit', () => {
  it('returns 401 without an admin token', async () => {
    const r = await app().request(
      '/api/v1/cape/submit',
      { method: 'POST', body: fileForm(new Uint8Array([1, 2, 3])) },
      configured()
    );
    expect(r.status).toBe(401);
  });

  it('returns 503 with a setup hint when the bridge is unconfigured', async () => {
    const r = await app().request(
      '/api/v1/cape/submit',
      { method: 'POST', headers: { Authorization: 'Bearer sekret' } },
      unconfigured()
    );
    expect(r.status).toBe(503);
    const body = (await r.json()) as { error: string; setup?: string };
    expect(body.setup).toMatch(/CAPE_BRIDGE_URL/);
  });

  it('forwards the file to CAPE and returns the task id', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/tasks/create/file/')) {
        return new Response(JSON.stringify({ error: false, data: { task_ids: [4242] } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response('not found', { status: 404 });
    });

    const r = await app().request(
      '/api/v1/cape/submit',
      { method: 'POST', headers: { Authorization: 'Bearer sekret' }, body: fileForm(new Uint8Array([1, 2, 3])) },
      configured()
    );
    expect(r.status).toBe(200);
    const body = (await r.json()) as { task_id: number };
    expect(body.task_id).toBe(4242);
    expect(String(spy.mock.calls[0]?.[0])).toBe('https://cape.example.com/apiv2/tasks/create/file/');
  });

  it('returns 400 when no file part is present', async () => {
    const r = await app().request(
      '/api/v1/cape/submit',
      { method: 'POST', headers: { Authorization: 'Bearer sekret' }, body: new FormData() },
      configured()
    );
    expect(r.status).toBe(400);
  });

  it('returns 413 when the file exceeds the size limit', async () => {
    const r = await app().request(
      '/api/v1/cape/submit',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer sekret' },
        body: fileForm(new Uint8Array(MAX_UPLOAD_BYTES + 1024 * 1024)),
      },
      configured()
    );
    expect(r.status).toBe(413);
  });
});

describe('GET /api/v1/cape/task/:id', () => {
  it('returns 401 without an admin token', async () => {
    const r = await app().request('/api/v1/cape/task/12', {}, configured());
    expect(r.status).toBe(401);
  });

  it('returns the task status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: false, data: { id: 12, status: 'reported' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    const r = await app().request(
      '/api/v1/cape/task/12',
      { headers: { Authorization: 'Bearer sekret' } },
      configured()
    );
    expect(r.status).toBe(200);
    const body = (await r.json()) as { id: number; status: string };
    expect(body).toEqual({ id: 12, status: 'reported' });
  });
});

describe('GET /api/v1/cape/report/:id', () => {
  it('returns a normalized report with extracted IOCs', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          info: { score: 8.5 },
          signatures: [{ name: 'antidbg', severity: 3 }],
          target: { file: { name: 'evil.exe', sha256: 'a'.repeat(64) } },
          network: { domains: [{ domain: 'evil.test' }], hosts: ['1.2.3.4'] },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );
    const r = await app().request(
      '/api/v1/cape/report/100',
      { headers: { Authorization: 'Bearer sekret' } },
      configured()
    );
    expect(r.status).toBe(200);
    const body = (await r.json()) as { task_id: number; score: number; verdict: string; iocs: { domains: string[] } };
    expect(body.task_id).toBe(100);
    expect(body.verdict).toBe('malicious');
    expect(body.iocs.domains).toContain('evil.test');
  });
});

describe('CAPE submit through the global looseValidation middleware', () => {
  function appWithMiddleware() {
    const a = new Hono<any>();
    a.use('/api/v1/*', looseValidation());
    a.post('/api/v1/cape/submit', capeSubmitHandler);
    return a;
  }

  it('lets a multipart sample larger than the 256 KB text cap reach the handler', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: false, data: { task_ids: [7] } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    const r = await appWithMiddleware().request(
      '/api/v1/cape/submit',
      { method: 'POST', headers: { Authorization: 'Bearer sekret' }, body: fileForm(new Uint8Array(512 * 1024)) },
      configured()
    );
    expect(r.status).toBe(200);
    const body = (await r.json()) as { task_id: number };
    expect(body.task_id).toBe(7);
  });

  it('still rejects an oversize non-multipart JSON body with 413 (text cap intact)', async () => {
    const big = JSON.stringify({ blob: 'x'.repeat(300 * 1024) });
    const r = await appWithMiddleware().request(
      '/api/v1/cape/submit',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer sekret', 'content-type': 'application/json' },
        body: big,
      },
      configured()
    );
    expect(r.status).toBe(413);
  });
});
