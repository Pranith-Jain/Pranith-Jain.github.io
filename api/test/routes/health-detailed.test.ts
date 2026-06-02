import { describe, it, expect } from 'vitest';
import { SELF } from 'cloudflare:test';

/**
 * Tests for the consolidated /api/v1/health/detailed endpoint.
 *
 * The handler is best tested through SELF.fetch (the full Hono app
 * stack) because the real value of the endpoint is the way it
 * assembles binding status + per-dep probes into a single response.
 * The pool's per-test miniflare isolates don't have D1 / Vectorize /
 * AI bindings configured (the `wrangler.toml` for tests only declares
 * KV_CACHE + BRIEFINGS_DB), so probes for the unbound deps will fail.
 * The endpoint is supposed to report that — `status: 'down'` when a
 * critical binding is missing — so we assert on the structure rather
 * than success.
 */
describe('GET /api/v1/health/detailed', () => {
  it('returns 200 or 503 with binding + probe metadata', async () => {
    const res = await SELF.fetch('https://example.com/api/v1/health/detailed');
    // 503 is acceptable — a critical binding may be missing in the
    // test pool. The shape is what we're asserting.
    expect([200, 503]).toContain(res.status);
    const body = (await res.json()) as {
      ok: boolean;
      status: 'ok' | 'degraded' | 'down';
      generated_at: string;
      bindings: { list: Array<{ key: string; tier: string; bound: boolean }>; missing_critical: string[] };
      probes: { d1: { ok: boolean }; kv: { ok: boolean }; ai: { ok: boolean }; vectorize: { ok: boolean } };
    };
    expect(typeof body.ok).toBe('boolean');
    expect(['ok', 'degraded', 'down']).toContain(body.status);
    expect(typeof body.generated_at).toBe('string');
    expect(Array.isArray(body.bindings.list)).toBe(true);
    expect(body.bindings.list.length).toBeGreaterThan(0);
    // Each binding row has the documented shape.
    for (const row of body.bindings.list) {
      expect(typeof row.key).toBe('string');
      expect(['critical', 'optional']).toContain(row.tier);
      expect(typeof row.bound).toBe('boolean');
    }
    expect(body.probes.d1).toHaveProperty('ok');
    expect(body.probes.kv).toHaveProperty('ok');
  });
});
