import { SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

describe('GET /api/v1/atlas/technique', () => {
  it('rejects missing param', async () => {
    const r = await SELF.fetch('https://x/api/v1/atlas/technique');
    expect(r.status).toBe(400);
    const body = (await r.json()) as { error?: string };
    expect(body.error).toContain('missing');
  });

  it('rejects invalid technique ID format', async () => {
    const r = await SELF.fetch('https://x/api/v1/atlas/technique?technique=invalid');
    expect(r.status).toBe(400);
    const body = (await r.json()) as { error?: string };
    expect(body.error).toContain('invalid');
  });
});
