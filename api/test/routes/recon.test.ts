import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { reconScanHandler } from '../../src/routes/recon';

function app() {
  const a = new Hono<any>();
  a.post('/api/v1/recon/scan', reconScanHandler);
  return a;
}

const configured = (): any => ({
  ADMIN_TOKEN: 'sekret',
  RECON_BRIDGE_URL: 'https://recon.example.com',
  RECON_BRIDGE_TOKEN: 'tok',
});
const unconfigured = (): any => ({ ADMIN_TOKEN: 'sekret' });

function post(body: unknown, env: any, auth = true) {
  return app().request(
    '/api/v1/recon/scan',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(auth ? { Authorization: 'Bearer sekret' } : {}) },
      body: JSON.stringify(body),
    },
    env
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/v1/recon/scan', () => {
  it('returns 401 without an admin token', async () => {
    const r = await post({ tool: 'subfinder', target: 'example.com' }, configured(), false);
    expect(r.status).toBe(401);
  });

  it('returns 503 with a setup hint when the bridge is unconfigured', async () => {
    const r = await post({ tool: 'subfinder', target: 'example.com' }, unconfigured());
    expect(r.status).toBe(503);
    const body = (await r.json()) as { setup?: string };
    expect(body.setup).toMatch(/RECON_BRIDGE_URL/);
  });

  it('returns 400 for an unsupported tool', async () => {
    const r = await post({ tool: 'nmap', target: 'example.com' }, configured());
    expect(r.status).toBe(400);
  });

  it('returns 400 for a malformed target', async () => {
    const r = await post({ tool: 'subfinder', target: 'not a domain; rm -rf' }, configured());
    expect(r.status).toBe(400);
  });

  it('rejects a leading-dash target (argument injection)', async () => {
    for (const target of ['-config', '-rf', '--passive', 'example.com-']) {
      const r = await post({ tool: 'subfinder', target }, configured());
      expect(r.status).toBe(400);
    }
  });

  it('runs recon and returns the normalized result', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ subdomains: ['a.example.com'], hosts: [], emails: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    const r = await post({ tool: 'subfinder', target: 'example.com' }, configured());
    expect(r.status).toBe(200);
    const body = (await r.json()) as { tool: string; subdomains: string[]; count: number };
    expect(body.tool).toBe('subfinder');
    expect(body.subdomains).toEqual(['a.example.com']);
    expect(body.count).toBe(1);
    expect(String(spy.mock.calls[0]?.[0])).toBe('https://recon.example.com/recon');
  });
});
