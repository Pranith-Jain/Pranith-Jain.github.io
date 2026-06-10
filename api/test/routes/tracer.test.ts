import { SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { withTestApiKey } from '../test-helpers';

// The tracer routes are public-read (NOT admin-gated). But the global
// `external-only` auth gate's OPEN_PUBLIC_READS valve only opens for GET/HEAD,
// so keyless POSTs to /api/v1/* still 401 in the test env. POST tests therefore
// sign with a fresh test key via withTestApiKey() (same as every other POST
// route test, e.g. phishing/intel-bundle). The GET /label test stays keyless to
// prove public-read still holds for reads.
describe('POST /api/v1/tracer/expand', () => {
  it('400s on missing chain', async () => {
    const f = await withTestApiKey();
    const r = await f('https://x/api/v1/tracer/expand', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: '0x28C6c06298d514Db089934071355E5743Bf21d60' }),
    });
    expect(r.status).toBe(400);
  });

  it('400s on an unsupported chain enum', async () => {
    const f = await withTestApiKey();
    const r = await f('https://x/api/v1/tracer/expand', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: 'x', chain: 'dogecoin' }),
    });
    expect(r.status).toBe(400);
  });

  it('returns a root node with risk + candidate edges for an EVM address', async () => {
    const f = await withTestApiKey();
    const r = await f('https://x/api/v1/tracer/expand', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: '0x28C6c06298d514Db089934071355E5743Bf21d60', chain: 'evm' }),
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as {
      root: { address: string; risk: { level: string }; category: string };
      nodes: unknown[];
      edges: { confidence: string }[];
      generated_at: string;
    };
    expect(body.root.category).toBe('exchange');
    expect(body.root.risk.level).toBe('low');
    expect(Array.isArray(body.nodes)).toBe(true);
    for (const e of body.edges) expect(e.confidence).toBe('candidate');
    expect(typeof body.generated_at).toBe('string');
  });
});

describe('GET /api/v1/tracer/label', () => {
  it('resolves a curated mixer label', async () => {
    const r = await SELF.fetch(
      'https://x/api/v1/tracer/label?address=0x722122dF12D4e14e13Ac3b6895a86e84145b6967&chain=evm'
    );
    expect(r.status).toBe(200);
    const body = (await r.json()) as { label: { category: string } | null; risk: { level: string } };
    expect(body.label?.category).toBe('mixer');
    expect(body.risk.level).toBe('critical');
  });
});

import { Hono } from 'hono';
import { env as testEnv } from 'cloudflare:test';
import { requireAdminMiddleware } from '../../src/lib/admin-auth';
import { validate } from '../../src/lib/validate';
import { tracerLabelAddSchema, tracerExpandSchema } from '../../src/lib/validation-schemas';
import { tracerLabelAddHandler, tracerExpandHandler } from '../../src/routes/tracer';

// Mini-app mirroring api/src/index.ts wiring (admin gate on /tracer/labels; expand is public).
function adminApp() {
  const a = new Hono<any>();
  a.use('/api/v1/tracer/labels', requireAdminMiddleware);
  a.post('/api/v1/tracer/labels', validate('json', tracerLabelAddSchema), tracerLabelAddHandler);
  a.post('/api/v1/tracer/expand', validate('json', tracerExpandSchema), tracerExpandHandler);
  return a;
}
const adminEnv = (): any => ({ ...testEnv, ADMIN_TOKEN: 'sekret' });

describe('POST /api/v1/tracer/labels (admin, mini-app)', () => {
  it('401 without an admin token', async () => {
    const r = await adminApp().request(
      '/api/v1/tracer/labels',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          address: '0xabc0000000000000000000000000000000000001',
          chain: 'evm',
          label: 'X',
          category: 'exchange',
        }),
      },
      adminEnv()
    );
    expect(r.status).toBe(401);
  });

  it('inserts a label with admin token and expand reflects it', async () => {
    const addr = '0xabc0000000000000000000000000000000000002';
    const add = await adminApp().request(
      '/api/v1/tracer/labels',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', Authorization: 'Bearer sekret' },
        body: JSON.stringify({ address: addr, chain: 'evm', label: 'My Tagged Mixer', category: 'mixer' }),
      },
      adminEnv()
    );
    expect(add.status).toBe(201);

    const exp = await adminApp().request(
      '/api/v1/tracer/expand',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ address: addr, chain: 'evm' }),
      },
      adminEnv()
    );
    expect(exp.status).toBe(200);
    const body = (await exp.json()) as { root: { label: string | null; category: string; risk: { level: string } } };
    expect(body.root.label).toBe('My Tagged Mixer');
    expect(body.root.category).toBe('mixer');
    expect(body.root.risk.level).toBe('critical');
  });
});

describe('GET /api/v1/tracer/calldata', () => {
  it('400s on missing hash', async () => {
    const r = await SELF.fetch('https://x/api/v1/tracer/calldata?chain=evm');
    expect(r.status).toBe(400);
  });

  it('returns an analysis envelope for a lookup (clean when tx not found)', async () => {
    const r = await SELF.fetch('https://x/api/v1/tracer/calldata?chain=evm&hash=0xdeadbeef');
    expect(r.status).toBe(200);
    const body = (await r.json()) as { analysis: { verdict: string; flags: string[] } };
    expect(typeof body.analysis.verdict).toBe('string');
    expect(Array.isArray(body.analysis.flags)).toBe(true);
  });
});
