import { env } from 'cloudflare:test';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildGlobalPulseSync } from '../../src/routes/global-pulse/handler';
import { GP_FEEDS, gpWarmKey } from '../../src/routes/global-pulse/config';

afterEach(() => vi.unstubAllGlobals());

/**
 * Regression: the map lost whole layers for hours at a time (IOC, exploit,
 * GHSA, secret-leak, malicious-package, infostealer, honeypot, rss all
 * rendering 0 while their `gp:warm:*` slices sat fully populated in KV).
 *
 * Cause: the handler ran TWO builds in one invocation. The `?force=1`
 * duplicate did 28 UNgated `Promise.all` KV reads plus ~19 self-fetch
 * fallbacks while `buildGlobalPulseSync` did its own ~37 — together over the
 * free-plan 50-subrequest cap. `buildGlobalPulseSync` lost the race: its reads
 * threw "Too many subrequests by single Worker invocation" and every layer it
 * hadn't reached yet rendered 0, with no error surfacing in the payload.
 *
 * The invariant pinned here: a populated warm slice MUST produce a non-zero
 * layer. That is the thing the duplicate build silently broke.
 */

const TM = {
  generated_at: new Date().toISOString(),
  total_ips: 2,
  countries: [
    { countryCode: 'CN', country: 'China', count: 354, sources: { urlhaus: 354 } },
    { countryCode: 'US', country: 'United States', count: 120, sources: { threatfox: 120 } },
  ],
};

const EXPLOIT = {
  total: 1,
  query_type: 'latest',
  query: '',
  timestamp: new Date().toISOString(),
  results: [{ description: 'Queue-budget regression fixture', type: 'remote', platform: 'linux', date: '2026-10-01' }],
};

const GHSA = {
  total: 1,
  query: '',
  query_type: 'recent',
  timestamp: new Date().toISOString(),
  advisories: [
    {
      ghsa_id: 'GHSA-fixture-0001',
      summary: 'Advisory fixture',
      severity: 'high',
      published_at: '2026-10-01T00:00:00Z',
      vulnerabilities: [{ package: { ecosystem: 'npm', name: 'fixture-pkg' } }],
    },
  ],
};

describe('buildGlobalPulseSync warm-slice coverage', () => {
  it('turns every populated gp:warm slice into a non-zero layer', async () => {
    // 502 for every upstream: keeps the external fetchers cheap and empty so
    // the assertions below are attributable to the warm slices alone.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 502 }))
    );

    const kv = env.KV_CACHE as unknown as {
      put: (k: string, v: string, o?: unknown) => Promise<void>;
    };
    await kv.put(gpWarmKey('tm'), JSON.stringify(TM));
    await kv.put(gpWarmKey('exploit'), JSON.stringify(EXPLOIT));
    await kv.put(gpWarmKey('ghsa'), JSON.stringify(GHSA));

    // `full: true` is what the DO's 30-min rebuild and the cron nudge pass
    // via ?force=1 — the path that used to run the duplicate build alongside
    // this one and starve it.
    const { payload } = await buildGlobalPulseSync(env as never, undefined, true);

    expect(payload.layers.ioc_activity).toBe(2);
    expect(payload.layers.exploit).toBe(1);
    expect(payload.layers.github_advisory).toBe(1);

    // The slice keys themselves must be registered feeds — guards against a
    // rename that would silently orphan a warm slice nobody ever reads again.
    for (const key of ['tm', 'exploit', 'ghsa']) {
      expect(GP_FEEDS.map((f) => f.key)).toContain(key);
    }
  }, 30_000);

  it('does not throw when every upstream is down (degraded map, not a failed build)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 502 }))
    );
    const { payload } = await buildGlobalPulseSync(env as never, undefined, true);
    // The shape must still be a complete, serializable response — a build that
    // throws leaves the previous (possibly degraded) map cached for hours.
    expect(Array.isArray(payload.events)).toBe(true);
    expect(typeof payload.generated_at).toBe('string');
    expect(payload.layers).toBeTypeOf('object');
  }, 30_000);
});
