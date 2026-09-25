/**
 * Regression test: /api/v1/exposure/check must be registered on the app.
 * The handler existed in routes/exposure-check.ts but was never wired in
 * index.ts, so the SPA got {"error":"not_found","message":"route not found"}.
 * Hits the real worker via SELF; Sec-Fetch-Site: same-origin exercises the
 * same-origin auth exemption the browser SPA relies on.
 */
import { describe, it, expect } from 'vitest';
import { SELF } from 'cloudflare:test';

describe('exposure/check app wiring', () => {
  it('serves the exposure check for same-origin reads', async () => {
    const r = await SELF.fetch('https://x/api/v1/exposure/check?domain=capgemini.com', {
      headers: { 'Sec-Fetch-Site': 'same-origin' },
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as { domain?: string; verdict?: string };
    expect(body.domain).toBe('capgemini.com');
    expect(body.verdict).toBeDefined();
  });
});
