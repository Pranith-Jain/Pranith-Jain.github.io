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
