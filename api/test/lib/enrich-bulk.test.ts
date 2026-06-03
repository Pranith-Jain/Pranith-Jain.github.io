import { describe, it, expect, vi, afterEach } from 'vitest';
import { env as testEnv } from 'cloudflare:test';
import { enrichBulk, MAX_IOCS_TO_ENRICH } from '../../src/lib/enrich-bulk';
import type { Indicator } from '../../src/providers/types';
import type { Env } from '../../src/env';

// The vitest-pool-workers `env` ships only the bindings declared in
// `api/wrangler.toml`; cast to the runtime `Env` for the unit-test surface.
const env = testEnv as unknown as Env;

const fixtureIocs = (n: number): Indicator[] => {
  const out: Indicator[] = [];
  for (let i = 0; i < n; i++) {
    if (i % 5 === 0) out.push({ type: 'hash', value: `${i.toString(16).padStart(64, '0')}` });
    else if (i % 5 === 1) out.push({ type: 'url', value: `https://example-${i}.test/path` });
    else if (i % 5 === 2) out.push({ type: 'domain', value: `bad-${i}.example` });
    else if (i % 5 === 3) out.push({ type: 'ipv4', value: `192.0.2.${i % 254}` });
    else out.push({ type: 'email', value: `attacker-${i}@example.test` });
  }
  return out;
};

describe('enrichBulk (budget + prioritization)', () => {
  it('caps the number of IoCs enriched at MAX_IOCS_TO_ENRICH', async () => {
    const iocs = fixtureIocs(MAX_IOCS_TO_ENRICH + 5);
    const r = await enrichBulk(iocs, env, { maxFresh: 0 });
    expect(r.enrichments).toHaveLength(MAX_IOCS_TO_ENRICH);
    expect(r.overflow).toHaveLength(5);
    expect(r.partial).toBe(true);
  });

  it('prioritizes hash > url > domain > ipv4 > ipv6 > email', async () => {
    const iocs: Indicator[] = [
      { type: 'email', value: 'a@b.test' },
      { type: 'ipv6', value: '2001:db8::1' },
      { type: 'ipv4', value: '192.0.2.1' },
      { type: 'domain', value: 'bad.example' },
      { type: 'url', value: 'https://bad.example/x' },
      { type: 'hash', value: 'd'.repeat(64) },
    ];
    // Cap enrichments to 3 — should pick hash, url, domain in that order.
    const r = await enrichBulk(iocs, env, { maxIocs: 3, maxFresh: 0 });
    const types = r.enrichments.map((e) => e.type);
    expect(types).toEqual(['hash', 'url', 'domain']);
    expect(r.overflow.map((o) => o.type)).toEqual(['ipv4', 'ipv6', 'email']);
  });

  it('returns enrichments even when fresh-subrequest budget is zero (cache-only path)', async () => {
    const iocs = fixtureIocs(3);
    const r = await enrichBulk(iocs, env, { maxFresh: 0 });
    // Without fresh calls and a cold cache, every result has 0 contributing providers
    // — but the indicators are still emitted so the STIX bundle can carry them.
    expect(r.enrichments).toHaveLength(3);
    for (const e of r.enrichments) {
      expect(e.contributing).toBe(0);
      expect(e.verdict).toBe('unknown');
      expect(e.listedIn).toEqual([]);
      // providerScores is always present (empty array when no ok results).
      expect(e.providerScores).toEqual([]);
    }
    expect(r.freshSubrequests).toBe(0);
  });

  it('does NOT flip partial when only subrequest budget is dropped (no IoC overflow)', async () => {
    const r = await enrichBulk(fixtureIocs(2), env, { maxFresh: 0 });
    // Subrequest budget being maxed out is the steady state for any real
    // briefing with 20+ IoCs across 4-5 free providers — surfacing the
    // partial badge in that case just trains users to ignore it. The
    // bundle still carries every IoC; only provider depth is shallow.
    expect(r.partial).toBe(false);
    expect(r.overflow).toEqual([]);
    // The shortfall is still observable via droppedSubrequests for ops.
    expect(r.droppedSubrequests).toBeGreaterThan(0);
  });

  it('handles empty input', async () => {
    const r = await enrichBulk([], env);
    expect(r.enrichments).toEqual([]);
    expect(r.overflow).toEqual([]);
    expect(r.partial).toBe(false);
    expect(r.freshSubrequests).toBe(0);
  });

  describe('subrequest budget honesty', () => {
    afterEach(() => vi.restoreAllMocks());

    it('emits every chosen IoC even beyond the cache-read cap', async () => {
      // maxPrimeReads below the IoC count: the un-primed tail is still emitted
      // (shallow) so the STIX bundle carries every indicator.
      const r = await enrichBulk(fixtureIocs(30), env, { maxPrimeReads: 5, maxFresh: 0 });
      expect(r.enrichments).toHaveLength(30);
    });

    it('keeps reads + 2·fetches within the cap (writes ≤ fetches)', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
      const cap = 30;
      const primeReads = 12;
      const r = await enrichBulk(fixtureIocs(40), env, {
        maxSubrequests: cap,
        maxPrimeReads: primeReads,
        maxFresh: 99, // let the budget, not this, be the binding constraint
      });
      const primed = Math.min(40, primeReads, cap);
      // Each accepted fetch slot costs weight+1 (write reserve), so even the
      // weighted fetch total stays under the remaining budget.
      expect(r.freshSubrequests).toBeLessThanOrEqual(cap - primed);
      // Every chosen IoC is still represented.
      expect(r.enrichments).toHaveLength(40);
    });

    it('a zero cap makes zero fresh subrequests but still emits IoCs', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
      const r = await enrichBulk(fixtureIocs(4), env, { maxSubrequests: 0, maxFresh: 99 });
      expect(r.freshSubrequests).toBe(0);
      expect(r.enrichments).toHaveLength(4);
    });
  });
});
