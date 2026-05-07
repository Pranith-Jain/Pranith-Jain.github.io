import { SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

const BUNDLE = {
  type: 'bundle',
  id: 'bundle--abc',
  objects: [
    { type: 'intrusion-set', id: 'intrusion-set--1', name: 'APT-X', aliases: [], primary_motivation: 'espionage' },
    { type: 'indicator', id: 'indicator--1', pattern: "[ipv4-addr:value = '1.2.3.4']", labels: ['malicious-activity'] },
  ],
};

describe('POST /api/v1/cti/parse', () => {
  it('rejects empty body', async () => {
    const r = await SELF.fetch('https://x/api/v1/cti/parse', { method: 'POST', body: '' });
    expect(r.status).toBe(400);
  });
  it('rejects non-bundle JSON', async () => {
    const r = await SELF.fetch('https://x/api/v1/cti/parse', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'not-a-bundle' }),
    });
    expect(r.status).toBe(400);
  });
  it('parses valid bundle', async () => {
    const r = await SELF.fetch('https://x/api/v1/cti/parse', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(BUNDLE),
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as Record<string, unknown>;
    expect((body.actors as unknown[]).length).toBe(1);
    expect((body.indicators as unknown[]).length).toBe(1);
  });
});
