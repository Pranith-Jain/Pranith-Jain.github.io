/**
 * Tests for the OpenCVE Cloud route (/api/v1/opencve/cve/:id).
 * Upstream is mocked; OPENCVE_API_TOKEN is injected via env.
 * Run from the repo root with the api workers pool (sandbox disabled).
 * CI skips test/routes/.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../src/env';
import { opencveRouter } from '../../src/routes/opencve';
import { normalizeOpencveCve } from '../../src/lib/opencve';

function setup() {
  const app = new Hono<{ Bindings: Env }>();
  app.route('/api/v1', opencveRouter);
  return app;
}

function mockCtx() {
  return { waitUntil: (_p: Promise<unknown>) => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;
}

function makeEnv(token?: string): Env {
  return { OPENCVE_API_TOKEN: token } as unknown as Env;
}

beforeEach(() => vi.restoreAllMocks());

describe('opencve route', () => {
  it('returns 503 when the token is not configured', async () => {
    const r = await setup().request('/api/v1/opencve/cve/CVE-2024-3094', {}, makeEnv(), mockCtx());
    expect(r.status).toBe(503);
  });

  it('returns 400 for a malformed CVE id', async () => {
    const r = await setup().request('/api/v1/opencve/cve/not-a-cve', {}, makeEnv('tok'), mockCtx());
    expect(r.status).toBe(400);
  });

  it('returns the normalized CVE on upstream success', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          cve_id: 'CVE-2024-3094',
          summary: 'Backdoor in XZ Utils.',
          metrics: { cvss31: 10.0 },
          kev: true,
          vendors: [{ name: 'tukaani' }],
          weaknesses: ['CWE-78'],
          references: [{ url: 'https://example.invalid/advisory' }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );
    const r = await setup().request('/api/v1/opencve/cve/CVE-2024-3094', {}, makeEnv('tok'), mockCtx());
    expect(r.status).toBe(200);
    const body = (await r.json()) as { cve: { cve_id: string; kev: boolean; vendors: string[] } };
    expect(body.cve.cve_id).toBe('CVE-2024-3094');
    expect(body.cve.kev).toBe(true);
    expect(body.cve.vendors).toEqual(['tukaani']);
  });

  it('returns 404 when upstream has no such CVE', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('{}', { status: 404 }));
    const r = await setup().request('/api/v1/opencve/cve/CVE-2099-0001', {}, makeEnv('tok'), mockCtx());
    expect(r.status).toBe(404);
  });
});

describe('normalizeOpencveCve', () => {
  it('probes alias fields defensively', () => {
    const out = normalizeOpencveCve({
      id: 'CVE-2024-3094',
      description: 'Backdoor.',
      cvss: { cvss_v31: 9.8 },
      cwes: ['78'],
      refs: ['https://example.invalid/'],
    });
    expect(out.cve_id).toBe('CVE-2024-3094');
    expect(out.summary).toBe('Backdoor.');
    expect(out.cvss31).toBe(9.8);
    expect(out.weaknesses).toEqual(['CWE-78']);
    expect(out.references).toEqual(['https://example.invalid/']);
  });
});
