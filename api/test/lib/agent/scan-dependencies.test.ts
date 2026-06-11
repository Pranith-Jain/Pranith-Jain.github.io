import { describe, it, expect } from 'vitest';
import { buildToolRegistry } from '../../../src/lib/agent/tools';
import { osvScanSchema } from '../../../src/lib/validation-schemas';
import type { AgentTool } from '../../../src/lib/agent/types';

// Fake Fetcher (self) that captures the outgoing Request and returns a canned OK body.
function captureSelf() {
  const calls: { url: string; method: string; body: unknown }[] = [];
  const self = {
    fetch: async (req: Request) => {
      const body = req.body
        ? await req
            .clone()
            .json()
            .catch(() => undefined)
        : undefined;
      calls.push({ url: req.url, method: req.method, body });
      return new Response(JSON.stringify({ generated_at: 'now', total_packages: 0, results: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  } as unknown as Fetcher;
  return { self, calls };
}

function tool(): AgentTool {
  const t = buildToolRegistry().find((x) => x.name === 'scan_dependencies');
  if (!t) throw new Error('scan_dependencies tool not registered');
  return t;
}

describe('scan_dependencies agent tool', () => {
  it('is registered with a single required `packages` string param', () => {
    const t = tool();
    expect(t.params).toEqual([{ name: 'packages', type: 'string', description: expect.any(String), required: true }]);
    expect(t.description.toLowerCase()).toContain('eco:name@ver');
  });

  it('parses lines + commas into a body that mirrors osvScanSchema exactly', async () => {
    const { self, calls } = captureSelf();
    const t = buildToolRegistry(self).find((x) => x.name === 'scan_dependencies')!;
    await t.execute({ packages: 'npm:left-pad@1.3.0\nnpm:lodash@4.17.21, PyPI:requests' });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toContain('/api/v1/osv/scan');
    expect(calls[0]!.method).toBe('POST');
    // The body MUST satisfy osvScanSchema or validate('json') 400s the valid request.
    const parsed = osvScanSchema.safeParse(calls[0]!.body);
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.packages).toEqual([
      { name: 'left-pad', ecosystem: 'npm', version: '1.3.0' },
      { name: 'lodash', ecosystem: 'npm', version: '4.17.21' },
      { name: 'requests', ecosystem: 'PyPI' },
    ]);
  });

  it('omits version when none is given (no empty-string version)', async () => {
    const { self, calls } = captureSelf();
    const t = buildToolRegistry(self).find((x) => x.name === 'scan_dependencies')!;
    await t.execute({ packages: 'npm:left-pad' });
    const body = calls[0]!.body as { packages: Array<Record<string, unknown>> };
    expect(body.packages[0]).toEqual({ name: 'left-pad', ecosystem: 'npm' });
    expect('version' in body.packages[0]!).toBe(false);
    expect(osvScanSchema.safeParse(calls[0]!.body).success).toBe(true);
  });

  it('rejects zero valid specs WITHOUT fetching', async () => {
    const { self, calls } = captureSelf();
    const t = buildToolRegistry(self).find((x) => x.name === 'scan_dependencies')!;
    await expect(t.execute({ packages: '   ,, \n  ' })).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });
});
